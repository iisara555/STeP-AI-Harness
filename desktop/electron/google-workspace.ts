import { randomUUID } from 'node:crypto';
import { googleJson, googleIdentity, googleAuthorization } from './google-oauth';
export { googleJson, googleIdentity } from './google-oauth';
import type { Store } from './store';
import { Vault } from './vault';
import { GOOGLE_SERVICES, googleScopes, type GoogleService } from '../src/google-services';
import { credentialErrorsTh } from '../src/credential-copy';
import { parseGoogleDesktopClient } from './google-client';
import { bundledGoogleClientSecret } from './google-bundled-client';
import { googleInvocation, type GoogleRequest } from './google-operations';

export type GoogleConfig = { clientId: string; domains: string[]; services: GoogleService[] };
type Account = {
  id: string;
  subject: string;
  label: string;
  domain: string;
  scopes: string[];
  credentialId: string;
  clientId: string;
  paused: boolean;
  revision: number;
  reauth?: boolean;
};
type Tokens = { refresh: string; access: string; expires: number };
type Context = { check: () => Promise<void>; approve: (title: string, body: string) => Promise<boolean>; signal: AbortSignal };
function reject(code: string): never {
  throw new Error(code);
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
  private refreshes = new Map<string, Promise<Tokens>>();
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
      clientPreconfigured,
      clientSecretConfigured: Boolean(
        clientPreconfigured ||
        (client && this.vault.list().some(v => v.id === client.credentialId && v.kind === 'google-client' && v.destination === clientId)),
      ),
      accounts: this.accounts().map(({ id, label, domain, scopes, paused, reauth }) => ({
        id,
        label,
        domain,
        services: Object.keys(GOOGLE_SERVICES).filter(s =>
          googleScopes([s as GoogleService])
            .slice(2)
            .every(scope => scopes.includes(scope)),
        ),
        paused,
        reauth: Boolean(reauth),
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
  invalidate() {
    this.epoch++;
    this.handles.clear();
    this.connectionError = undefined;
    this.connecting?.abort();
  }
  cancel() {
    this.connecting?.abort();
  }
  async connect(services: GoogleService[], context: Context) {
    if (this.vault.state().suspended) reject('VAULT_SUSPENDED');
    const config = this.config();
    if (!config?.clientId || !config.domains.length) reject('GOOGLE_NOT_CONFIGURED');
    if (this.connecting) reject('GOOGLE_CONNECTION_BUSY');
    if (
      !Array.isArray(services) ||
      !services.length ||
      services.length > 10 ||
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
    const now = Date.now();
    for (const [id, h] of this.handles) if (h.expires < now) this.handles.delete(id);
    return this.accounts()
      .filter(a => !a.paused && !a.reauth)
      .map(a => {
        if (this.handles.size >= 500) reject('GOOGLE_HANDLE_LIMIT');
        const handle = randomUUID();
        this.handles.set(handle, { account: a.id, context, epoch: this.epoch, expires: now + 300000 });
        return { handle, label: 'Work Google account', services: this.state().accounts.find(v => v.id === a.id)?.services };
      });
  }
  resolve(handle: string, context: string) {
    const h = this.handles.get(handle);
    if (!h || h.context !== context || h.epoch !== this.epoch || h.expires < Date.now()) reject('GOOGLE_ACCOUNT_CHANGED');
    return h.account;
  }
  private async tokens(a: Account, signal: AbortSignal): Promise<Tokens> {
    const destination = `${a.clientId}:${a.subject}`;
    const value: Tokens = await this.vault.use(a.credentialId, 'google-oauth', destination, async s => JSON.parse(s));
    if (value.expires > Date.now() + 60000) return value;
    const pending = this.refreshes.get(a.id);
    if (pending) return pending;
    const revision = a.revision;
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
            signal,
          },
          this.transport,
        ),
      );
      if (
        typeof refreshed.access_token !== 'string' ||
        refreshed.token_type?.toLowerCase() !== 'bearer' ||
        !Number.isFinite(refreshed.expires_in) ||
        refreshed.expires_in <= 0
      )
        reject('GOOGLE_REAUTH_REQUIRED');
      if (this.account(a.id).revision !== revision) reject('GOOGLE_ACCOUNT_CHANGED');
      const tokens = {
        refresh: typeof refreshed.refresh_token === 'string' ? refreshed.refresh_token : value.refresh,
        access: refreshed.access_token,
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
          ['GOOGLE_REQUEST_FAILED', 'GOOGLE_REAUTH_REQUIRED'].includes(error.message) &&
          this.store.get<Account>('google-account', a.id)?.revision === revision
        )
          this.store.put('google-account', a.id, { ...a, reauth: true, revision: a.revision + 1 });
        throw error;
      })
      .finally(() => this.refreshes.delete(a.id));
    this.refreshes.set(a.id, work);
    return work;
  }
  async execute(accountId: string, request: GoogleRequest, context: Context) {
    const invocation = googleInvocation(structuredClone(request));
    const a = this.account(accountId),
      config = this.config(),
      epoch = this.epoch;
    const check = async () => {
      await context.check();
      if (epoch !== this.epoch || a.revision !== this.account(a.id).revision || JSON.stringify(config) !== JSON.stringify(this.config()))
        reject('GOOGLE_ACCOUNT_CHANGED');
      if (!config || a.clientId !== config.clientId || !config.domains.includes(a.domain) || a.paused || a.reauth)
        reject('GOOGLE_ACCESS_DENIED');
      const allowed = googleScopes(config.services);
      if (!invocation.scopes.some(s => a.scopes.includes(s) && allowed.includes(s))) reject('GOOGLE_SCOPE_MISSING');
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
    const tokens = await this.tokens(a, context.signal);
    await check();
    let result: any;
    try {
      result = await googleJson(
        invocation.url,
        {
          method: invocation.method,
          headers: { authorization: `Bearer ${tokens.access}`, 'content-type': 'application/json' },
          ...(invocation.body ? { body: JSON.stringify(invocation.body) } : {}),
          signal: context.signal,
        },
        this.transport,
      );
    } catch (error) {
      if (invocation.write && !['GOOGLE_ACCESS_DENIED', 'GOOGLE_REAUTH_REQUIRED', 'GOOGLE_QUOTA_LIMIT'].includes((error as Error).message))
        reject('GOOGLE_OUTCOME_UNKNOWN');
      throw error;
    }
    try {
      await check();
    } catch {
      if (invocation.write) reject('GOOGLE_OUTCOME_UNKNOWN');
      throw new Error('GOOGLE_ACCOUNT_CHANGED');
    }
    if (request.operation === 'gmail.get') {
      const parts: string[] = [];
      let visited = 0;
      const extract = (part: any, depth = 0) => {
        if (!part || depth > 10 || ++visited > 50) return;
        if (part.mimeType === 'text/plain' && typeof part.body?.data === 'string')
          parts.push(Buffer.from(part.body.data, 'base64url').toString('utf8'));
        if (Array.isArray(part.parts)) for (const child of part.parts) extract(child, depth + 1);
      };
      extract(result.payload);
      result = {
        id: result.id,
        threadId: result.threadId,
        text: parts.join('\n').slice(0, 80000),
        headers: Array.isArray(result.payload?.headers)
          ? result.payload.headers
              .filter((h: any) => ['from', 'to', 'subject', 'date'].includes(String(h.name).toLowerCase()))
              .map((h: any) => ({ name: String(h.name), value: String(h.value).slice(0, 2000) }))
          : [],
        ...(parts.length ? {} : { contentUnavailable: 'No plain-text body available; open Gmail to inspect HTML/attachments.' }),
      };
      // Encoded MIME/attachment payloads must never bypass the outgoing local privacy scan.
    }
    let resourceUrl: string | undefined;
    const resourceId = result.documentId || result.spreadsheetId || result.presentationId;
    if (invocation.write) {
      const reference = resourceId || result.id || result.name;
      if (typeof reference !== 'string' || !reference || reference.length > 300) reject('GOOGLE_OUTCOME_UNKNOWN');
    }
    if (typeof resourceId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(resourceId)) {
      if (result.documentId) resourceUrl = `https://docs.google.com/document/d/${resourceId}/edit`;
      else if (result.spreadsheetId) resourceUrl = `https://docs.google.com/spreadsheets/d/${resourceId}/edit`;
      else resourceUrl = `https://docs.google.com/presentation/d/${resourceId}/edit`;
    }
    const clean = JSON.stringify(result)
      .split(tokens.access)
      .join('[credential removed]')
      .split(tokens.refresh)
      .join('[credential removed]');
    return {
      status: 'completed',
      operation: request.operation,
      retrievedAt: new Date().toISOString(),
      provenance: 'EXTRACTED_UNVERIFIED',
      trust: 'untrusted-data',
      ...(resourceUrl ? { resourceUrl } : {}),
      data: JSON.parse(clean),
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
