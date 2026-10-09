import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Settings → AI connections sets the model new tasks start with; a task keeps its own choice.
const home = await mkdtemp(join(tmpdir(), 'step-default-model-smoke-'));
const workspace = join(home, 'work');
await mkdir(workspace);
const terms = /TERMS_VERSION = '([^']+)'/.exec(await readFile('src/terms-version.ts', 'utf8'))[1];
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
const put = (kind, id, value) => db.prepare('INSERT INTO records VALUES(?,?,?)').run(kind, id, JSON.stringify(value));
put('settings', 'main', {
  team: 'cc',
  assistant: 'STeP Mate',
  workspace,
  theme: 'light',
  onboarding: true,
  whatsNewSeen: '999.0.0',
  tourDone: true,
  termsVersion: terms,
});
put('connection', 'fake', {
  id: 'fake',
  provider: 'openai',
  mode: 'subscription',
  model: '',
  executable: join(home, 'none'),
  customRuntime: true,
  ready: true,
  note: 'Synthetic',
  modelsAt: new Date().toISOString(),
  models: [
    { id: 'fast-1', label: 'Fast 1', isDefault: true },
    { id: 'deep-2', label: 'Deep 2' },
  ],
});
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(() => Boolean(window.step));
  const call = (method, input) => page.evaluate(({ method, input }) => window.step.call(method, input), { method, input });
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();
  await page.getByText('โมเดลและการจัดการบัญชี', { exact: true }).click();
  const choose = page.getByLabel('โมเดลเริ่มต้นสำหรับงานใหม่');
  assert.equal(await choose.inputValue(), '');
  await expect(choose.locator('option').first()).toHaveText('ค่าเริ่มต้น (Fast 1)');
  await choose.selectOption('deep-2');
  await expect.poll(async () => (await call('snapshot')).connections[0].model).toBe('deep-2');
  // A new task starts with the default; changing that task's model leaves the default alone.
  const session = await call('create', { connectionId: 'fake' });
  assert.equal(session.model ?? (await call('snapshot')).connections[0].model, 'deep-2');
  await call('model', { id: session.id, model: 'fast-1' });
  assert.equal((await call('snapshot')).connections[0].model, 'deep-2');
  await assert.rejects(call('connectionModel', { id: 'fake', model: 'not-offered' }), /INVALID_MODEL/);
  await assert.rejects(call('connectionModel', { id: 'missing', model: '' }), /CONNECTION_NOT_FOUND/);
  await choose.selectOption('');
  await expect.poll(async () => (await call('snapshot')).connections[0].model).toBe('');
  assert.deepEqual(errors, []);
  console.log('Default model smoke passed: set in Settings, used by new tasks, a task keeps its own model, invalid models refused.');
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
