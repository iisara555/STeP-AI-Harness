import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_PRESETS, pickModel, presetFor } from '../src/provider-presets';
import { compatibleEndpoint } from '../electron/preset-endpoint';
import { openRouterSignIn, pkcePair } from '../electron/openrouter-auth';
import { compatibleModels } from '../electron/providers';
import { defaultPolicy, parsePolicy } from '../electron/policy';
import { connectionInput, connectLabel, initialChoice, providerChoiceReady } from '../src/ui';
import { createHash } from 'node:crypto';

test('presets are fixed official endpoints the main process accepts without an administrator profile', () => {
  const policy = defaultPolicy();
  assert.equal(policy.features.providerPresets, true);
  assert.equal(policy.features.compatibleProviders, false);
  for (const preset of PROVIDER_PRESETS) {
    assert.ok(preset.baseUrl.startsWith(preset.key === 'none' ? 'http://127.0.0.1' : 'https://'), preset.id);
    assert.equal(compatibleEndpoint({ preset: preset.id }, policy).href, preset.baseUrl + '/chat/completions');
  }
  // A preset cannot be pointed somewhere else, and a free-form endpoint still needs the administrator's approval.
  assert.throws(
    () => compatibleEndpoint({ preset: 'openrouter', baseUrl: 'https://evil.example/v1' }, policy),
    /PROVIDER_DESTINATION_DENIED/,
  );
  assert.throws(() => compatibleEndpoint({ preset: 'nope' }, policy), /INVALID_CONNECTION/);
  assert.throws(() => compatibleEndpoint({ baseUrl: 'https://openrouter.ai/api/v1', model: 'x' }, policy), /FEATURE_DISABLED/);
  const off = parsePolicy({ features: { providerPresets: false } }).policy;
  assert.throws(() => compatibleEndpoint({ preset: 'openrouter' }, off), /FEATURE_DISABLED/);
  const proxied = parsePolicy({ network: { proxyUrl: 'http://proxy.example:8080' } }).policy;
  assert.throws(() => compatibleEndpoint({ preset: 'groq' }, proxied), /PROVIDER_PROXY_UNAVAILABLE/);
  // Development tests may move every preset to one local fake service.
  assert.equal(
    compatibleEndpoint({ preset: 'openrouter', baseUrl: 'http://127.0.0.1:9/v1' }, policy, 'http://127.0.0.1:9/v1').href,
    'http://127.0.0.1:9/v1/chat/completions',
  );
});

test('the model is the employee choice, else the listed default, else the first listed', () => {
  const openrouter = presetFor('openrouter')!,
    ollama = presetFor('ollama')!;
  assert.equal(pickModel(' my/model ', openrouter, []), 'my/model');
  assert.equal(pickModel('', openrouter, ['a', 'openrouter/auto']), 'openrouter/auto');
  assert.equal(pickModel('', openrouter, []), 'openrouter/auto');
  assert.equal(pickModel('', presetFor('deepseek')!, ['deepseek-reasoner']), 'deepseek-reasoner');
  assert.equal(pickModel('', ollama, ['llama3.2:latest']), 'llama3.2:latest');
  assert.equal(pickModel('', ollama, []), '');
});

test('the picker sends a preset id, never a free-form URL, and says what the button does', () => {
  const openrouter = { ...initialChoice, provider: 'compatible', mode: 'api', preset: 'openrouter' };
  assert.equal(providerChoiceReady(openrouter), true);
  assert.equal(connectLabel(openrouter), 'ลงชื่อด้วย OpenRouter');
  assert.equal(connectLabel({ ...openrouter, key: 'sk-or-x' }), 'เชื่อมต่อ OpenRouter');
  const input: Record<string, unknown> = connectionInput({ ...openrouter, baseUrl: 'https://evil.example/v1' });
  assert.equal(input.preset, 'openrouter');
  assert.equal('baseUrl' in input, false);
  const groq = { ...initialChoice, provider: 'compatible', mode: 'api', preset: 'groq' };
  assert.equal(providerChoiceReady(groq), false);
  assert.equal(providerChoiceReady({ ...groq, key: 'gsk' }), true);
  assert.equal(providerChoiceReady({ ...initialChoice, provider: 'compatible', mode: 'api', preset: 'ollama' }), true);
  assert.equal(connectLabel({ ...initialChoice, provider: 'claude', mode: 'api', key: 'k' }), 'เชื่อมต่อ Claude API');
  assert.equal(connectLabel(initialChoice), 'เชื่อมต่อ ChatGPT');
});

test('model lists come from GET /models with the key, and fall back to the typed model', async () => {
  const seen: any[] = [];
  const fetcher = (async (url: URL, init: any) => {
    seen.push({ url: String(url), auth: init.headers.authorization });
    return new Response(JSON.stringify({ data: [{ id: 'a/one', name: 'One' }, { id: 'b/two' }, { id: 'a/one' }] }), { status: 200 });
  }) as any;
  const connection: any = { provider: 'compatible', baseUrl: 'https://openrouter.ai/api/v1/', protocol: 'openai', model: '' };
  assert.deepEqual(await compatibleModels(connection, 'sk', fetcher), [
    { id: 'a/one', label: 'One' },
    { id: 'b/two', label: 'b/two' },
  ]);
  assert.deepEqual(seen, [{ url: 'https://openrouter.ai/api/v1/models', auth: 'Bearer sk' }]);
  const failing = (async () => new Response('no', { status: 404 })) as any;
  assert.deepEqual(await compatibleModels({ ...connection, model: 'x' }, 'sk', failing), [{ id: 'x', label: 'x' }]);
  const offline = (async () => {
    throw new Error('ECONNREFUSED');
  }) as any;
  assert.deepEqual(await compatibleModels(connection, undefined, offline), []);
});

test('OpenRouter sign-in uses PKCE S256 and a loopback callback, and returns the issued key', async () => {
  const { verifier, challenge } = pkcePair();
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
  let opened = '';
  const exchanged: any[] = [];
  const fetcher = (async (url: string, init: any) => {
    exchanged.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ key: 'sk-or-v1-issued' }), { status: 200 });
  }) as any;
  const key = await openRouterSignIn({
    port: 0,
    fetcher,
    openExternal: async url => {
      opened = url;
      const auth = new URL(url);
      assert.equal(auth.origin + auth.pathname, 'https://openrouter.ai/auth');
      assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
      const callback = new URL(auth.searchParams.get('callback_url')!);
      assert.equal(callback.hostname, 'localhost');
      // A request without the random path is turned away; the real callback carries the code.
      assert.equal((await fetch(`http://127.0.0.1:${callback.port}/callback?code=x`)).status, 404);
      const page = await fetch(callback.href.replace('localhost', '127.0.0.1') + '?code=the-code');
      assert.equal(page.status, 200);
    },
  });
  assert.equal(key, 'sk-or-v1-issued');
  const challengeSent = new URL(opened).searchParams.get('code_challenge')!;
  assert.equal(exchanged[0].url, 'https://openrouter.ai/api/v1/auth/keys');
  assert.equal(exchanged[0].body.code, 'the-code');
  assert.equal(exchanged[0].body.code_challenge_method, 'S256');
  assert.equal(createHash('sha256').update(exchanged[0].body.code_verifier).digest('base64url'), challengeSent);
});

test('OpenRouter sign-in fails clearly on a refused exchange, a timeout and cancellation', async () => {
  const visit = async (url: string) => {
    const callback = new URL(new URL(url).searchParams.get('callback_url')!);
    await fetch(callback.href.replace('localhost', '127.0.0.1') + '?code=c');
  };
  await assert.rejects(
    openRouterSignIn({ port: 0, openExternal: visit, fetcher: (async () => new Response('{}', { status: 403 })) as any }),
    /OPENROUTER_SIGNIN_FAILED/,
  );
  await assert.rejects(openRouterSignIn({ port: 0, timeoutMs: 50, openExternal: async () => {} }), /OPENROUTER_SIGNIN_TIMEOUT/);
  const controller = new AbortController();
  const pending = openRouterSignIn({ port: 0, signal: controller.signal, openExternal: async () => controller.abort() });
  await assert.rejects(pending, /CANCELLED/);
});
