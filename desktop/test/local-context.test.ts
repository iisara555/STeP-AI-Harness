import test from 'node:test';
import assert from 'node:assert/strict';
import { localContext, localLimits } from '../electron/local-context';
import { contextBudget } from '../electron/compact';
import { compatibleEndpoint } from '../electron/preset-endpoint';
import { defaultPolicy } from '../electron/policy';
import { presetFor } from '../src/provider-presets';

type Route = (body: any) => unknown;
// A synthetic local server: each path answers with JSON, or 404 when it is not listed.
function server(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetcher = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${init?.method || 'GET'} ${url.pathname}`);
    assert.equal(init?.redirect, 'error');
    const route = routes[url.pathname];
    if (!route) return new Response('not found', { status: 404 });
    return Response.json(route(init?.body ? JSON.parse(String(init.body)) : undefined));
  }) as typeof fetch;
  return { fetcher, calls };
}
const ollama = { preset: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:14b' };
const lmstudio = { preset: 'lmstudio', baseUrl: 'http://127.0.0.1:1234/v1', model: 'qwen2.5-14b-instruct' };

test('Ollama: the loaded window comes from the running model, loading it first when needed', async () => {
  let loaded = false;
  const { fetcher, calls } = server({
    '/api/ps': () => ({ models: loaded ? [{ name: 'qwen2.5:14b', model: 'qwen2.5:14b', context_length: 32768 }] : [] }),
    '/api/generate': body => {
      assert.deepEqual(body, { model: 'qwen2.5:14b', prompt: '' });
      loaded = true;
      return { done: true };
    },
    '/api/show': () => ({ model_info: { 'general.architecture': 'qwen2', 'qwen2.context_length': 131072 } }),
  });
  assert.deepEqual(await localContext(ollama, fetcher), { window: 32768, trained: 131072 });
  assert.deepEqual(calls, ['GET /api/ps', 'POST /api/generate', 'GET /api/ps', 'POST /api/show']);
  // The measured window, not the 128k the model name suggests, plans the prompt.
  const limits = await localLimits(ollama, fetcher);
  assert.deepEqual(limits, { contextWindow: 32768 });
  assert.ok(contextBudget({ provider: 'compatible', ...ollama, ...limits }) < 32768 * 0.6 + 1);
});

test('Ollama: a default 4,096-token window is refused before the server cuts the prompt off', async () => {
  const { fetcher } = server({
    '/api/ps': () => ({ models: [{ name: 'qwen2.5:14b', context_length: 4096 }] }),
    '/api/show': () => ({ model_info: { 'qwen2.context_length': 131072 } }),
  });
  await assert.rejects(localLimits(ollama, fetcher), (error: any) => error.message === 'LOCAL_CONTEXT_TOO_SMALL' && error.window === 4096);
});

test('Ollama: an older server without context_length falls back to the Modelfile num_ctx, else says nothing', async () => {
  const withNumCtx = server({
    '/api/ps': () => ({ models: [{ name: 'qwen2.5:14b' }] }),
    '/api/show': () => ({ parameters: 'num_keep                       24\nnum_ctx                        16384', model_info: {} }),
  });
  assert.deepEqual(await localLimits(ollama, withNumCtx.fetcher), { contextWindow: 16384 });
  const silent = server({ '/api/ps': () => ({ models: [{ name: 'qwen2.5:14b' }] }), '/api/show': () => ({}) });
  assert.deepEqual(await localLimits(ollama, silent.fetcher), {});
  // Ollama not running: nothing is known and nothing is refused; the chat request reports the network error itself.
  const down = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  assert.deepEqual(await localLimits(ollama, down), {});
});

test('LM Studio: the loaded context length is read from its model API', async () => {
  const { fetcher, calls } = server({
    '/api/v0/models/qwen2.5-14b-instruct': () => ({ id: 'qwen2.5-14b-instruct', loaded_context_length: 8192, max_context_length: 32768 }),
  });
  assert.deepEqual(await localContext(lmstudio, fetcher), { window: 8192, trained: 32768 });
  assert.deepEqual(calls, ['GET /api/v0/models/qwen2.5-14b-instruct']);
  await assert.rejects(localLimits(lmstudio, fetcher), /LOCAL_CONTEXT_TOO_SMALL/);
});

test('only local presets on this computer are probed', async () => {
  const { fetcher, calls } = server({});
  assert.deepEqual(await localContext({ preset: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'x' }, fetcher), {});
  assert.deepEqual(await localContext({ ...ollama, baseUrl: 'http://192.168.1.5:11434/v1' }, fetcher), {});
  assert.deepEqual(await localContext({ ...ollama, model: '' }, fetcher), {});
  assert.deepEqual(calls, []);
});

test('LM Studio is a fixed local preset that needs no key', () => {
  const preset = presetFor('lmstudio')!;
  assert.equal(preset.key, 'none');
  assert.equal(compatibleEndpoint({ preset: 'lmstudio' }, defaultPolicy()).href, 'http://127.0.0.1:1234/v1/chat/completions');
});
