// How much text a model on this computer (Ollama, LM Studio) takes per request. Both servers load a model with a small
// window by default and silently drop what does not fit through their OpenAI-compatible API, so the app reads the size
// the server actually loaded instead of assuming the model's trained maximum.
import { MIN_CONTEXT_WINDOW } from './compact';

export type LocalContext = {
  /** Tokens the loaded model takes per request; undefined when the server does not say. */
  window?: number;
  /** The model's trained maximum, for the advice shown when the loaded window is too small. */
  trained?: number;
};

export const LOCAL_PRESETS = ['ollama', 'lmstudio'];

const tokens = (value: unknown) => (Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : undefined);

async function json(url: URL, fetcher: typeof fetch, init: RequestInit = {}, ms = 5_000): Promise<any> {
  try {
    const response = await fetcher(url, {
      ...init,
      headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) },
      redirect: 'error',
      signal: AbortSignal.timeout(ms),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return undefined;
    }
    return await response.json();
  } catch {
    return undefined;
  }
}

async function ollama(root: string, model: string, fetcher: typeof fetch): Promise<LocalContext> {
  const loaded = async () => {
    const ps = await json(new URL(root + '/api/ps'), fetcher);
    const entry = (Array.isArray(ps?.models) ? ps.models : []).find((m: any) => m?.name === model || m?.model === model);
    return entry ? { found: true, window: tokens(entry.context_length) } : { found: false, window: undefined };
  };
  let running = await loaded();
  // A model that is not loaded yet has no window; an empty generate request loads it with the server's settings.
  if (!running.found) {
    await json(new URL(root + '/api/generate'), fetcher, { method: 'POST', body: JSON.stringify({ model, prompt: '' }) }, 120_000);
    running = await loaded();
  }
  const show = await json(new URL(root + '/api/show'), fetcher, { method: 'POST', body: JSON.stringify({ model }) });
  const info = show?.model_info && typeof show.model_info === 'object' ? show.model_info : {};
  const trained = tokens(Object.entries(info).find(([key]) => key.endsWith('.context_length'))?.[1]);
  // Older servers do not report the loaded window; a Modelfile num_ctx is the next best evidence.
  const declared = /(?:^|\n)\s*(?:PARAMETER\s+)?num_ctx\s+(\d+)/i.exec(
    [show?.parameters, show?.modelfile].filter(v => typeof v === 'string').join('\n'),
  );
  return { window: running.window ?? (declared ? tokens(Number(declared[1])) : undefined), trained };
}

async function lmStudio(root: string, model: string, fetcher: typeof fetch): Promise<LocalContext> {
  const info = await json(new URL(root + '/api/v0/models/' + encodeURIComponent(model)), fetcher);
  return { window: tokens(info?.loaded_context_length), trained: tokens(info?.max_context_length) };
}

/** Reads the loaded window of a local preset's model. Unknown servers and failures return {}. */
export async function localContext(
  connection: { preset?: string; baseUrl?: string; model?: string },
  fetcher: typeof fetch = fetch,
): Promise<LocalContext> {
  const model = String(connection.model || '');
  if (!model || !LOCAL_PRESETS.includes(connection.preset || '')) return {};
  let root: string;
  try {
    const url = new URL(String(connection.baseUrl || ''));
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return {};
    root = url.origin;
  } catch {
    return {};
  }
  return connection.preset === 'ollama' ? ollama(root, model, fetcher) : lmStudio(root, model, fetcher);
}

/**
 * The context window to plan prompts with. A loaded window below the smallest prompt the app can build is refused with
 * LOCAL_CONTEXT_TOO_SMALL, because the server would cut the instructions off without saying so.
 */
export async function localLimits(
  connection: { preset?: string; baseUrl?: string; model?: string },
  fetcher: typeof fetch = fetch,
): Promise<{ contextWindow?: number }> {
  const { window } = await localContext(connection, fetcher);
  if (window === undefined) return {};
  if (window < MIN_CONTEXT_WINDOW) throw Object.assign(new Error('LOCAL_CONTEXT_TOO_SMALL'), { window });
  return { contextWindow: Math.min(window, 2_000_000) };
}
