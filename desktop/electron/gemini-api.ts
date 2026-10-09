import { providerUsage, type TokenCount } from '../../src/modules/providers/usage.js';
import { providerSessionKey, type ProviderAdapter, type ProviderContext } from './providers';
import type { Connection } from '../src/types';

type CacheEntry = { expires: number; pending: Promise<string | undefined> };
// Server resources expire after five minutes. Only opaque identities/resource names stay in host memory.
const prefixes = new Map<string, CacheEntry>();
const TTL_MS = 300_000;

async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('PROVIDER_STREAM_INVALID');
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 8192) throw new Error('PROVIDER_STREAM_INVALID');
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function apiError(response: Response) {
  const data = await boundedJson(response).catch(() => ({}));
  // Inspect bounded provider diagnostics, but never expose their raw message.
  const reason = String(data.error?.message || '');
  // Gemini answers 429 RESOURCE_EXHAUSTED both for a per-minute rate limit and for a used-up daily or billing quota.
  // Only a daily/billing limit is final; a per-minute limit passes, so it is retried like any busy service.
  const quotaIds = (Array.isArray(data.error?.details) ? data.error.details : [])
    .flatMap((detail: any) => (Array.isArray(detail?.violations) ? detail.violations : []))
    .map((violation: any) => String(violation?.quotaId || ''))
    .join(' ');
  // "limit: 0" means the key has no allowance for this model at all (for example a free tier without it).
  const finalQuota = /PerDay|billing|credit|limit:\s*0\b/i.test(quotaIds + ' ' + reason);
  const code = [401, 403].includes(response.status)
    ? 'LOGIN_REQUIRED'
    : response.status === 429 || data.error?.status === 'RESOURCE_EXHAUSTED'
      ? finalQuota
        ? 'PROVIDER_QUOTA'
        : 'PROVIDER_BUSY'
      : /(?:context|input|prompt).{0,30}(?:too long|token limit|exceed)/i.test(reason)
        ? 'PROMPT_TOO_LONG'
        : response.status >= 500
          ? 'PROVIDER_BUSY'
          : 'PROVIDER_REQUEST_FAILED';
  const raw = response.headers.get('retry-after');
  const seconds = raw === null ? NaN : Number(raw);
  const wait = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw || '') - Date.now();
  return Object.assign(new Error(code), Number.isFinite(wait) && wait > 0 ? { retryAfterMs: Math.min(wait, 120_000) } : {});
}

/** Opt-in Gemini API-key text transport. CLI search/images/subscription/custom runtimes keep their existing path. */
export class GeminiApiAdapter implements ProviderAdapter {
  constructor(
    private request = fetch,
    private caches = prefixes,
    private now = Date.now,
  ) {}
  private async prefix(connection: Connection, context: ProviderContext, base: string, model: string) {
    if (!context.system) return { name: undefined, status: 'bypassed' as const };
    const key = base + ':' + providerSessionKey(connection, context);
    const current = this.now();
    for (const [id, entry] of this.caches) if (entry.expires <= current) this.caches.delete(id);
    let entry = this.caches.get(key);
    const reused = Boolean(entry);
    if (!entry) {
      if (this.caches.size >= 8) this.caches.delete(this.caches.keys().next().value!);
      const pending = (async () => {
        try {
          const response = await this.request(base + '/cachedContents', {
            method: 'POST',
            redirect: 'error',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': context.key! },
            body: JSON.stringify({ model: 'models/' + model, systemInstruction: { parts: [{ text: context.system }] }, ttl: '300s' }),
            signal: AbortSignal.any([context.signal, AbortSignal.timeout(15_000)]),
          });
          if (!response.ok) {
            if ([401, 403, 429].includes(response.status)) throw await apiError(response);
            await response.body?.cancel().catch(() => {});
            return undefined; // Unsupported/too-small prefixes and optional-cache outages keep normal generation available.
          }
          const resource = await boundedJson(response);
          return typeof resource.name === 'string' && /^cachedContents\/[a-zA-Z0-9_-]{1,200}$/.test(resource.name)
            ? resource.name
            : undefined;
        } catch (error) {
          if (context.signal.aborted) throw new Error('CANCELLED');
          if (error instanceof Error && ['LOGIN_REQUIRED', 'PROVIDER_QUOTA', 'PROVIDER_BUSY'].includes(error.message)) throw error;
          return undefined;
        }
      })();
      entry = { expires: current + TTL_MS, pending };
      this.caches.set(key, entry);
      void pending.catch(() => {
        if (this.caches.get(key)?.pending === pending) this.caches.delete(key);
      });
    }
    let name: string | undefined;
    let cancel: (() => void) | undefined;
    try {
      name = await new Promise<string | undefined>((resolve, reject) => {
        cancel = () => reject(new Error('CANCELLED'));
        context.signal.addEventListener('abort', cancel, { once: true });
        if (context.signal.aborted) cancel();
        entry.pending.then(resolve, reject);
      });
    } catch (error) {
      // A different request can have cancelled the shared creation; it must not cancel this request.
      if (
        context.signal.aborted ||
        (error instanceof Error && ['LOGIN_REQUIRED', 'PROVIDER_QUOTA', 'PROVIDER_BUSY'].includes(error.message))
      )
        throw error;
    } finally {
      if (cancel) context.signal.removeEventListener('abort', cancel);
    }
    return { name, status: name ? (reused ? ('reused' as const) : ('created' as const)) : ('bypassed' as const) };
  }
  async run(prompt: string, connection: Connection, context: ProviderContext) {
    if (connection.provider !== 'gemini' || connection.mode !== 'api' || !context.key) throw new Error('API_KEY_REQUIRED');
    if (context.images?.length || context.webSearch) throw new Error('PROVIDER_CAPABILITY_UNSUPPORTED');
    const model = connection.model.replace(/^models\//, '');
    if (!/^gemini-[a-zA-Z0-9._-]{1,120}$/.test(model) || prompt.length > 400_000) throw new Error('INVALID_INPUT');
    if (context.signal.aborted) throw new Error('CANCELLED');
    // Main sets this only for non-packaged synthetic tests, just as it does for Gemini CLI.
    if (context.geminiBaseUrl) {
      const url = new URL(context.geminiBaseUrl);
      if (
        url.protocol !== 'http:' ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error('INVALID_INPUT');
    }
    const base = (context.geminiBaseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '') + '/v1beta';
    const signal = AbortSignal.any([context.signal, AbortSignal.timeout(600_000)]);
    const cached = await this.prefix(connection, context, base, model);
    let name = cached.name;
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      if (signal.aborted) throw new Error(context.signal.aborted ? 'CANCELLED' : 'PROVIDER_TIMEOUT');
      context.onTransport?.({
        mode: 'full',
        sentChars: prompt.length,
        cacheStatus: name ? cached.status : 'bypassed',
        ...(attempt ? { resetReason: 'cache-invalid' } : {}),
      });
      try {
        response = await this.request(`${base}/models/${model}:streamGenerateContent?alt=sse`, {
          method: 'POST',
          redirect: 'error',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': context.key },
          signal,
          body: JSON.stringify({
            ...(name ? { cachedContent: name } : context.system ? { systemInstruction: { parts: [{ text: context.system }] } } : {}),
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            ...(connection.maxOutputTokens || context.jsonSchema
              ? {
                  generationConfig: {
                    ...(connection.maxOutputTokens ? { maxOutputTokens: connection.maxOutputTokens } : {}),
                    // Gemini's native JSON mode: the reply is always one valid JSON value. The shape itself still comes
                    // from the prompt and the host's parser, since Gemini accepts only part of JSON Schema.
                    ...(context.jsonSchema ? { responseMimeType: 'application/json' } : {}),
                  },
                }
              : {}),
          }),
        });
      } catch {
        throw new Error(signal.aborted ? (context.signal.aborted ? 'CANCELLED' : 'PROVIDER_TIMEOUT') : 'PROVIDER_NETWORK');
      }
      if (response.ok) break;
      if (name && !attempt && [400, 404].includes(response.status)) {
        await response.body?.cancel().catch(() => {});
        this.caches.set(base + ':' + providerSessionKey(connection, context), {
          expires: this.now() + TTL_MS,
          pending: Promise.resolve(undefined),
        });
        name = undefined;
        continue;
      }
      throw await apiError(response);
    }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      await response.body?.cancel().catch(() => {});
      throw new Error('PROVIDER_STREAM_INVALID');
    }
    const reader = response.body.getReader(),
      decoder = new TextDecoder('utf-8', { fatal: true });
    let buffer = '',
      text = '',
      bytes = 0,
      ended = false,
      rawUsage = {},
      usage: TokenCount | undefined;
    const abort = () => void reader.cancel().catch(() => {});
    signal.addEventListener('abort', abort, { once: true });
    const consume = (block: string) => {
      const data = block
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n');
      if (!data) return;
      const chunk = JSON.parse(data);
      if (chunk.error || chunk.promptFeedback?.blockReason) throw new Error('PROVIDER_REQUEST_FAILED');
      if (chunk.usageMetadata) {
        rawUsage = { ...rawUsage, ...chunk.usageMetadata };
        usage = providerUsage('gemini', rawUsage);
      }
      const candidate = chunk.candidates?.[0];
      for (const part of candidate?.content?.parts || []) {
        if (part.functionCall) throw new Error('PROVIDER_TOOL_DENIED');
        if (part.text === undefined) continue;
        if (typeof part.text !== 'string') throw new Error('PROVIDER_STREAM_INVALID');
        if (part.thought) context.onReasoning?.(part.text);
        else {
          text += part.text;
          if (text.length > 200_000) throw new Error('PROVIDER_OUTPUT_LIMIT');
          context.emit(part.text);
        }
      }
      if (candidate?.finishReason) {
        if (candidate.finishReason !== 'STOP')
          throw new Error(candidate.finishReason === 'MAX_TOKENS' ? 'PROVIDER_OUTPUT_LIMIT' : 'PROVIDER_REQUEST_FAILED');
        ended = true;
      }
    };
    try {
      while (true) {
        if (signal.aborted) throw new Error('CANCELLED');
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length;
        if (bytes > 2_000_000) throw new Error('PROVIDER_OUTPUT_LIMIT');
        buffer += decoder.decode(chunk.value, { stream: true });
        buffer = buffer.replace(/\r\n/g, '\n');
        if (buffer.length > 250_000) throw new Error('PROVIDER_OUTPUT_LIMIT');
        let split: number;
        while ((split = buffer.indexOf('\n\n')) >= 0) {
          consume(buffer.slice(0, split));
          buffer = buffer.slice(split + 2);
        }
      }
      if (signal.aborted) throw new Error('CANCELLED');
      buffer += decoder.decode();
      if (buffer.trim()) consume(buffer);
      if (!ended || !text.trim()) throw new Error('PROVIDER_STREAM_INCOMPLETE');
      return text;
    } catch (error) {
      if (signal.aborted) throw new Error(context.signal.aborted ? 'CANCELLED' : 'PROVIDER_TIMEOUT');
      if (error instanceof SyntaxError || error instanceof TypeError) throw new Error('PROVIDER_STREAM_INVALID');
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
      if (usage) context.onUsage?.(usage);
    }
  }
}
