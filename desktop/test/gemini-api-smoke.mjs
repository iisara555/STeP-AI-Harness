// Gemini API key from Settings: pressing "connect" must test the key and finish ready or with a clear error, never
// sit untested. Runs the bundled Gemini CLI against a local fake Gemini API; no Google account, key or quota is used.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';

let mode = 'quota';
const prompts = [];
const server = createServer((req, res) => {
  let body = '';
  req.on('data', d => (body += d));
  req.on('end', () => {
    if (mode === 'quota') {
      res.writeHead(429, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: 429, message: 'Quota exceeded, limit: 0', status: 'RESOURCE_EXHAUSTED' } }));
    }
    const reply = text => ({
      candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: 'STOP', index: 0 }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, totalTokenCount: 6 },
    });
    if (req.url.includes('streamGenerateContent')) {
      prompts.push(body);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      return res.end('data: ' + JSON.stringify(reply('OK')) + '\r\n\r\n');
    }
    // The CLI's model router asks a small model which model to use before the real request.
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply('{"reasoning":"short","model_choice":"flash"}')));
  });
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');

const home = await mkdtemp(join(tmpdir(), 'step-gemini-api-'));
const env = {
  ...process.env,
  STEP_DESKTOP_TEST_HOME: home,
  STEP_TEST_GEMINI_BASE_URL: `http://127.0.0.1:${server.address().port}`,
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
  // CI runners may have no OS keychain; this stands in for it so the key can be stored.
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.encryptString = s => Buffer.from('k' + s);
    safeStorage.decryptString = b => b.toString().slice(1);
  });
  const gemini = async () => (await page.evaluate(() => window.step.call('snapshot'))).connections.filter(c => c.provider === 'gemini');
  const connect = async () => {
    await page.getByRole('button', { name: 'Gemini · API key', exact: true }).click();
    await page.getByLabel('Gemini API key').fill('synthetic-gemini-key-for-smoke');
    await page.getByRole('button', { name: 'เชื่อมต่อ Gemini', exact: true }).click();
  };
  await page.keyboard.press('ControlOrMeta+,');
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();

  // An exhausted free-tier key ends with a clear quota message instead of an untested connection.
  await connect();
  await expect.poll(async () => (await gemini())[0]?.note || '', { timeout: 60000 }).toContain('PROVIDER_QUOTA');
  assert.equal((await gemini())[0].ready, false);

  // A working key is tested right away and becomes ready.
  mode = 'ok';
  await connect();
  await expect.poll(async () => (await gemini()).some(c => c.ready), { timeout: 60000 }).toBe(true);
  assert.ok(
    prompts.some(p => p.includes('Reply with exactly OK')),
    'the connection test reached the Gemini API',
  );
  assert.deepEqual(errors, []);
  console.log('Gemini API key smoke passed: Settings tests the key on connect; quota errors and success both finish.');
} finally {
  await app.close().catch(() => {});
  server.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
