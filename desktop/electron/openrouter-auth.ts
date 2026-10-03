// "Sign in with OpenRouter": OpenRouter's OAuth PKCE flow issues an API key for this app after the person approves it
// in their browser, so nobody copies a key by hand. https://openrouter.ai/docs/use-cases/oauth-pkce
// The browser returns to a one-time server on this computer (loopback only), which takes the code; the key exchange
// then proves it is the same app with the PKCE verifier. The key never passes through the renderer.
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth';
export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys';
const SIGN_IN_MS = 300_000;

const base64url = (data: Buffer) => data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function pkcePair() {
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: base64url(createHash('sha256').update(verifier).digest()) };
}

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#222">` +
  `<h1 style="font-size:1.3rem">${title}</h1><p>${body}</p></body>`;

export type OpenRouterSignInOptions = {
  openExternal: (url: string) => Promise<void>;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  /** Development tests only: a fake OpenRouter. */
  authUrl?: string;
  keysUrl?: string;
  timeoutMs?: number;
  /** Tests pass 0 for any free port. */
  port?: number;
};

/** Opens OpenRouter's sign-in page and resolves with the API key it issues for this app. */
export async function openRouterSignIn(options: OpenRouterSignInOptions): Promise<string> {
  const { verifier, challenge } = pkcePair();
  const state = base64url(randomBytes(16));
  let server: Server | undefined;
  let timer: NodeJS.Timeout | undefined;
  const fetcher = options.fetcher || fetch;
  try {
    const code = await new Promise<string>((resolve, reject) => {
      server = createServer((request, response) => {
        const url = new URL(request.url || '/', 'http://localhost');
        if (url.pathname !== `/callback/${state}`) {
          response.writeHead(404).end();
          return;
        }
        const received = url.searchParams.get('code') || '';
        // The random path segment turns away a stray request to the port; OpenRouter returns to the exact callback URL.
        const ok = Boolean(received && /^[\w.~-]{1,500}$/.test(received));
        response
          .writeHead(ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
          .end(
            ok
              ? page('เชื่อม OpenRouter แล้ว · OpenRouter connected', 'กลับไปที่ STeP Desktop ได้เลย · You can return to STeP Desktop.')
              : page('เชื่อม OpenRouter ไม่สำเร็จ · Sign-in failed', 'ลองใหม่จาก STeP Desktop · Please try again from STeP Desktop.'),
          );
        if (ok) resolve(received);
        else reject(new Error('OPENROUTER_SIGNIN_FAILED'));
      });
      timer = setTimeout(() => reject(new Error('OPENROUTER_SIGNIN_TIMEOUT')), options.timeoutMs ?? SIGN_IN_MS);
      options.signal?.addEventListener('abort', () => reject(new Error('CANCELLED')), { once: true });
      if (options.signal?.aborted) return reject(new Error('CANCELLED'));
      // OpenRouter documents http://localhost:3000 for apps on the person's computer; another free port is the fallback.
      const listen = (port: number) =>
        server!.listen(port, '127.0.0.1', () => {
          const callback = new URL(`http://localhost:${(server!.address() as AddressInfo).port}/callback/${state}`);
          const auth = new URL(options.authUrl || OPENROUTER_AUTH_URL);
          auth.searchParams.set('callback_url', callback.href);
          auth.searchParams.set('code_challenge', challenge);
          auth.searchParams.set('code_challenge_method', 'S256');
          options.openExternal(auth.href).catch(() => reject(new Error('OPENROUTER_SIGNIN_FAILED')));
        });
      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && options.port === undefined) listen(0);
        else reject(new Error('OPENROUTER_SIGNIN_FAILED'));
      });
      listen(options.port ?? 3000);
    });
    let response: Response;
    try {
      response = await fetcher(options.keysUrl || OPENROUTER_KEYS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
        redirect: 'error',
        signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(options.signal ? [options.signal] : [])]),
      });
    } catch {
      throw new Error(options.signal?.aborted ? 'CANCELLED' : 'PROVIDER_NETWORK_FAILED');
    }
    const body = (await response.json().catch(() => ({}))) as { key?: unknown };
    if (!response.ok || typeof body.key !== 'string' || !body.key || body.key.length > 500) throw new Error('OPENROUTER_SIGNIN_FAILED');
    return body.key;
  } finally {
    clearTimeout(timer);
    server?.close();
    server?.closeAllConnections?.();
  }
}
