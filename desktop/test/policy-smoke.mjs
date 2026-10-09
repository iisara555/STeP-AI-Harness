import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';

const home = await mkdtemp(join(tmpdir(), 'step-policy-smoke-'));
const workspace = join(home, 'work');
await mkdir(workspace);
await mkdir('release/qa', { recursive: true });
// This smoke covers the organization checks, which are off unless policy turns them on.
// Full auto is offered by default; this smoke covers an organization that turns it off.
await writeFile(
  join(home, 'desktop-policy.json'),
  JSON.stringify({ checks: { authority: true, privacy: true }, features: { autoMode: false } }),
);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const child = await electron.launch({ args: ['.'], env, timeout: 45000 });
const server = createServer((req, res) => {
  req.resume();
  req.on('end', () => res.end('{"decision":"block","reason":"synthetic denial"}'));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const page = await child.firstWindow();
  const waitPolicy = async matches => {
    for (let i = 0; i < 80; i++) {
      const policy = (await page.evaluate(() => window.step.call('snapshot'))).policy;
      if (matches(policy)) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('POLICY_RELOAD_TIMEOUT');
  };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await child.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, workspace);
  await page.evaluate(() => window.step.call('workspace'));
  await page.reload();
  const state = await page.evaluate(() => window.step.call('snapshot'));
  assert.equal(state.policy.source, 'managed');
  assert.equal(state.policy.features.autoMode, false);
  await assert.rejects(
    page.evaluate(() => window.step.call('permissionMode', { mode: 'auto' })),
    /MODE_NOT_ALLOWED/,
  );
  await page.getByRole('combobox', { name: 'สิทธิ์เครื่องมือ' }).selectOption('plan');
  await waitPolicy(policy => policy.mode === 'plan');
  const change = await page.evaluate(() => window.step.call('toolStage', { path: 'notes.md', content: 'Reviewed synthetic content' }));
  await assert.rejects(
    page.evaluate(id => window.step.call('toolApply', { id }), change.id),
    /PLAN_MODE_BLOCKED/,
  );
  await assert.rejects(access(join(workspace, 'notes.md')));
  await page.getByRole('combobox', { name: 'สิทธิ์เครื่องมือ' }).selectOption('ask');
  await waitPolicy(policy => policy.mode === 'ask');
  const apply = async id => {
    await page.evaluate(id => {
      window.policyApply = { done: false };
      void window.step.call('toolApply', { id }).then(
        result => {
          window.policyApply = { done: true, result };
        },
        error => {
          window.policyApply = { done: true, error: error.message };
        },
      );
    }, id);
  };
  await apply(change.id);
  const approval = page.getByRole('alertdialog', { name: 'เขียนไฟล์ที่ตรวจแล้ว?' });
  await approval.waitFor();
  await assert.rejects(access(join(workspace, 'notes.md')));
  await approval.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await page.waitForFunction(() => window.policyApply.done);
  assert.equal((await page.evaluate(() => window.policyApply)).result, null);
  await apply(change.id);
  await approval.getByRole('checkbox').check();
  await approval.getByRole('button', { name: 'อนุญาตใน workspace นี้', exact: true }).click();
  await page.waitForFunction(() => window.policyApply.done);
  assert.equal(await readFile(join(workspace, 'notes.md'), 'utf8'), 'Reviewed synthetic content');
  const next = await page.evaluate(() => window.step.call('toolStage', { path: 'notes.md', content: 'Second reviewed content' }));
  await page.evaluate(id => window.step.call('toolApply', { id }), next.id);
  assert.equal(await readFile(join(workspace, 'notes.md'), 'utf8'), 'Second reviewed content');
  const rules = (await page.evaluate(() => window.step.call('snapshot'))).approvals;
  assert.equal(rules.length, 1);
  const classified = await page.evaluate(() =>
    window.step.call('toolStage', { path: 'review-only.md', content: 'Email: test@example.invalid' }),
  );
  await apply(classified.id);
  await approval.getByText(/ระดับข้อมูลจากการตรวจรูปแบบ: จำกัดการเข้าถึง/).waitFor();
  await approval.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await page.waitForFunction(() => window.policyApply.done);
  assert.doesNotMatch(JSON.stringify(rules), /notes\.md|Reviewed/);
  await page.evaluate(id => window.step.call('approvalRemove', { id }), rules[0].id);
  const final = await page.evaluate(() => window.step.call('toolStage', { path: 'notes.md', content: 'Pending final content' }));
  await apply(final.id);
  await approval.waitFor();
  // A reload cancels pending consent; remembered consent cannot defeat the new deny rule either.
  await writeFile(
    join(home, 'desktop-policy.json'),
    JSON.stringify({ permission: { pathRules: [{ pattern: 'notes.md', allow: false }] } }),
  );
  await waitPolicy(policy => policy.source === 'managed');
  await page.waitForFunction(() => window.policyApply.done);
  assert.equal(await readFile(join(workspace, 'notes.md'), 'utf8'), 'Second reviewed content');
  await assert.rejects(
    page.evaluate(id => window.step.call('toolApply', { id }), final.id),
    /PATH_RULE_DENIED/,
  );
  await mkdir(join(workspace, '.azure'));
  await writeFile(join(workspace, '.azure', 'tokens.json'), 'synthetic private');
  await assert.rejects(
    page.evaluate(() => window.step.call('toolRead', { path: '.azure/tokens.json' })),
    /SENSITIVE_PATH/,
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  await writeFile(
    join(home, 'desktop-policy.json'),
    JSON.stringify({ hooks: [{ type: 'http', url, event: 'pre_tool_use', matcher: 'files', blockOnFailure: true }] }),
  );
  await waitPolicy(policy => policy.hooks === 1);
  await assert.rejects(
    page.evaluate(() => window.step.call('toolFiles')),
    /HOOK_BLOCKED/,
  );
  // Pilot mode asks less elsewhere, but a write is still asked about every time and counted locally.
  await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ pilot: true }));
  await waitPolicy(policy => policy.pilot === true && policy.hooks === 0);
  const before = (await page.evaluate(() => window.step.call('snapshot'))).consentMetrics;
  const pilotChange = await page.evaluate(() => window.step.call('toolStage', { path: 'notes.md', content: 'Pilot content' }));
  await apply(pilotChange.id);
  await approval.waitFor();
  await approval.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await page.waitForFunction(() => window.policyApply.done);
  assert.equal(await readFile(join(workspace, 'notes.md'), 'utf8'), 'Second reviewed content');
  const after = (await page.evaluate(() => window.step.call('snapshot'))).consentMetrics;
  assert.equal(after.prompts, before.prompts + 1);
  assert.equal(after.cancelled, before.cancelled + 1);
  await writeFile(join(home, 'desktop-policy.json'), '{broken');
  await waitPolicy(policy => policy.problems.length > 0);
  // A broken file falls back to the defaults, never to what the broken file asked for.
  assert.equal((await page.evaluate(() => window.step.call('snapshot'))).policy.source, 'default');
  await page.evaluate(() => window.step.call('toolFiles'));
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'นโยบายองค์กร' }).click();
  await page.getByRole('alert').filter({ hasText: 'อ่านนโยบายไม่สำเร็จ' }).waitFor();
  // The reason is shown too, so an administrator knows what to fix.
  await page.getByRole('alert').getByText('policy file is not valid JSON; using safe defaults').waitFor();
  await page.screenshot({ path: 'release/qa/policy-settings.png', fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(
    'release/qa/policy-smoke.json',
    JSON.stringify(
      {
        passed: true,
        profile: 'synthetic',
        checks: [
          'plan blocks writes',
          'approval cancel/remember/revoke',
          'policy reload cancels consent',
          'sensitive paths',
          'hook blocks',
          'pilot keeps write consent',
          'invalid policy defaults',
          'policy settings UI',
        ],
      },
      null,
      2,
    ),
  );
  process.stdout.write('Policy smoke passed (synthetic profile; no real provider calls).\n');
} finally {
  server.closeAllConnections();
  server.close();
  await child.close();
}
