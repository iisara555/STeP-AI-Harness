import { randomUUID } from 'node:crypto';
import { googleJson, googleIdentity, googleAuthorization } from './google-oauth';
export { googleJson, googleIdentity } from './google-oauth';
import type { Store } from './store';
import { Vault } from './vault';
import { GOOGLE_SERVICES, LEGACY_GOOGLE_SERVICES, googleScopes, hasGoogleScope, type GoogleService } from '../src/google-services';
import { credentialErrorsTh } from '../src/credential-copy';
import { parseGoogleDesktopClient } from './google-client';
import { bundledGoogleClientSecret } from './google-bundled-client';
import { googleInvocation, type GoogleRequest } from './google-operations';
import { googleMailContent } from './google-mail';
import { googleReadCoverage } from './google-read-coverage';
import { googleScriptContentHash } from './google-validation';

export type GoogleConfig = { clientId: string; domains: string[]; services: GoogleService[] };
type Account = {
  id: string;
  subject: string;
  label: string;
  domain: string;
  scopes: string[];
  services?: GoogleService[];
  credentialId: string;
  clientId: string;
  paused: boolean;
  revision: number;
  reauth?: boolean;
};
type Tokens = { refresh: string; access: string; expires: number; identity?: string };
type Refresh = { promise: Promise<Tokens>; controller: AbortController; waiters: number };
type Context = { check: () => Promise<void>; approve: (title: string, body: string) => Promise<boolean>; signal: AbortSignal };
function reject(code: string): never {
  throw new Error(code);
}
/** Cancel this waiter without cancelling work owned by other callers. Always consume the work's eventual rejection. */
function waitForGoogleWork<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, fail) => {
    const cancel = () => {
      signal.removeEventListener('abort', cancel);
      fail(new Error('CANCELLED'));
    };
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
    work.then(
      value => {
        signal.removeEventListener('abort', cancel);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', cancel);
        fail(error);
      },
    );
  });
}
export const googleAuthorize = (
  config: GoogleConfig & { clientSecret?: string },
  scopes: string[],
  open: (url: string) => Promise<void>,
  signal: AbortSignal,
  transport = fetch,
  identity = googleIdentity,
) => googleAuthorization(config, scopes, open, signal, transport, identity, true);

/** Employee identity, token lifecycle and fixed Google operations; the model never receives a token. */
export class GoogleWorkspace {
  private epoch = 0;
  private connecting?: AbortController;
  private connectionError?: string;
  private refreshes = new Map<string, Refresh>();
  private scriptWrites = new Map<string, Promise<boolean>>();
  private handles = new Map<string, { account: string; context: string; epoch: number; expires: number }>();
  constructor(
    private store: Store,
    private vault: Vault,
    private config: () => GoogleConfig | undefined,
    private open: (url: string) => Promise<void>,
    private transport = fetch,
    private authorize = googleAuthorize,
    private employeeSubject: () => string | undefined = () => undefined,
    private bundledClientSecret = bundledGoogleClientSecret,
  ) {}
  private accounts() {
    const subject = this.employeeSubject();
    return this.store.list<Account>('google-account').filter(account => !subject || account.subject === subject);
  }
  private account(id: string) {
    const a = this.store.get<Account>('google-account', id);
    if (!a) reject('GOOGLE_ACCOUNT_NOT_FOUND');
    const subject = this.employeeSubject();
    if (subject && a.subject !== subject) reject('GOOGLE_ACCOUNT_MISMATCH');
    return a;
  }
  private services(a: Account) {
    // Old accounts retain only their original service surface; a broad OAuth scope never opts into a new action.
    const selected =
      a.services ||
      LEGACY_GOOGLE_SERVICES.filter(s =>
        googleScopes([s])
          .slice(2)
          .every(scope => a.scopes.includes(scope)),
      );
    return selected.filter(
      s =>
        Object.hasOwn(GOOGLE_SERVICES, s) &&
        googleScopes([s])
          .slice(2)
          .some(scope => hasGoogleScope(a.scopes, scope)),
    );
  }
  private async withClientSecret<T>(clientId: string, action: (secret?: string) => Promise<T>): Promise<T> {
    const bundled = this.bundledClientSecret(clientId);
    if (bundled) return action(bundled);
    const record = this.store.get<{ credentialId: string }>('google-client', clientId);
    return record ? this.vault.use(record.credentialId, 'google-client', clientId, action) : action();
  }
  importClient(text: string) {
    if (this.connecting) reject('GOOGLE_CONNECTION_BUSY');
    if (this.vault.state().suspended) reject('VAULT_SUSPENDED');
    const config = this.config();
    if (!config?.clientId) reject('GOOGLE_NOT_CONFIGURED');
    const secret = parseGoogleDesktopClient(text, config.clientId);
    const previous = this.store.get<{ credentialId: string }>('google-client', config.clientId);
    const old = previous && this.vault.list().find(v => v.id === previous.credentialId);
    if (previous && (!old || old.kind !== 'google-client' || old.destination !== config.clientId)) reject('VAULT_INTEGRITY_ERROR');
    const entry = this.vault.save({
      ...(old ? { id: old.id, revision: old.revision } : {}),
      label: 'Google Desktop OAuth client',
      kind: 'google-client',
      destination: config.clientId,
      value: secret,
    });
    this.store.put('google-client', config.clientId, { credentialId: entry.id });
    this.invalidate();
    return this.state();
  }
  state() {
    const clientId = this.config()?.clientId;
    const clientPreconfigured = Boolean(clientId && this.bundledClientSecret(clientId));
    const client = clientId && this.store.get<{ credentialId: string }>('google-client', clientId);
    return {
      configured: Boolean(this.config()?.clientId),
      services: this.config()?.services || [],
      connecting: Boolean(this.connecting),
      connectionError: this.connectionError,
      vaultSuspended: this.vault.state().suspended,
      clientPreconfigured,
      clientSecretConfigured: Boolean(
        clientPreconfigured ||
        (client && this.vault.list().some(v => v.id === client.credentialId && v.kind === 'google-client' && v.destination === clientId)),
      ),
      accounts: this.accounts().map(a => ({
        id: a.id,
        label: a.label,
        domain: a.domain,
        services: this.services(a),
        paused: a.paused,
        reauth: Boolean(a.reauth),
      })),
    };
  }
  /**
   * Identifies one connection of one account: it changes when the account is paused, resumed, re-signed-in, removed
   * and connected again, or moved to another OAuth client, so a consent remembered against it lapses then.
   */
  consentKey(id: string) {
    const a = this.account(id);
    return [a.id, a.revision, a.clientId, a.subject].join(':');
  }
  /** A chat-read grant also expires on global invalidation (including Vault suspension/resume). */
  requestConsentKey(id: string) {
    return JSON.stringify([this.epoch, this.consentKey(id)]);
  }
  invalidate() {
    this.epoch++;
    this.handles.clear();
    this.connectionError = undefined;
    this.connecting?.abort();
    for (const refresh of this.refreshes.values()) refresh.controller.abort();
    this.refreshes.clear();
  }
  cancel() {
    this.connecting?.abort();
  }
  async connect(services: GoogleService[], context: Context, accountId?: string, identityOnly = false) {
    if (this.vault.state().suspended) reject('VAULT_SUSPENDED');
    const config = this.config();
    if (!config?.clientId || !config.domains.length) reject('GOOGLE_NOT_CONFIGURED');
    if (this.connecting) reject('GOOGLE_CONNECTION_BUSY');
    const target = accountId === undefined ? undefined : this.account(accountId);
    if (
      !Array.isArray(services) ||
      (!services.length && !identityOnly) ||
      services.length > Object.keys(GOOGLE_SERVICES).length ||
      services.some(s => !config.services.includes(s) || !Object.hasOwn(GOOGLE_SERVICES, s))
    )
      reject('GOOGLE_SERVICE_DISABLED');
    const epoch = this.epoch;
    const controller = new AbortController();
    this.connecting = controller;
    this.connectionError = undefined;
    try {
      if (
        !(await context.approve(
          'Connect Google Workspace?',
          'Services: ' +
            services.join(', ') +
            (target ? '\nAccount: ' + target.label : '') +
            '\nOrganization: ' +
            config.domains.join(', ') +
            '\nWorkspace content requires separate review before sending to AI.',
        ))
      )
        reject('CANCELLED');
      await context.check();
      const result = await this.withClientSecret(config.clientId, secret =>
        this.authorize(
          { ...config, ...(secret ? { clientSecret: secret } : {}) },
          googleScopes(services),
          this.open,
          AbortSignal.any([controller.signal, context.signal]),
          this.transport,
        ),
      );
      await context.check();
      if (controller.signal.aborted || context.signal.aborted) reject('CANCELLED');
      if (epoch !== this.epoch || JSON.stringify(config) !== JSON.stringify(this.config())) reject('GOOGLE_ACCOUNT_CHANGED');
      const subject = this.employeeSubject();
      if (subject && result.who.sub !== subject) reject('GOOGLE_ACCOUNT_MISMATCH');
      if (target && result.who.sub !== target.subject) reject('GOOGLE_ACCOUNT_MISMATCH');
      const existing = this.accounts().find(a => a.subject === result.who.sub && a.clientId === config.clientId);
      if (this.accounts().length >= 10 && !existing) reject('GOOGLE_ACCOUNT_LIMIT');
      const id = existing?.id || randomUUID();
      const destination = `${config.clientId}:${result.who.sub}`;
      const label = result.who.email.slice(0, 2) + '••••@' + result.who.hd;
      const old = existing && this.vault.list().find(v => v.id === existing.credentialId);
      const credential = this.vault.save({
        ...(old ? { id: old.id, revision: old.revision } : {}),
        label: 'Google Workspace',
        kind: 'google-oauth',
        destination,
        value: JSON.stringify(result.tokens),
      });
      const account: Account = {
        id,
        subject: result.who.sub,
        label,
        domain: result.who.hd,
        scopes: result.scopes,
        services: [...new Set(services)],
        credentialId: credential.id,
        clientId: config.clientId,
        paused: false,
        revision: (existing?.revision || 0) + 1,
      };
      this.store.put('google-account', id, account);
      this.epoch++;
      this.handles.clear();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (!controller.signal.aborted && !context.signal.aborted && code !== 'CANCELLED') {
        // Only fixed, translated codes survive a Settings remount. Never retain upstream diagnostics or credentials.
        this.connectionError = Object.hasOwn(credentialErrorsTh, code) ? code : 'GOOGLE_CONNECTION_FAILED';
      }
      throw error;
    } finally {
      this.connecting = undefined;
    }
    return this.state();
  }
  pause(id: string, paused: boolean) {
    if (typeof paused !== 'boolean') reject('INVALID_INPUT');
    const a = this.account(id);
    this.store.put('google-account', id, { ...a, paused, revision: a.revision + 1 });
    this.invalidate();
    return this.state();
  }
  catalog(context: string) {
    if (this.vault.state().suspended) reject('VAULT_SUSPENDED');
    const now = Date.now();
    for (const [id, h] of this.handles) if (h.expires < now) this.handles.delete(id);
    return this.accounts()
      .filter(a => !a.paused && !a.reauth)
      .map((a, index) => {
        if (this.handles.size >= 500) reject('GOOGLE_HANDLE_LIMIT');
        const handle = randomUUID();
        this.handles.set(handle, { account: a.id, context, epoch: this.epoch, expires: now + 300000 });
        return { handle, label: `${a.label} (${index + 1})`, services: this.services(a) };
      });
  }
  resolve(handle: string, context: string) {
    const h = this.handles.get(handle);
    if (!h || h.context !== context || h.epoch !== this.epoch || h.expires < Date.now()) reject('GOOGLE_ACCOUNT_CHANGED');
    return h.account;
  }
  private async tokens(a: Account, signal: AbortSignal, identityRequired = false): Promise<Tokens> {
    const epoch = this.epoch;
    const destination = `${a.clientId}:${a.subject}`;
    // Claim the shared refresh in the Vault sink, before yielding a decoded token snapshot to another turn.
    return this.vault.use(a.credentialId, 'google-oauth', destination, async raw => {
      const value: Tokens = JSON.parse(raw);
      if (signal.aborted) reject('CANCELLED');
      if (epoch !== this.epoch || this.account(a.id).revision !== a.revision) reject('GOOGLE_ACCOUNT_CHANGED');
      if (value.expires > Date.now() + 60000 && (!identityRequired || value.identity)) return value;
      let refresh = this.refreshes.get(a.id);
      if (!refresh) {
        const controller = new AbortController(),
          revision = a.revision;
        const work = (async () => {
          const refreshed = await this.withClientSecret(a.clientId, secret =>
            googleJson(
              'https://oauth2.googleapis.com/token',
              {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  client_id: a.clientId,
                  refresh_token: value.refresh,
                  grant_type: 'refresh_token',
                  ...(secret ? { client_secret: secret } : {}),
                }),
                signal: controller.signal,
              },
              this.transport,
            ),
          );
          if (
            typeof refreshed.access_token !== 'string' ||
            !refreshed.access_token ||
            typeof refreshed.token_type !== 'string' ||
            refreshed.token_type.toLowerCase() !== 'bearer' ||
            !Number.isFinite(refreshed.expires_in) ||
            refreshed.expires_in <= 0
          )
            reject('GOOGLE_RESPONSE_INVALID');
          if (controller.signal.aborted) reject('CANCELLED');
          if (epoch !== this.epoch || this.account(a.id).revision !== revision) reject('GOOGLE_ACCOUNT_CHANGED');
          if (this.vault.state().suspended) reject('VAULT_SUSPENDED');
          const tokens = {
            refresh: typeof refreshed.refresh_token === 'string' ? refreshed.refresh_token : value.refresh,
            access: refreshed.access_token,
            ...(typeof refreshed.id_token === 'string' ? { identity: refreshed.id_token } : {}),
            expires: Date.now() + refreshed.expires_in * 1000,
          };
          const entry = this.vault.list().find(v => v.id === a.credentialId)!;
          this.vault.save({
            id: entry.id,
            revision: entry.revision,
            label: entry.label,
            kind: 'google-oauth',
            destination,
            value: JSON.stringify(tokens),
          });
          return tokens;
        })()
          .catch(error => {
            if (
              error.message === 'GOOGLE_REAUTH_REQUIRED' &&
              !controller.signal.aborted &&
              this.store.get<Account>('google-account', a.id)?.revision === revision
            )
              this.store.put('google-account', a.id, { ...a, reauth: true, revision: a.revision + 1 });
            throw error;
          })
          .finally(() => {
            if (this.refreshes.get(a.id)?.controller === controller) this.refreshes.delete(a.id);
          });
        refresh = { promise: work, controller, waiters: 0 };
        this.refreshes.set(a.id, refresh);
      }
      refresh.waiters++;
      try {
        return await waitForGoogleWork(refresh.promise, signal);
      } finally {
        if (--refresh.waiters === 0 && this.refreshes.get(a.id) === refresh) {
          this.refreshes.delete(a.id);
          refresh.controller.abort();
        }
      }
    });
  }
  /** Only the owner may read/merge/write a project; a cancelled queue entry still waits behind its predecessor. */
  private async scriptWrite<T>(key: string, signal: AbortSignal, work: () => Promise<T>) {
    const previous = this.scriptWrites.get(key) || Promise.resolve(true);
    let release!: (known: boolean) => void,
      known = true;
    const turn = new Promise<boolean>(done => {
      release = done;
    });
    const tail = previous.then(async previousKnown => (await turn) && previousKnown);
    this.scriptWrites.set(key, tail);
    try {
      if (!(await waitForGoogleWork(previous, signal))) reject('GOOGLE_OUTCOME_UNKNOWN');
      if (signal.aborted) reject('CANCELLED');
      return await work();
    } catch (error) {
      if ((error as Error).message === 'GOOGLE_OUTCOME_UNKNOWN') known = false;
      throw error;
    } finally {
      release(known);
      void tail.then(() => {
        if (this.scriptWrites.get(key) === tail) this.scriptWrites.delete(key);
      });
    }
  }
  /** Host-only identity for the configured organization OCR service. No Workspace access/refresh token leaves the host. */
  async receiptIdentity(accountId: string, signal: AbortSignal) {
    const a = this.account(accountId),
      config = this.config(),
      epoch = this.epoch;
    const check = () => {
      if (!config || a.clientId !== config.clientId || !config.domains.includes(a.domain) || a.paused || a.reauth)
        reject('GOOGLE_ACCESS_DENIED');
      if (epoch !== this.epoch || this.account(a.id).revision !== a.revision || JSON.stringify(config) !== JSON.stringify(this.config()))
        reject('GOOGLE_ACCOUNT_CHANGED');
      signal.throwIfAborted();
    };
    check();
    const tokens = await this.tokens(a, signal, true);
    check();
    if (!tokens.identity || tokens.identity.length > 20000) reject('GOOGLE_REAUTH_REQUIRED');
    return tokens.identity;
  }
  async execute(accountId: string, input: GoogleRequest, context: Context) {
    const request = structuredClone(input);
    const invocation = googleInvocation(request);
    const a = this.account(accountId),
      config = this.config(),
      epoch = this.epoch;
    const check = async () => {
      await context.check();
      if (this.vault.state().suspended) reject('VAULT_SUSPENDED');
      if (epoch !== this.epoch || a.revision !== this.account(a.id).revision || JSON.stringify(config) !== JSON.stringify(this.config()))
        reject('GOOGLE_ACCOUNT_CHANGED');
      if (!config || a.clientId !== config.clientId || !config.domains.includes(a.domain) || a.paused || a.reauth)
        reject('GOOGLE_ACCESS_DENIED');
      const selected = this.services(a);
      if (selected.includes('drive')) selected.push('drive-read');
      if (selected.includes('calendar')) selected.push('calendar-read');
      if (!invocation.services.some(s => selected.includes(s) && config.services.includes(s))) reject('GOOGLE_SCOPE_MISSING');
      if (!invocation.scopes.some(s => hasGoogleScope(a.scopes, s))) reject('GOOGLE_SCOPE_MISSING');
      if (context.signal.aborted) reject('CANCELLED');
    };
    await check();
    // Reads disclose their source too; writes are always one-shot even in auto/accept-edits mode.
    if (
      !(await context.approve(
        invocation.write ? 'Change Google data?' : 'Read Google data?',
        a.label + '\n' + invocation.preview + '\n' + invocation.digest,
      ))
    )
      reject('CANCELLED');
    await check();
    const run = async () => {
      await check();
      const tokens = await this.tokens(a, context.signal);
      await check();
      if (invocation.preflight) {
        const current = await googleJson(
          invocation.preflight.url,
          { headers: { authorization: `Bearer ${tokens.access}` }, signal: context.signal },
          this.transport,
        );
        await check();
        if (googleScriptContentHash(current) !== invocation.preflight.contentHash) reject('GOOGLE_SOURCE_CHANGED');
        const changed = new Map((invocation.body as any).files.map((file: any) => [file.name, file]));
        const files = current.files
          .filter((file: any) => !changed.has(file.name) && !invocation.preflight!.deleteFiles.includes(file.name))
          .map(({ name, type, source = '' }: any) => ({ name, type, source }));
        files.push(...changed.values());
        if (files.length > 500 || !files.some((file: any) => file.name === 'appsscript' && file.type === 'JSON'))
          reject('INVALID_GOOGLE_INPUT');
        invocation.body = { files };
      }
      let result: any;
      try {
        result = await googleJson(
          invocation.url,
          {
            method: invocation.method,
            headers: { authorization: `Bearer ${tokens.access}`, 'content-type': invocation.contentType || 'application/json' },
            ...(invocation.payload !== undefined
              ? { body: invocation.payload }
              : invocation.body
                ? { body: JSON.stringify(invocation.body) }
                : {}),
            signal: context.signal,
          },
          this.transport,
          { response: invocation.response, timeoutMs: invocation.timeoutMs },
        );
      } catch (error) {
        if (
          invocation.write &&
          !['GOOGLE_ACCESS_DENIED', 'GOOGLE_REAUTH_REQUIRED', 'GOOGLE_QUOTA_LIMIT'].includes((error as Error).message)
        )
          reject('GOOGLE_OUTCOME_UNKNOWN');
        throw error;
      }
      try {
        await check();
      } catch {
        if (invocation.write) reject('GOOGLE_OUTCOME_UNKNOWN');
        throw new Error('GOOGLE_ACCOUNT_CHANGED');
      }
      return { result, tokens };
    };
    const response = invocation.preflight
      ? await this.scriptWrite(JSON.stringify([a.id, request.params!.scriptId]), context.signal, run)
      : await run();
    let result = response.result;
    const tokens = response.tokens;
    if (request.operation === 'gmail.get') result = googleMailContent(result);
    if (request.operation === 'gmail.threads.get')
      result = {
        id: result.id,
        messages: Array.isArray(result.messages) ? result.messages.slice(0, 50).map(googleMailContent) : [],
        ...(Array.isArray(result.messages) && result.messages.length > 50
          ? { messagesTruncated: true, totalMessages: result.messages.length }
          : {}),
      };
    if (request.operation === 'gmail.drafts.get') result = { id: result.id, message: googleMailContent(result.message || {}) };
    if (request.operation === 'gmail.attachments.getText') {
      try {
        if (typeof result.data !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(result.data)) reject('GOOGLE_RESPONSE_INVALID');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(result.data, 'base64url'));
        if (text.includes('\0')) reject('GOOGLE_TEXT_ONLY');
        result = { text, size: result.size };
      } catch {
        reject('GOOGLE_TEXT_ONLY');
      }
    }
    if (request.operation === 'appscript.run' && (result.done !== true || !result.response)) reject('GOOGLE_OUTCOME_UNKNOWN');
    if (request.operation === 'appscript.versions.create' && (!Number.isSafeInteger(result.versionNumber) || result.versionNumber < 1))
      reject('GOOGLE_OUTCOME_UNKNOWN');
    if (request.operation === 'appscript.projects.getContent') result = { ...result, contentHash: googleScriptContentHash(result) };
    if (request.operation === 'appscript.projects.updateContent') {
      // Google echoes Content for the whole project. Return an allowlisted receipt,
      // never source from unchanged files (or even the changed file) as a write side effect.
      result = {
        scriptId: result.scriptId || request.params!.scriptId,
        changedFiles: request.body!.files.map(({ name, type }: any) => ({ name, type })),
        deletedFiles: [...(request.body!.deleteFiles || [])],
        contentHash: googleScriptContentHash(Array.isArray(result.files) ? result : invocation.body),
      };
    }
    let resourceUrl: string | undefined;
    const resourceId = result.documentId || result.spreadsheetId || result.presentationId || result.formId || result.scriptId;
    if (invocation.write) {
      const reference =
        resourceId ||
        result.id ||
        result.name ||
        result.deploymentId ||
        (request.operation === 'appscript.versions.create' ? `${request.params!.scriptId}:${result.versionNumber}` : undefined);
      if (!invocation.acknowledge && (typeof reference !== 'string' || !reference || reference.length > 300))
        reject('GOOGLE_OUTCOME_UNKNOWN');
    }
    if (typeof resourceId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(resourceId)) {
      if (result.documentId) resourceUrl = `https://docs.google.com/document/d/${resourceId}/edit`;
      else if (result.spreadsheetId) resourceUrl = `https://docs.google.com/spreadsheets/d/${resourceId}/edit`;
      else if (result.presentationId) resourceUrl = `https://docs.google.com/presentation/d/${resourceId}/edit`;
      else if (result.formId) resourceUrl = `https://docs.google.com/forms/d/${resourceId}/edit`;
      else resourceUrl = `https://script.google.com/home/projects/${resourceId}/edit`;
    }
    if (!resourceUrl) {
      const family = request.operation.split('.')[0];
      const reference =
        request.params?.[
          family === 'drive'
            ? 'fileId'
            : family === 'appscript'
              ? 'scriptId'
              : family === 'forms'
                ? 'formId'
                : family === 'docs'
                  ? 'documentId'
                  : family === 'sheets'
                    ? 'spreadsheetId'
                    : family === 'slides'
                      ? 'presentationId'
                      : ''
        ] ||
        result.form?.formId ||
        (family === 'drive' ? result.id : undefined);
      if (typeof reference === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(reference)) {
        if (family === 'drive') resourceUrl = `https://drive.google.com/file/d/${reference}/view`;
        if (family === 'forms') resourceUrl = `https://docs.google.com/forms/d/${reference}/edit`;
        if (family === 'appscript') resourceUrl = `https://script.google.com/home/projects/${reference}/edit`;
        if (family === 'docs') resourceUrl = `https://docs.google.com/document/d/${reference}/edit`;
        if (family === 'sheets') resourceUrl = `https://docs.google.com/spreadsheets/d/${reference}/edit`;
        if (family === 'slides') resourceUrl = `https://docs.google.com/presentation/d/${reference}/edit`;
      }
    }
    const clean = JSON.stringify(result)
      .split(tokens.access)
      .join('[credential removed]')
      .split(tokens.refresh)
      .join('[credential removed]');
    const data = JSON.parse(clean);
    return {
      status: 'completed',
      operation: request.operation,
      retrievedAt: new Date().toISOString(),
      provenance: 'EXTRACTED_UNVERIFIED',
      trust: 'untrusted-data',
      ...(invocation.write ? { requestDigest: invocation.digest } : {}),
      ...(invocation.acknowledge ? { target: structuredClone(request.params || {}) } : {}),
      ...(resourceUrl ? { resourceUrl } : {}),
      ...(!invocation.write ? { readCoverage: googleReadCoverage(request, data) } : {}),
      data,
    };
  }
  async disconnect(id: string, revoke: boolean, context: Context) {
    const a = this.account(id),
      epoch = this.epoch;
    if (
      !(await context.approve(
        revoke ? 'Revoke Google authorization?' : 'Disconnect locally?',
        a.label + (revoke ? '\nOther devices using this OAuth grant may stop working.' : '\nGoogle authorization may remain active.'),
      ))
    )
      reject('CANCELLED');
    await context.check();
    if (epoch !== this.epoch || a.revision !== this.account(id).revision) reject('GOOGLE_ACCOUNT_CHANGED');
    if (revoke)
      await this.vault.use(a.credentialId, 'google-oauth', `${a.clientId}:${a.subject}`, async value => {
        const tokens: Tokens = JSON.parse(value);
        let response: Response;
        try {
          response = await this.transport('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: tokens.refresh }),
            redirect: 'error',
            signal: AbortSignal.any([context.signal, AbortSignal.timeout(20000)]),
          });
        } catch {
          reject('GOOGLE_REVOCATION_FAILED');
        }
        if (!response.ok) reject('GOOGLE_REVOCATION_FAILED');
      });
    await context.check();
    if (epoch !== this.epoch || a.revision !== this.account(id).revision) reject('GOOGLE_OUTCOME_UNKNOWN');
    // Write the tombstone first; an interrupted cleanup cannot restore an active account.
    this.store.transaction(() => {
      this.store.put('google-deleted', id, { at: new Date().toISOString() });
      this.store.remove('google-account', id);
    });
    const entry = this.vault.list().find(v => v.id === a.credentialId);
    if (entry) this.vault.remove(entry.id, entry.revision);
    this.invalidate();
    return { locallyDisconnected: true, remotelyRevoked: revoke };
  }
}
