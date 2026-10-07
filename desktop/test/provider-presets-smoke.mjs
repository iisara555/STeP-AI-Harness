// More AI services from the connection page: OpenRouter through its sign-in page (OAuth PKCE) and Groq with an API key.
// Every preset is pointed at a local fake OpenAI-compatible service; no real account, key or network is used.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';

const seen = { auth: [], exchange: [], models: [], chat: [] };
const server = createServer((req, res) => {
  let body = '';
  req.on('data', d => (body += d));
  req.on('end', () => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/auth') {
      // OpenRouter's consent page: the person approves and the browser returns to the app with a code.
      seen.auth.push(Object.fromEntries(url.searchParams));
      const back = new URL(url.searchParams.get('callback_url'));
      back.searchParams.set('code', 'fake-code');
      res.writeHead(302, { location: back.href });
      return res.end();
    }
    if (url.pathname === '/v1/auth/keys') {
      seen.exchange.push(JSON.parse(body));
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ key: 'sk-or-v1-from-signin' }));
    }
    if (url.pathname === '/v1/models') {
      seen.models.push(req.headers.authorization || '');
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'openrouter/auto', name: 'Auto Router' }, { id: 'llama-3.3-70b-versatile' }] }));
    }
    if (url.pathname === '/v1/chat/completions') {
      const request = JSON.parse(body);
      seen.chat.push({ auth: req.headers.authorization || '', model: request.model });
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'OK' } }] }) + '\n\n');
      res.write('data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 1 } }) + '\n\n');
      return res.end('data: [DONE]\n\n');
    }
    res.writeHead(404).end();
  });
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

const env = {
  ...process.env,
  STEP_DESKTOP_TEST_HOME: await mkdtemp(join(tmpdir(), 'step-presets-')),
  STEP_TEST_PRESET_BASE_URL: base + '/v1',
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ state: 'detached' });
  await app.evaluate(({ safeStorage, shell }) => {
    // CI runners may have no OS keychain; this stands in for it so keys can be stored.
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = s => Buffer.from('k' + s);
    safeStorage.decryptString = b => b.toString().slice(1);
    // The "browser": follow OpenRouter's redirect back to the app's loopback callback.
    globalThis.opened = [];
    shell.openExternal = async url => {
      globalThis.opened.push(url);
      await fetch(url.replace('://localhost', '://127.0.0.1'));
    };
  });
  await page.keyboard.press('ControlOrMeta+,');
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();

  // OpenRouter: no key typed, so the button signs in; the key it issues is stored and used, never shown.
  await page.getByRole('button', { name: /ดูบริการอื่นอีก/ }).click();
  await page.getByRole('radio', { name: /^OpenRouter/ }).click();
  await page.getByRole('button', { name: 'ลงชื่อด้วย OpenRouter', exact: true }).click();
  const connections = async () => (await page.evaluate(() => window.step.call('snapshot'))).connections;
  await expect.poll(async () => (await connections()).find(c => c.preset === 'openrouter')?.ready, { timeout: 30000 }).toBe(true);
  const openrouter = (await connections()).find(c => c.preset === 'openrouter');
  assert.equal(openrouter.provider, 'compatible');
  assert.equal(openrouter.label, 'OpenRouter');
  assert.equal(openrouter.model, 'openrouter/auto');
  assert.deepEqual(
    openrouter.models.map(m => m.id),
    ['openrouter/auto', 'llama-3.3-70b-versatile'],
  );
  assert.equal(seen.auth.length, 1);
  assert.equal(seen.auth[0].code_challenge_method, 'S256');
  assert.equal(seen.exchange[0].code, 'fake-code');
  assert.ok(seen.chat.some(c => c.auth === 'Bearer sk-or-v1-from-signin' && c.model === 'openrouter/auto'));
  assert.equal(JSON.stringify(await connections()).includes('sk-or-v1-from-signin'), false);
  await expect(page.locator('body')).not.toContainText('sk-or-v1-from-signin');

  // Groq: an API key is required before the button is enabled; the typed key is what the service receives.
  await page.getByText('เพิ่ม AI อีกบัญชี', { exact: true }).click();
  await page.getByRole('radio', { name: /^Groq/ }).click();
  const groqConnect = page.getByRole('button', { name: 'เชื่อมต่อ Groq', exact: true });
  await expect(groqConnect).toBeDisabled();
  await page.getByLabel('Groq API key').fill('gsk-synthetic');
  await groqConnect.click();
  await expect.poll(async () => (await connections()).find(c => c.preset === 'groq')?.ready, { timeout: 30000 }).toBe(true);
  assert.equal((await connections()).find(c => c.preset === 'groq').model, 'llama-3.3-70b-versatile');
  assert.ok(seen.chat.some(c => c.auth === 'Bearer gsk-synthetic'));
  await page.getByRole('heading', { name: 'การเชื่อมต่อ AI' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'release/qa/ai-connections.png' });
  // A preset cannot be redirected through the IPC to another address.
  const baseUrl = await page.evaluate(() =>
    window.step
      .call('connection', { provider: 'compatible', mode: 'api', preset: 'deepseek', baseUrl: 'https://evil.example/v1', apiKey: 'x' })
      .then(c => c.baseUrl),
  );
  assert.equal(baseUrl, env.STEP_TEST_PRESET_BASE_URL);
  assert.deepEqual(errors, []);
  console.log('provider presets smoke passed');
} finally {
  await app.close();
  server.close();
}
