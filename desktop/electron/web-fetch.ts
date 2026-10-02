import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest, Agent as HttpAgent } from 'node:http';
import { request as httpsRequest, Agent as HttpsAgent } from 'node:https';
import { connect as tlsConnect } from 'node:tls';
import type { Duplex } from 'node:stream';

export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  // Accept ordinary global unicast only. Reject IPv4-mapped, local, multicast and transition ranges.
  if (isIP(address) === 6) {
    const [first, second] = address
      .toLowerCase()
      .split(':')
      .map(n => parseInt(n || '0', 16));
    return (
      first >= 0x2000 &&
      first <= 0x3fff &&
      first !== 0x2002 &&
      first !== 0x3fff &&
      !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8))
    );
  }
  return false;
}
export function publicUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('INVALID_URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    input.length > 2000 ||
    !['', '80', '443'].includes(url.port)
  )
    throw new Error('INVALID_URL');
  const host = url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (
    host === 'localhost' ||
    (!host.includes('.') && !isIP(host)) ||
    /\.(localhost|local|internal|test|invalid|onion)$/.test(host) ||
    (isIP(host) && !publicAddress(host))
  )
    throw new Error('WEB_ADDRESS_BLOCKED');
  return url;
}
type Resolve = (host: string) => Promise<{ address: string; family: number }[]>;
/** A host name that is plainly local or private without a DNS lookup (localhost, .local, a private IP literal). */
export function privateHostName(hostname: string) {
  const host = hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  return (
    host === 'localhost' ||
    (!host.includes('.') && !isIP(host)) ||
    /\.(localhost|local|internal|test|invalid|onion)$/.test(host) ||
    (isIP(host) > 0 && !publicAddress(host))
  );
}
/**
 * The assistant's browser opens public sites only, unless the organization lists an intranet host in policy
 * (network.privateHosts): a prompt-injected page must not steer it to a router, a local service or the intranet.
 */
export async function publicSite(url: URL, allowed: string[] = [], resolve?: Resolve) {
  if (allowed.includes(url.hostname.toLowerCase())) return;
  if (privateHostName(url.hostname)) throw new Error('WEB_ADDRESS_BLOCKED');
  await resolvePublic(url, resolve);
}
export async function resolvePublic(url: URL, resolve: Resolve = host => lookup(host, { all: true, verbatim: true })) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolve(host);
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('WEB_ADDRESS_BLOCKED');
  return addresses[0];
}
async function proxyTunnel(proxyUrl: string, address: string, port: number, signal: AbortSignal): Promise<Duplex> {
  const proxy = new URL(proxyUrl);
  return new Promise((resolve, reject) => {
    const req = (proxy.protocol === 'https:' ? httpsRequest : httpRequest)(proxy, {
      method: 'CONNECT',
      path: (isIP(address) === 6 ? '[' + address + ']' : address) + ':' + port,
      signal,
      agent: false,
      headers: { Host: (isIP(address) === 6 ? '[' + address + ']' : address) + ':' + port },
    });
    req.setTimeout(15_000, () => req.destroy(new Error('WEB_TIMEOUT')));
    req.on('connect', (res, socket, head) => {
      if (res.statusCode !== 200 || head.length) {
        socket.destroy();
        reject(new Error('WEB_PROXY_FAILED'));
      } else resolve(socket);
    });
    req.on('response', res => {
      res.destroy();
      reject(new Error('WEB_PROXY_FAILED'));
    });
    req.on('error', reject);
    req.end();
  });
}
/** DNS is checked on every redirect and pinned on the actual connection, including proxy CONNECT. */
export async function fetchPublic(input: string, signal: AbortSignal, proxyUrl?: string, resolve?: Resolve) {
  let current = publicUrl(input);
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  for (let redirect = 0; redirect <= 4; redirect++) {
    if (deadline.aborted) throw new Error(signal.aborted ? 'CANCELLED' : 'WEB_TIMEOUT');
    const pinned = await new Promise<{ address: string; family: number }>((done, fail) => {
      const stop = () => fail(new Error(signal.aborted ? 'CANCELLED' : 'WEB_TIMEOUT'));
      deadline.addEventListener('abort', stop, { once: true });
      void resolvePublic(current, resolve)
        .then(done, fail)
        .finally(() => deadline.removeEventListener('abort', stop));
    });
    let agent: HttpAgent | HttpsAgent | undefined, tunnel: Duplex | undefined;
    try {
      if (proxyUrl) {
        tunnel = await proxyTunnel(proxyUrl, pinned.address, Number(current.port || (current.protocol === 'https:' ? 443 : 80)), deadline);
        if (current.protocol === 'https:') {
          const hostname = current.hostname.replace(/^\[|\]$/g, '');
          const secure = tlsConnect({
            socket: tunnel as any,
            host: hostname,
            servername: isIP(hostname) ? '' : hostname,
            rejectUnauthorized: true,
          });
          agent = new HttpsAgent({ keepAlive: false });
          agent.createConnection = (() => secure) as any;
        } else {
          agent = new HttpAgent({ keepAlive: false });
          agent.createConnection = (() => tunnel) as any;
        }
      }
      const response = await new Promise<{ location?: string; text?: string }>((resolveResponse, reject) => {
        const req = (current.protocol === 'https:' ? httpsRequest : httpRequest)(
          current,
          {
            signal: deadline,
            agent: agent || false,
            headers: { Accept: 'text/html,text/plain,application/json', 'Accept-Encoding': 'identity', 'User-Agent': 'STeP-Desktop' },
            lookup: ((_hostname: string, options: any, callback: any) =>
              callback(null, options?.all ? [pinned] : pinned.address, pinned.family)) as any,
          },
          res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
              res.destroy();
              resolveResponse({ location: res.headers.location });
              return;
            }
            if (res.statusCode !== 200) {
              res.destroy();
              reject(new Error('WEB_FETCH_FAILED'));
              return;
            }
            if (
              !/^(text\/(html|plain)|application\/json)\b/i.test(res.headers['content-type'] || '') ||
              (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')
            ) {
              res.destroy();
              reject(new Error('WEB_CONTENT_UNSUPPORTED'));
              return;
            }
            let bytes = 0;
            const chunks: Buffer[] = [];
            res.on('data', chunk => {
              bytes += chunk.length;
              if (bytes > 2_000_000) res.destroy(new Error('TOOL_OUTPUT_LIMIT'));
              else chunks.push(chunk);
            });
            res.on('error', reject);
            res.on('end', () => resolveResponse({ text: Buffer.concat(chunks).toString('utf8') }));
          },
        );
        req.on('error', reject);
        req.setTimeout(15_000, () => req.destroy(new Error('WEB_TIMEOUT')));
        req.end();
      });
      if (response.location) {
        current = publicUrl(new URL(response.location, current).href);
        continue;
      }
      const text = (response.text || '')
        .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 1_000_000) throw new Error('TOOL_OUTPUT_LIMIT');
      return { url: current.href, text };
    } finally {
      agent?.destroy();
      tunnel?.destroy();
    }
  }
  throw new Error('WEB_REDIRECT_LIMIT');
}
