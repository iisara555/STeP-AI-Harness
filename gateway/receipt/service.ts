import { createServer, type IncomingMessage } from 'node:http';
import { createHmac } from 'node:crypto';
import { GeminiApiAdapter } from '../../desktop/electron/gemini-api';
import { googleIdentity, googleJson } from '../../desktop/electron/google-oauth';
import {
  RECEIPT_VISION_SCHEMA,
  RECEIPT_VISION_SYSTEM,
  RECEIPT_FIELDS,
  parseVisionReading,
  type ReceiptRegion,
} from '../../desktop/src/receipt-vision';
import type { Connection, VisionInput } from '../../desktop/src/types';
import type { TokenCount } from '../../desktop/electron/providers';

export type ReceiptCloudConfig = {
  key: string;
  model: string;
  clientIds: string[];
  domains: string[];
  quotaSalt: string;
  daily: number;
  perUser: number;
  concurrency: number;
};
export type ReceiptQuota = {
  reserve: (subject: string, requestId: string, daily: number, perUser: number) => Promise<void>;
};
export type ReceiptImageManifest = { page: number; region?: ReceiptRegion };
export type ReceiptCloudInput = {
  requestId: string;
  images: VisionInput[];
  manifest: ReceiptImageManifest[];
  focus?: string[];
};
export const CLOUD_RECEIPT_MAX_BODY = 16_100_000;
const code = (value: string): never => {
  throw new Error(value);
};
export function receiptCloudInput(data: any): ReceiptCloudInput {
  if (
    !data ||
    Object.keys(data).some(k => !['requestId', 'images', 'manifest', 'focus'].includes(k)) ||
    typeof data.requestId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(data.requestId) ||
    !Array.isArray(data.images) ||
    !data.images.length ||
    data.images.length > 6 ||
    !Array.isArray(data.manifest) ||
    data.manifest.length !== data.images.length
  )
    code('INVALID_INPUT');
  let bytes = 0,
    pages = 0,
    detail = false;
  for (let i = 0; i < data.images.length; i++) {
    const image = data.images[i],
      entry = data.manifest[i];
    if (
      !image ||
      Object.keys(image).some(k => !['mime', 'data'].includes(k)) ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(image.mime) ||
      typeof image.data !== 'string' ||
      !image.data.length ||
      image.data.length > 5_333_336 ||
      image.data.length % 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)
    )
      code('INVALID_INPUT');
    const size = (image.data.length * 3) / 4 - (image.data.endsWith('==') ? 2 : image.data.endsWith('=') ? 1 : 0);
    bytes += size;
    if (size > 4_000_000 || bytes > 12_000_000) code('ATTACH_TOO_LARGE');
    if (
      !entry ||
      Object.keys(entry).some(k => !['page', 'region'].includes(k)) ||
      !Number.isInteger(entry.page) ||
      entry.page < 1 ||
      entry.page > 3
    )
      code('INVALID_INPUT');
    if (!entry.region) {
      if (detail || entry.page !== ++pages) code('INVALID_INPUT');
    } else {
      detail = true;
      const r = entry.region;
      if (
        !pages ||
        entry.page > pages ||
        r.page !== entry.page ||
        Object.keys(r).some(k => !['page', 'x', 'y', 'width', 'height'].includes(k)) ||
        ![r.x, r.y, r.width, r.height].every(n => typeof n === 'number' && Number.isFinite(n)) ||
        r.x < 0 ||
        r.y < 0 ||
        r.width <= 0 ||
        r.height <= 0 ||
        r.x + r.width > 1.00001 ||
        r.y + r.height > 1.00001
      )
        code('INVALID_INPUT');
    }
  }
  if (
    !pages ||
    data.manifest.length - pages > 3 ||
    (data.focus !== undefined &&
      (!Array.isArray(data.focus) ||
        !data.focus.length ||
        data.focus.length > RECEIPT_FIELDS.length ||
        data.focus.some((f: any) => !RECEIPT_FIELDS.includes(f))))
  )
    code('INVALID_INPUT');
  return data;
}
async function body(req: IncomingMessage) {
  if (req.headers['content-type'] !== 'application/json' || req.headers['content-encoding']) code('INVALID_INPUT');
  if (Number(req.headers['content-length']) > CLOUD_RECEIPT_MAX_BODY) code('ATTACH_TOO_LARGE');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > CLOUD_RECEIPT_MAX_BODY) code('ATTACH_TOO_LARGE');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    code('INVALID_INPUT');
  }
}
/** Fixed-domain Google certificate cache prevents a new outbound JWKS request for every receipt. */
export function receiptGoogleAuth(config: Pick<ReceiptCloudConfig, 'clientIds' | 'domains'>, transport = fetch) {
  let keys: string | undefined,
    expires = 0,
    pending: Promise<string> | undefined;
  const certificates: typeof fetch = async () => {
    if (!keys || Date.now() >= expires) {
      pending ||= googleJson('https://www.googleapis.com/oauth2/v3/certs', {}, transport)
        .then(data => {
          keys = JSON.stringify(data);
          expires = Date.now() + 300_000;
          return keys!;
        })
        .finally(() => {
          pending = undefined;
        });
      await pending;
    }
    return new Response(keys, {
      headers: { 'content-type': 'application/json' },
    });
  };
  return async (token: string) => {
    try {
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      if (!config.clientIds.includes(claims.aud)) code('GOOGLE_ACCESS_DENIED');
      const who = await googleIdentity(token, claims.aud, undefined, certificates);
      if (!config.domains.includes(who.hd)) code('GOOGLE_ACCESS_DENIED');
      return who.sub;
    } catch {
      return code('GOOGLE_ACCESS_DENIED');
    }
  };
}
/** No public API accepts a Gemini key, model, system prompt, schema, destination or URL. */
export function createReceiptCloud(
  config: ReceiptCloudConfig,
  quota: ReceiptQuota,
  options: {
    transport?: typeof fetch;
    authenticate?: (token: string) => Promise<string>;
  } = {},
) {
  if (
    !config.key ||
    !/^gemini-[a-zA-Z0-9._-]{1,120}$/.test(config.model) ||
    config.quotaSalt.length < 32 ||
    !config.clientIds.length ||
    !config.domains.length ||
    ![config.daily, config.perUser, config.concurrency].every(n => Number.isSafeInteger(n) && n > 0)
  )
    code('OCR_CONFIGURATION');
  const authenticate = options.authenticate || receiptGoogleAuth(config, options.transport);
  const adapter = new GeminiApiAdapter(options.transport || fetch, new Map());
  let active = 0;
  const server = createServer(async (req, res) => {
    const send = (status: number, value: unknown) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(JSON.stringify(value));
    };
    if (req.url === '/healthz' && req.method === 'GET') return send(200, { ok: true });
    if (req.url !== '/v1/receipt' || req.method !== 'POST') return send(404, { error: 'NOT_FOUND' });
    if (active >= config.concurrency) return send(503, { error: 'PROVIDER_BUSY' });
    active++;
    const controller = new AbortController();
    const close = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', close);
    const timeout = setTimeout(() => controller.abort(), 150_000);
    try {
      const authorization = String(req.headers['x-step-identity'] || '');
      if (authorization.length > 20_010 || !/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) code('GOOGLE_ACCESS_DENIED');
      const subject = await authenticate(authorization.slice(7));
      const input = receiptCloudInput(await body(req));
      controller.signal.throwIfAborted();
      // Durable reservation happens before generation. Failures and ambiguous network outcomes do not refund it.
      await quota.reserve(
        createHmac('sha256', config.quotaSalt).update(subject).digest('hex'),
        input.requestId,
        config.daily,
        config.perUser,
      );
      controller.signal.throwIfAborted();
      let usage: TokenCount | undefined;
      const description = input.manifest
        .map(
          (entry, i) =>
            `Image ${i + 1}: ${entry.region ? `detail of page ${entry.page}, full-page region ${JSON.stringify(entry.region)}` : `full page ${entry.page}`}`,
        )
        .join('\n');
      const prompt =
        (input.focus
          ? `ตรวจภาพต้นฉบับอีกครั้งเฉพาะช่อง ${input.focus.join(', ')} ห้ามคำนวณหรือเดาค่าทดแทน ถ้าอ่านไม่ได้ให้เว้นว่าง\n`
          : 'อ่านใบเสร็จในภาพแล้วตอบเป็น JSON ตามรูปแบบที่กำหนดเท่านั้น\n') + description;
      const text = await adapter.run(
        prompt,
        {
          id: 'organization-receipt',
          provider: 'gemini',
          mode: 'api',
          model: config.model,
          maxOutputTokens: 16_384,
        } as Connection,
        {
          cwd: '.',
          env: {},
          key: config.key,
          receiptOcr: true,
          images: input.images,
          system: RECEIPT_VISION_SYSTEM,
          jsonSchema: RECEIPT_VISION_SCHEMA,
          signal: controller.signal,
          emit: () => {},
          onUsage: observed => {
            usage = observed;
          },
        },
      );
      parseVisionReading(text);
      send(200, { model: config.model, text, ...(usage ? { usage } : {}) });
    } catch (error) {
      const name = error instanceof Error ? error.message : '';
      const known: Record<string, number> = {
        GOOGLE_ACCESS_DENIED: 401,
        OCR_DAILY_LIMIT: 429,
        OCR_REQUEST_REPLAYED: 409,
        INVALID_INPUT: 400,
        ATTACH_TOO_LARGE: 413,
        PROVIDER_QUOTA: 503,
        PROVIDER_BUSY: 503,
        PROVIDER_STREAM_INVALID: 502,
      };
      send(controller.signal.aborted ? 504 : known[name] || 502, {
        error: controller.signal.aborted ? 'PROVIDER_TIMEOUT' : known[name] ? name : 'OCR_SERVICE_UNAVAILABLE',
      });
    } finally {
      clearTimeout(timeout);
      res.off('close', close);
      active--;
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 100;
  return server;
}
