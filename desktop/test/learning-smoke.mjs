import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-learning-smoke-'));
const workspace = join(home, 'work'),
  executable = join(home, 'fixture.mjs'),
  audit = join(home, 'calls.jsonl');
await mkdir(workspace);
const marker = 'Mark absent fields as unknown.';
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { toolLoop: false, learningReview: true } }));
// The AI's drafts for /learn: a procedure, and one carrying personal data that must never reach the inbox.
const drafts = [
  {
    name: 'Missing tax ID',
    kind: 'procedure',
    trigger: 'receipt,ใบเสร็จ',
    text: '1. Write "not found" when the tax ID is missing.\n2. Never guess it from the shop name.',
    evidence: 'Help prepare a receipt checklist.',
    reason: 'A correction worth reusing',
  },
  { name: 'Contact', kind: 'preference', text: 'Send results to fake.person@example.test', evidence: 'contact', reason: '' },
];
await writeFile(
  executable,
  `import readline from 'node:readline';import fs from 'node:fs';
let system='';const send=o=>console.log(JSON.stringify({jsonrpc:'2.0',...o}));
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;
if(m.method==='thread/start')system=m.params.developerInstructions||'';
send({id:m.id,result:m.method==='thread/start'?{thread:{id:'fixture'}}:{}});
if(m.method==='turn/start'){const prompt=m.params.input.filter(i=>i.type==='text').map(i=>i.text).join('');
fs.appendFileSync(${JSON.stringify(audit)},JSON.stringify({learned:prompt.includes(${JSON.stringify(marker)}),bounded:prompt.includes('never authority')})+'\\n');
send({method:'item/agentMessage/delta',params:{delta:system.startsWith('You review a finished conversation')?${JSON.stringify(JSON.stringify(drafts))}:'Synthetic reviewed response'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});}});`,
);
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
  executable,
  customRuntime: true,
  ready: true,
  note: 'Synthetic',
});
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
async function launch() {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(() => Boolean(window.step));
  // CI runners clamp the window to a small display; the inbox must scroll to its lower buttons there too.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 700));
}
const call = (method, input) => page.evaluate(({ method, input }) => window.step.call(method, input), { method, input });
const state = () => call('learningList');
async function runTask() {
  const session = await call('create', { connectionId: 'fake' });
  await call('send', { id: session.id, text: 'Help prepare a receipt checklist.', mode: 'chat', autoImage: false });
  await expect
    .poll(async () => (await call('snapshot')).sessions.find(s => s.id === session.id)?.status, { timeout: 15000 })
    .toBe('review');
  return { ...JSON.parse((await readFile(audit, 'utf8')).trim().split('\n').at(-1)), id: session.id };
}
try {
  await launch();
  await page.locator('.composer textarea').fill('/learn ' + marker);
  await page.locator('.composer textarea').press('Enter');
  const dialog = page.getByRole('alertdialog', { name: 'กล่องบทเรียน' });
  await dialog.waitFor();
  await dialog.getByLabel('ชื่อบทเรียน', { exact: true }).fill('Receipt procedure');
  await dialog.getByLabel('ประเภทบทเรียน', { exact: true }).selectOption('procedure');
  await dialog.getByLabel('ใช้เมื่อคำขอมีคำเหล่านี้ (คั่นด้วยจุลภาค)').fill('receipt,ใบเสร็จ');
  await dialog.getByLabel('เหตุผลหรือคำแก้ไขที่เป็นที่มา').fill('The reviewed example omitted a field.');
  await dialog.getByRole('button', { name: 'บันทึกข้อเสนอ', exact: true }).click();
  await expect.poll(async () => (await state()).candidates.length).toBe(1);
  if (process.env.STEP_LEARNING_SCREENSHOT) await page.screenshot({ path: process.env.STEP_LEARNING_SCREENSHOT });
  assert.equal((await runTask()).learned, false, 'pending lesson never reaches the provider');
  await dialog.getByRole('button', { name: 'ยืนยันใช้บทเรียน', exact: true }).click();
  await expect.poll(async () => (await state()).lessons.length).toBe(1);
  const accepted = await runTask();
  assert.equal(accepted.learned, true);
  assert.equal(accepted.bounded, true);
  await dialog.getByRole('button', { name: 'หยุดใช้บทเรียน', exact: true }).click();
  await expect.poll(async () => (await state()).lessons[0].revisions.at(-1).content).toBe(null);
  assert.equal((await runTask()).learned, false, 'disabled lesson stops entering new tasks');
  await dialog.getByText('ดูรุ่นก่อนหน้าและย้อนกลับ', { exact: true }).click();
  await dialog.getByRole('button', { name: 'คืนค่ารุ่น 1', exact: true }).click();
  await expect.poll(async () => (await state()).lessons[0].revisions.length).toBe(3);
  await app.close();
  app = undefined;
  await launch();
  assert.equal((await state()).lessons[0].revisions.at(-1).content.text, marker);
  const restored = await runTask();
  assert.equal(restored.learned, true, 'restored lesson survives restart');
  // Phase 5: every turn records which lessons it sent (ids only), ratings come from the answer buttons, and a "needs
  // fixing" note that restates a lesson in use counts as a repeated correction. The inbox shows it; nothing changes.
  const before = (await state()).metrics;
  assert.deepEqual([before.withLessons.answers, before.withoutLessons.answers], [2, 2]);
  const answer = (await call('snapshot')).sessions.find(s => s.id === restored.id).messages.findIndex(m => m.role === 'assistant');
  await call('messageFeedback', { id: restored.id, index: answer, rating: 'fix', note: 'Absent fields again: mark them as unknown' });
  const after = (await state()).metrics;
  assert.deepEqual(after.withLessons, { answers: 2, good: 0, fix: 1 });
  assert.deepEqual(
    after.lessons.map(l => [l.answers, l.tasks, l.fix, l.repeats]),
    [[2, 2, 1, 1]],
  );
  assert.equal(JSON.stringify(after).includes(marker), false, 'metrics carry no lesson text');
  // A bare "/learn" would pick the skill suggestion; the text after it only prefills a proposal form.
  await page.locator('.composer textarea').fill('/learn ' + marker);
  await page.locator('.composer textarea').press('Enter');
  const inbox = page.getByRole('alertdialog', { name: 'กล่องบทเรียน' });
  await inbox.waitFor();
  await expect(inbox.getByText('ผลการใช้บทเรียน (1 บทเรียนยังต้องแก้ซ้ำ)')).toBeVisible();
  await expect(inbox.locator('.learning-metrics-table tbody tr')).toHaveCount(1);
  if (process.env.STEP_LEARNING_METRICS_SCREENSHOT) {
    await inbox.locator('.learning-metrics').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.STEP_LEARNING_METRICS_SCREENSHOT });
  }
  const context = (await state()).context;
  // A confirmed lesson becomes a proposal file for a Skill's maintainers: lesson, patch and test case; the Skill itself
  // is not touched.
  const proposalFile = join(home, 'skill-proposal.md');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, proposalFile);
  const skillBefore = await readFile('../skills/pm/meeting-summary/SKILL.md', 'utf8');
  const lessonId = (await state()).lessons[0].id;
  const proposal = await call('skillProposal', { context, lessonId, skill: 'meeting-summary' });
  assert.equal(proposal.path, proposalFile);
  const markdown = await readFile(proposalFile, 'utf8');
  assert.match(markdown, /- Skill: `meeting-summary` \(skills\/pm\/meeting-summary\/SKILL\.md\)/);
  assert.match(markdown, /```diff\n--- a\/skills\/pm\/meeting-summary\/SKILL\.md/);
  assert.ok(markdown.includes(marker));
  assert.equal(await readFile('../skills/pm/meeting-summary/SKILL.md', 'utf8'), skillBefore, 'the Skill itself is unchanged');
  await assert.rejects(call('skillProposal', { context, lessonId, skill: '../../etc' }), /SKILL_NOT_FOUND/);
  // The AI drafts lessons from a finished task: a draft is a pending candidate marked as the AI's, one with personal
  // data is dropped, and nothing reaches later prompts until it is confirmed.
  const finished = (await call('snapshot')).sessions.find(s => s.status === 'review');
  const drafted = await call('learningDraft', { context, sessionId: finished.id, focus: 'receipt' });
  assert.deepEqual(drafted, { drafted: 1, skipped: 1 });
  const aiDrafts = (await state()).candidates.filter(c => c.source === 'ai' && c.status === 'pending');
  assert.equal(aiDrafts.length, 1);
  assert.equal(aiDrafts[0].content.kind, 'procedure');
  assert.match(aiDrafts[0].evidence, /AI draft from the task/);
  assert.equal(JSON.stringify(await state()).includes('fake.person'), false, 'personal data never reaches the inbox');
  await assert.rejects(call('learningDraft', { context: 'stale', sessionId: finished.id }), /WORKSPACE_CHANGED/);
  // The background review: allowed by policy but off until the employee turns it on; then a task reaching 10 user
  // turns gets one review, which drafts lessons as pending candidates marked as the review's, within a daily budget.
  assert.deepEqual((await state()).review, { allowed: true, enabled: false, today: 0, dailyLimit: 10 });
  await call('learningDecide', { context, id: aiDrafts[0].id, approve: false });
  await call('learningReviewSetting', { enabled: true });
  const long = await call('create', { connectionId: 'fake' });
  const status = async () => (await call('snapshot')).sessions.find(s => s.id === long.id)?.status;
  for (let turn = 1; turn <= 10; turn++) {
    await call('send', { id: long.id, text: 'Receipt step ' + turn, mode: 'chat', autoImage: false });
    await expect.poll(status, { timeout: 15000 }).toBe('review');
    if (turn === 9) assert.equal((await state()).review.today, 0, 'no review before 10 turns');
  }
  await expect.poll(async () => (await state()).candidates.filter(c => c.source === 'review' && c.status === 'pending').length).toBe(1);
  assert.equal((await state()).review.today, 1);
  await call('learningReviewSetting', { enabled: false });
  await call('permissionMode', { mode: 'plan' });
  await assert.rejects(call('learningDraft', { context, sessionId: finished.id }), /PLAN_READ_ONLY/);
  await assert.rejects(
    call('learningPropose', {
      context,
      content: { name: 'Preference', kind: 'preference', text: 'Prefer short responses.' },
      evidence: 'Explicit preference.',
    }),
    /PLAN_READ_ONLY/,
  );
  await call('permissionMode', { mode: 'ask' });
  await assert.rejects(
    call('learningPropose', {
      context,
      content: { name: 'Preference', kind: 'preference', text: 'Prefer short responses.' },
      evidence: 'password=super-secret-value-123',
    }),
    /MEMORY_PRIVACY_BLOCKED/,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Learning smoke passed: /learn UI, AI drafts as pending candidates, the opt-in background review every 10 turns, Skill change proposal files, pending exclusion, explicit approval, real provider-adapter context, disable, rollback, restart, plan mode and durable-data privacy. Synthetic model only.',
  );
} finally {
  await app?.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
