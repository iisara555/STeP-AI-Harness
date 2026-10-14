import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID, createPublicKey, verify } from 'node:crypto';
import type { Store } from './store';
import { Vault } from './vault';
import { GOOGLE_SERVICES, googleScopes, type GoogleService } from '../src/google-services';
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
type Identity = { sub: string; email: string; hd: string };
type Context = { check: () => Promise<void>; approve: (title: string, body: string) => Promise<boolean>; signal: AbortSignal };
function reject(code: string): never {
  throw new Error(code);
}
/** Bounded JSON transport with redirect denial; upstream diagnostics and credential-bearing bodies stay private. */
export async function googleJson(url: string, init: RequestInit = {}, transport = fetch) {
  let response: Response;
  try {
    response = await transport(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.any([init.signal || new AbortController().signal, AbortSignal.timeout(20000)]),
    });
  } catch {
    reject(init.signal?.aborted ? 'CANCELLED' : 'GOOGLE_REQUEST_FAILED');
  }
  if (!response.ok) {
    if (response.status === 401) reject('GOOGLE_REAUTH_REQUIRED');
    if (response.status === 403) reject('GOOGLE_ACCESS_DENIED');
    if (response.status === 429) reject('GOOGLE_QUOTA_LIMIT');
    reject('GOOGLE_REQUEST_FAILED');
  }
  if (response.status === 204) return {};
  const reader = response.body?.getReader();
  if (!reader) reject('GOOGLE_RESPONSE_INVALID');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 1000000) reject('GOOGLE_OUTPUT_LIMIT');
      chunks.push(part.value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) reject('GOOGLE_RESPONSE_INVALID');
    return data;
  } catch (error) {
    reject(
      ['GOOGLE_OUTPUT_LIMIT', 'GOOGLE_RESPONSE_INVALID'].includes((error as Error).message)
        ? (error as Error).message
        : 'GOOGLE_RESPONSE_INVALID',
    );
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function googleIdentity(token: string, clientId: string, nonce: string, transport = fetch): Promise<Identity> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || token.length > 20000) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error();
    const keys = await googleJson('https://www.googleapis.com/oauth2/v3/certs', {}, transport);
    const jwk = keys.keys?.find((k: any) => k.kid === header.kid && k.kty === 'RSA' && k.alg === 'RS256');
    if (
      !jwk ||
      !verify(
        'RSA-SHA256',
        Buffer.from(parts[0] + '.' + parts[1]),
        createPublicKey({ key: jwk, format: 'jwk' }),
        Buffer.from(parts[2], 'base64url'),
      )
    )
      throw new Error();
    if (
      !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) ||
      claims.aud !== clientId ||
      (claims.azp && claims.azp !== clientId) ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= Date.now() / 1000 ||
      claims.nonce !== nonce ||
      typeof claims.sub !== 'string' ||
      !/^\d{1,100}$/.test(claims.sub) ||
      claims.email_verified !== true ||
      typeof claims.email !== 'string' ||
      typeof claims.hd !== 'string'
    )
      throw new Error();
    return { sub: claims.sub, email: claims.email, hd: claims.hd.toLowerCase() };
  } catch {
    reject('GOOGLE_IDENTITY_INVALID');
  }
}
export async function googleAuthorize(
  config: GoogleConfig,
  scopes: string[],
  open: (url: string) => Promise<void>,
  signal: AbortSignal,
  transport = fetch,
  identity = googleIdentity,
) {
  const state = randomBytes(32).toString('base64url'),
    nonce = randomBytes(32).toString('base64url'),
    verifier = randomBytes(48).toString('base64url');
  const path = '/oauth/' + randomUUID();
  let done: (code: string) => void = () => {},
    fail: (e: Error) => void = () => {},
    consumed = false;
  const code = new Promise<string>((resolve, rejectCode) => {
    done = resolve;
    fail = rejectCode;
  });
  // Attach rejection handling before opening the browser so a cancelled launch never creates an unhandled rejection.
  void code.catch(() => {});
  const server = createServer((req, res) => {
    const parsed = new URL(req.url || '/', 'http://127.0.0.1');
    if (
      req.method !== 'GET' ||
      parsed.pathname !== path ||
      req.headers.host !== `127.0.0.1:${port}` ||
      parsed.searchParams.getAll('state').length !== 1 ||
      parsed.searchParams.get('state') !== state ||
      consumed
    ) {
      res.writeHead(400);
      res.end('Invalid authorization response.');
      return;
    }
    consumed = true;
    res.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'",
      'referrer-policy': 'no-referrer',
    });
    res.end('Return to STeP Desktop.');
    if (parsed.searchParams.has('error'))
      fail(new Error(parsed.searchParams.get('error') === 'admin_policy_enforced' ? 'GOOGLE_ADMIN_BLOCKED' : 'GOOGLE_CONSENT_DENIED'));
    else if (
      parsed.searchParams.getAll('code').length !== 1 ||
      !parsed.searchParams.get('code') ||
      parsed.searchParams.get('code')!.length > 4096
    )
      fail(new Error('GOOGLE_CALLBACK_INVALID'));
    else done(parsed.searchParams.get('code')!);
  });
  let port = 0;
  const stop = () => fail(new Error('CANCELLED'));
  try {
    await new Promise<void>((resolve, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    port = (server.address() as { port: number }).port;
    signal.addEventListener('abort', stop, { once: true });
    const redirect = `http://127.0.0.1:${port}${path}`;
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'select_account consent',
      hd: config.domains.length === 1 ? config.domains[0] : '*',
    }).toString();
    if (signal.aborted) reject('CANCELLED');
    await open(auth.toString());
    const timeout = setTimeout(() => fail(new Error('GOOGLE_AUTH_TIMEOUT')), 180000);
    let received: string;
    try {
      received = await code;
    } finally {
      clearTimeout(timeout);
    }
    const tokens = await googleJson(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          code: received,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: redirect,
        }),
        signal,
      },
      transport,
    );
    if (
      typeof tokens.id_token !== 'string' ||
      typeof tokens.access_token !== 'string' ||
      typeof tokens.refresh_token !== 'string' ||
      typeof tokens.scope !== 'string' ||
      tokens.token_type?.toLowerCase() !== 'bearer' ||
      !Number.isFinite(tokens.expires_in) ||
      tokens.expires_in <= 0
    )
      reject('GOOGLE_RESPONSE_INVALID');
    const who = await identity(tokens.id_token, config.clientId, nonce, transport);
    if (!config.domains.includes(who.hd)) reject('GOOGLE_ORGANIZATION_DENIED');
    return {
      who,
      scopes: tokens.scope.split(' ').filter((s: string) => scopes.includes(s)),
      tokens: { refresh: tokens.refresh_token, access: tokens.access_token, expires: Date.now() + tokens.expires_in * 1000 } as Tokens,
    };
  } finally {
    signal.removeEventListener('abort', stop);
    server.close();
    server.closeAllConnections();
  }
}

/** Employee identity, token lifecycle and fixed Google operations; the model never receives a token. */
export class GoogleWorkspace {
  private epoch = 0;
  private connecting?: AbortController;
  private refreshes = new Map<string, Promise<Tokens>>();
  private handles = new Map<string, { account: string; context: string; epoch: number; expires: number }>();
  constructor(
    private store: Store,
    private vault: Vault,
    private config: () => GoogleConfig | undefined,
    private open: (url: string) => Promise<void>,
    private transport = fetch,
    private authorize = googleAuthorize,
  ) {}
  private accounts() {
    return this.store.list<Account>('google-account');
  }
  private account(id: string) {
    const a = this.store.get<Account>('google-account', id);
    if (!a) reject('GOOGLE_ACCOUNT_NOT_FOUND');
    return a;
  }
  state() {
    return {
      configured: Boolean(this.config()?.clientId),
      services: this.config()?.services || [],
      connecting: Boolean(this.connecting),
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
  invalidate() {
    this.epoch++;
    this.handles.clear();
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
      const result = await this.authorize(
        config,
        googleScopes(services),
        this.open,
        AbortSignal.any([controller.signal, context.signal]),
        this.transport,
      );
      await context.check();
      if (epoch !== this.epoch || JSON.stringify(config) !== JSON.stringify(this.config())) reject('GOOGLE_ACCOUNT_CHANGED');
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
      return this.state();
    } finally {
      this.connecting = undefined;
    }
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
      const refreshed = await googleJson(
        'https://oauth2.googleapis.com/token',
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: a.clientId, refresh_token: value.refresh, grant_type: 'refresh_token' }),
          signal,
        },
        this.transport,
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
