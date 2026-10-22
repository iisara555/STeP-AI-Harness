import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID, createPublicKey, verify } from 'node:crypto';
export type GoogleOAuthConfig = { clientId: string; domains: string[]; clientSecret?: string };
export type GoogleIdentity = { sub: string; email: string; hd: string; name?: string };
function reject(code: string): never {
  throw new Error(code);
}
async function readGoogleResponse(response: Response, format: 'json' | 'text' = 'json') {
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
    const bytes = Buffer.concat(chunks);
    if (format === 'text') {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.includes('\0')) reject('GOOGLE_TEXT_ONLY');
      return { text, mimeType: response.headers.get('content-type')?.split(';')[0] || 'text/plain' };
    }
    const data = JSON.parse(bytes.toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) reject('GOOGLE_RESPONSE_INVALID');
    return data;
  } catch (error) {
    reject(
      ['GOOGLE_OUTPUT_LIMIT', 'GOOGLE_RESPONSE_INVALID', 'GOOGLE_TEXT_ONLY'].includes((error as Error).message)
        ? (error as Error).message
        : format === 'text'
          ? 'GOOGLE_TEXT_ONLY'
          : 'GOOGLE_RESPONSE_INVALID',
    );
  } finally {
    await reader.cancel().catch(() => {});
  }
}
/** Bounded JSON transport with redirect denial; upstream diagnostics and credential-bearing bodies stay private. */
export async function googleJson(
  url: string,
  init: RequestInit = {},
  transport = fetch,
  options: { response?: 'json' | 'text'; timeoutMs?: number } = {},
) {
  let response: Response;
  try {
    response = await transport(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.any([init.signal || new AbortController().signal, AbortSignal.timeout(options.timeoutMs || 20000)]),
    });
  } catch {
    reject(init.signal?.aborted ? 'CANCELLED' : 'GOOGLE_REQUEST_FAILED');
  }
  if (!response.ok) {
    // Recognize only Google's fixed OAuth error codes, never expose descriptions, URLs or token-bearing bodies.
    if (url === 'https://oauth2.googleapis.com/token' && [400, 401].includes(response.status)) {
      const error = await readGoogleResponse(response).catch(() => ({}));
      if (error.error === 'invalid_client' || error.error === 'unauthorized_client' || error.error === 'invalid_scope')
        reject('GOOGLE_CLIENT_CONFIGURATION');
      if (
        error.error === 'invalid_request' &&
        typeof error.error_description === 'string' &&
        /client_secret.*(?:missing|required)/i.test(error.error_description)
      )
        reject('GOOGLE_CLIENT_SECRET_REQUIRED');
      if (error.error === 'invalid_grant')
        reject(
          new URLSearchParams(String(init.body)).get('grant_type') === 'refresh_token'
            ? 'GOOGLE_REAUTH_REQUIRED'
            : 'GOOGLE_AUTH_CODE_REJECTED',
        );
    }
    if (response.status === 401) reject('GOOGLE_REAUTH_REQUIRED');
    if (response.status === 403) reject('GOOGLE_ACCESS_DENIED');
    if (response.status === 429) reject('GOOGLE_QUOTA_LIMIT');
    reject('GOOGLE_REQUEST_FAILED');
  }
  if (response.status === 204) return {};
  const data = await readGoogleResponse(response, options.response);
  if (data.error) reject('GOOGLE_RESPONSE_INVALID');
  return data;
}
export async function googleIdentity(
  token: string,
  clientId: string,
  nonce: string | undefined,
  transport = fetch,
): Promise<GoogleIdentity> {
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
      (nonce !== undefined && claims.nonce !== nonce) ||
      typeof claims.sub !== 'string' ||
      !/^\d{1,100}$/.test(claims.sub) ||
      claims.email_verified !== true ||
      typeof claims.email !== 'string' ||
      claims.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+$/.test(claims.email) ||
      typeof claims.hd !== 'string'
    )
      throw new Error();
    return {
      sub: claims.sub,
      email: claims.email,
      hd: claims.hd.toLowerCase(),
      ...(typeof claims.name === 'string' && claims.name.length <= 200 && !/[\x00-\x1f]/.test(claims.name) ? { name: claims.name } : {}),
    };
  } catch {
    reject('GOOGLE_IDENTITY_INVALID');
  }
}
export async function googleAuthorization(
  config: GoogleOAuthConfig,
  scopes: string[],
  open: (url: string) => Promise<void>,
  signal: AbortSignal,
  transport = fetch,
  identity = googleIdentity,
  offline = true,
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
    const callbackError = parsed.searchParams.has('error')
      ? parsed.searchParams.get('error') === 'admin_policy_enforced'
        ? 'GOOGLE_ADMIN_BLOCKED'
        : 'GOOGLE_CONSENT_DENIED'
      : parsed.searchParams.getAll('code').length !== 1 ||
          !parsed.searchParams.get('code') ||
          parsed.searchParams.get('code')!.length > 4096
        ? 'GOOGLE_CALLBACK_INVALID'
        : undefined;
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'",
      'referrer-policy': 'no-referrer',
    });
    res.end(
      `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>STeP Desktop · Google</title><body><main><h1>${callbackError ? 'เชื่อมบัญชี Google ไม่สำเร็จ' : 'Google ส่งผลกลับแล้ว'}</h1><p>${callbackError ? 'กลับไปที่ STeP Desktop เพื่อดูสาเหตุและลองเชื่อมใหม่' : 'การเชื่อมยังไม่เสร็จ แอปกำลังตรวจบัญชีและบันทึกการเชื่อมต่อ กลับไปที่ STeP Desktop เพื่อดูผล บัญชีจะปรากฏในหน้า บัญชีและบริการ เมื่อสำเร็จ'}</p><p lang="en">${callbackError ? 'Google authorization was not completed. Return to STeP Desktop to review the error and retry.' : 'STeP Desktop still needs to verify and save your account. Return to Accounts and services in the app to check the result.'}</p><p>ปิดแท็บนี้ได้ / You can close this tab.</p></main></body></html>`,
    );
    if (callbackError) fail(new Error(callbackError));
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
      access_type: offline ? 'offline' : 'online',
      prompt: offline ? 'select_account consent' : 'select_account',
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
          ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
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
      (offline && typeof tokens.refresh_token !== 'string') ||
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
      scopes: tokens.scope
        .split(' ')
        .map((s: string) => (s === 'https://www.googleapis.com/auth/userinfo.email' ? 'email' : s))
        .filter((s: string) => scopes.includes(s)),
      tokens: {
        refresh: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : '',
        access: tokens.access_token,
        ...(typeof tokens.id_token === 'string' ? { identity: tokens.id_token } : {}),
        expires: Date.now() + tokens.expires_in * 1000,
      },
    };
  } finally {
    signal.removeEventListener('abort', stop);
    server.close();
    server.closeAllConnections();
  }
}
