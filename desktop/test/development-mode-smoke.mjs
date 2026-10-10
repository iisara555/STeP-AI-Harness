import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Development mode (Settings → AI): an employee turns it on to test on their own Claude Pro/Max plan. Without it, the
// Claude plan connection is refused as before; with it, the connection is accepted; a policy can remove the switch.
const home = await mkdtemp(join(tmpdir(), 'step-development-mode-smoke-'));
const workspace = join(home, 'work');
await mkdir(workspace);
const terms = /TERMS_VERSION = '([^']+)'/.exec(await readFile('src/terms-version.ts', 'utf8'))[1];
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
db.prepare('INSERT INTO records VALUES(?,?,?)').run(
  'settings',
  'main',
  JSON.stringify({
    team: 'cc',
    assistant: 'STeP Mate',
    workspace,
    theme: 'light',
    onboarding: true,
    whatsNewSeen: '999.0.0',
    tourDone: true,
    termsVersion: terms,
  }),
);
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
delete env.STEP_CLAUDE_SUBSCRIPTION;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(() => Boolean(window.step));
  const call = (method, input) => page.evaluate(({ method, input }) => window.step.call(method, input), { method, input });
  const claudePlan = { provider: 'claude', mode: 'subscription', model: '' };

  // Off (the default): the Claude plan connection is refused, as before.
  assert.equal((await call('snapshot')).features.claudeSubscription, false);
  await assert.rejects(call('connection', claudePlan), /INVALID_CONNECTION/);

  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'การเชื่อมต่อ AI' }).click();
  const toggle = page.getByLabel('โหมดนักพัฒนา: ทดลองใช้ Claude Pro/Max ของตัวเอง');
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText(/Anthropic แจ้งว่าทดสอบได้ แต่การใช้งานจริงในองค์กร/)).toBeVisible();

  // On: the plan connection is accepted and the switch remembers.
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect.poll(async () => (await call('snapshot')).features.claudeSubscription).toBe(true);
  assert.equal((await call('snapshot')).settings.developmentMode, true);
  const connection = await call('connection', claudePlan);
  assert.equal(connection.provider, 'claude');
  assert.equal(connection.mode, 'subscription');
  await call('removeConnection', { id: connection.id });
  await assert.rejects(call('developmentMode', { enabled: 'yes' }), /INVALID_INPUT/);

  // Off again.
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect.poll(async () => (await call('snapshot')).features.claudeSubscription).toBe(false);
  await assert.rejects(call('connection', claudePlan), /INVALID_CONNECTION/);

  // An administrator removes the switch: hidden, refused, and an earlier "on" no longer counts.
  await call('developmentMode', { enabled: true });
  await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { developmentMode: false } }));
  await expect.poll(async () => (await call('snapshot')).policy.features.developmentMode, { timeout: 15000 }).toBe(false);
  await expect(toggle).toHaveCount(0);
  assert.equal((await call('snapshot')).features.claudeSubscription, false);
  await assert.rejects(call('developmentMode', { enabled: true }), /FEATURE_DISABLED/);
  await assert.rejects(call('connection', claudePlan), /INVALID_CONNECTION/);
  assert.deepEqual(errors, []);
  console.log(
    'Development mode smoke passed: off by default, Settings switch enables the Claude plan, off again refuses, policy can remove it.',
  );
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
