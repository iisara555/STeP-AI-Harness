import { randomUUID } from 'node:crypto';
import type { ReceiptCloudConfig } from './receipt-cloud-config';
import type { VisionInput } from '../src/types';
import type { ReceiptRegion } from '../src/receipt-vision';
import type { TokenCount } from './providers';
export type ReceiptCloudManifest = { page: number; region?: ReceiptRegion }[];
/** Fixed trusted service; the ID token stays in main and no Gemini key is present on an employee device. */
export class ReceiptCloudClient {
  constructor(
    private config: ReceiptCloudConfig,
    private request = fetch,
    private testUrl?: string,
  ) {
    if (testUrl && !/^http:\/\/127\.0\.0\.1:\d+$/.test(testUrl)) throw new Error('INVALID_INPUT');
  }
  async read(images: VisionInput[], manifest: ReceiptCloudManifest, token: string, signal: AbortSignal, focus?: string[]) {
    let response: Response;
    try {
      response = await this.request((this.testUrl || this.config.url) + '/v1/receipt', {
        method: 'POST',
        redirect: 'error',
        headers: { 'x-step-identity': 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: randomUUID(), images, manifest, ...(focus?.length ? { focus } : {}) }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(150_000)]),
      });
    } catch {
      throw new Error(signal.aborted ? 'CANCELLED' : 'PROVIDER_NETWORK');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('PROVIDER_STREAM_INVALID');
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > 2_000_000) throw new Error('PROVIDER_STREAM_INVALID');
        chunks.push(next.value);
      }
      if (!response.ok) {
        const known: Record<number, string> = {
          401: 'GOOGLE_REAUTH_REQUIRED',
          403: 'GOOGLE_ACCESS_DENIED',
          409: 'OCR_REQUEST_REPLAYED',
          429: 'OCR_DAILY_LIMIT',
          503: 'PROVIDER_BUSY',
          504: 'PROVIDER_TIMEOUT',
        };
        throw new Error(known[response.status] || 'OCR_SERVICE_UNAVAILABLE');
      }
      let data: any;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new Error('PROVIDER_STREAM_INVALID');
      }
      if (data.model !== this.config.model || typeof data.text !== 'string' || !data.text.trim() || data.text.length > 1_000_000)
        throw new Error('PROVIDER_STREAM_INVALID');
      const usage = data.usage;
      const validUsage =
        usage &&
        ['input', 'output', 'total'].every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0) &&
        Object.keys(usage).every(
          key =>
            ['input', 'output', 'total', 'cachedInput', 'cacheWriteInput'].includes(key) &&
            Number.isSafeInteger(usage[key]) &&
            usage[key] >= 0 &&
            usage[key] < 100_000_000,
        );
      return { text: data.text as string, usage: validUsage ? (usage as TokenCount) : undefined };
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
