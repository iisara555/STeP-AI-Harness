import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-phase4-smoke-')),
  workspace = join(home, 'work'),
  movedWorkspace = join(home, 'other-work'),
  executable = join(home, 'codex.mjs'),
  calls = join(home, 'calls.log'),
  mcp = join(home, 'mcp.mjs');
await mkdir(workspace);
await mkdir(movedWorkspace);
await mkdir('release/qa', { recursive: true });
await writeFile(
  executable,
  `import readline from 'node:readline';import fs from 'node:fs';const send=o=>console.log(JSON.stringify({jsonrpc:'2.0',...o}));
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;send({id:m.id,result:m.method==='thread/start'?{thread:{id:'synthetic'}}:{}});
if(m.method==='turn/start'){const p=(m.params.input||[]).filter(i=>i.type==='text').map(i=>i.text||'').join('');
const retryCase=p.includes('Synthetic retry case');
const text=p.includes('Decompose the request')?JSON.stringify({tasks:retryCase?[{id:'a',query:'Prepare topic C',dependsOn:[]},{id:'b',query:'Prepare topic FAILONCE',dependsOn:[]}]:[{id:'a',query:'Prepare topic A',dependsOn:[]},{id:'b',query:'Prepare topic B',dependsOn:[]}]}):'Phase 4 synthetic draft';
const topic=/"request":"Prepare topic (C|FAILONCE)"/.exec(p)?.[1];if(topic)fs.appendFileSync(${JSON.stringify(calls)},topic+'\\n');
const failing=topic==='FAILONCE'&&!fs.existsSync(${JSON.stringify(calls)}+'.failed');if(failing)fs.writeFileSync(${JSON.stringify(calls)}+'.failed','1');
setTimeout(()=>{if(failing){send({method:'turn/completed',params:{turn:{status:'failed',error:{message:'synthetic subtask failure'}}}});return;}send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:10,outputTokens:5,totalTokens:15}}}});send({method:'item/agentMessage/delta',params:{delta:text}});send({method:'turn/completed',params:{turn:{status:'completed'}}});},40);}});`,
);
await writeFile(
  mcp,
  `import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;let result={};
if(m.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
if(m.method==='tools/list')result={tools:[{name:'echo',description:'Synthetic public text only',inputSchema:{type:'object'}}]};
if(m.method==='tools/call')result={content:[{type:'text',text:'MCP synthetic result'}]};console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result}));});`,
);
await writeFile(
  join(home, 'desktop-policy.json'),
  JSON.stringify({
    // The coordinator dialog is part of the send-time privacy checks.
    checks: { authority: true, privacy: true },
    features: { cron: true, mcp: true, sandbox: false, toolLoop: false },
    mcpServers: [{ name: 'fixture', profile: 'google-workspace', transport: 'stdio', command: process.execPath, args: [mcp] }],
  }),
);
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
  consentedAt: new Date().toISOString(),
  termsVersion: '2026-10-02',
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
put('session', 'parent', {
  id: 'parent',
  title: 'Phase 4 fixture',
  project: 'Test',
  team: 'cc',
  connectionId: 'fake',
  messages: [],
  draft: '',
  revision: 0,
  versions: [],
  proposals: [],
  originalQuery: '',
  answers: [],
  clarification: false,
  status: 'idle',
  updatedAt: new Date().toISOString(),
  sources: [],
  mode: 'draft',
});
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
const errors = [];
let stage = 'startup';
try {
  const page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => typeof window.step?.call === 'function');
  // Establish the synthetic fixture before looking for a conditional control.
  // A failed profile/policy load should report its cause, not a label timeout.
  const initial = await page.evaluate(() => window.step.call('snapshot'));
  assert.equal(initial.policy.features.coordinator, true, 'coordinated drafting is available without a policy override');
  assert.equal(initial.sessions.find(s => s.id === 'parent')?.mode, 'draft', 'fixture parent draft loaded');
  stage = 'coordinator';
  const approve = async title => {
    const dialog = page.getByRole('alertdialog', { name: title });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true }).click();
  };
  const splitDraft = page.getByLabel('แบ่งงานย่อย', { exact: true });
  await expect(splitDraft).not.toBeChecked();
  await splitDraft.check();
  const workMode = page.getByRole('combobox', { name: 'โหมดทำงาน' });
  await workMode.selectOption('chat');
  await expect(splitDraft).toHaveCount(0);
  await workMode.selectOption('draft');
  await expect(splitDraft).not.toBeChecked();
  await splitDraft.check();
  await page.locator('.composer textarea').fill('Prepare a synthetic draft about two public topics.');
  await page.keyboard.press('Enter');
  const consent = page.getByRole('alertdialog', { name: 'ยืนยันการส่งข้อมูลให้ AI' });
  await consent.waitFor();
  await consent.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้', exact: true }).click();
  // The plan names the task, not its internal id, and lists each subtask in the employee's order.
  const planDialog = page.getByRole('alertdialog', { name: 'ตรวจแผนงานย่อยก่อนเริ่ม?' });
  await expect(planDialog).toContainText('Phase 4 fixture');
  await expect(planDialog).toContainText('1. Prepare topic A');
  await expect(planDialog).not.toContainText('งาน parent');
  await approve('ตรวจแผนงานย่อยก่อนเริ่ม?');
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === 'parent').status, {
      timeout: 30000,
    })
    .toBe('review');
  const coordinated = await page.evaluate(() => window.step.call('snapshot'));
  // Two workers; the planner's reply was only the plan. Workers stay out of the task list.
  const workers = coordinated.sessions.filter(s => s.parentId === 'parent');
  assert.equal(workers.length, 2);
  assert.ok(workers.every(s => s.subtask && s.status === 'review'));
  assert.equal(coordinated.sessions.find(s => s.id === 'parent').coordination.state, 'done');
  assert.equal(coordinated.sessions.find(s => s.id === 'parent').proposals[0].text, 'Phase 4 synthetic draft');
  await expect(page.locator('.sidebar .session-open', { hasText: 'Prepare topic' })).toHaveCount(0);
  await expect(page.locator('.sidebar .session-open', { hasText: 'Decompose' })).toHaveCount(0);
  stage = 'coordinator-retry';
  // A subtask that fails keeps the finished ones: "Try again" asks to approve the same plan and runs only the open one.
  await page.getByRole('button', { name: 'เริ่มงานใหม่' }).click();
  await workMode.selectOption('draft');
  // A new, empty task offers the split beside the drafting mode, before its first message.
  await page.locator('.composer').screenshot({ path: 'release/qa/phase4-split-off.png' });
  await splitDraft.check();
  await page.locator('.composer').screenshot({ path: 'release/qa/phase4-split-on.png' });
  await page.locator('.composer textarea').fill('Synthetic retry case with two public topics.');
  await page.keyboard.press('Enter');
  await consent.waitFor();
  await consent.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้', exact: true }).click();
  await approve('ตรวจแผนงานย่อยก่อนเริ่ม?');
  await page.getByText('งานย่อยบางงานยังไม่สำเร็จ', { exact: false }).first().waitFor({ timeout: 30000 });
  const retryTask = async () =>
    (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s =>
      s.messages.some(m => m.text?.includes('Synthetic retry case')),
    );
  const failedRun = await retryTask();
  assert.equal(failedRun.status, 'error');
  assert.equal(failedRun.coordination.state, 'failed');
  assert.deepEqual(Object.keys(failedRun.coordination.done), ['a']);
  await page.getByRole('button', { name: 'ลองอีกครั้ง', exact: true }).click();
  const resumeConsent = page.getByRole('alertdialog', { name: 'ยืนยันการส่งข้อมูลให้ AI' });
  const resumePlan = page.getByRole('alertdialog', { name: 'ตรวจแผนงานย่อยก่อนเริ่ม?' });
  await expect(resumeConsent.or(resumePlan)).toBeVisible();
  if (await resumeConsent.isVisible()) await resumeConsent.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้', exact: true }).click();
  await expect(resumePlan).toContainText('1. Prepare topic C · เสร็จแล้ว');
  await approve('ตรวจแผนงานย่อยก่อนเริ่ม?');
  await expect.poll(async () => (await retryTask()).status, { timeout: 30000 }).toBe('review');
  const resumed = await retryTask();
  assert.equal(resumed.coordination.state, 'done');
  assert.equal(resumed.messages.filter(m => m.role === 'user').length, 1, 'Try again adds no second request');
  assert.deepEqual((await readFile(calls, 'utf8')).trim().split('\n').sort(), ['C', 'FAILONCE', 'FAILONCE'], 'topic C ran once');
  await page.screenshot({ path: 'release/qa/phase4-coordinator-resumed.png' });
  await page.locator('.sidebar .session-open', { hasText: 'Phase 4 fixture' }).click();
  await page.getByRole('button', { name: 'ตัวเลือกงานนี้' }).click();
  stage = 'automation';
  await page.getByRole('menuitem', { name: 'งานตั้งเวลา', exact: true }).click();
  const jobs = page.locator('.schedules');
  await jobs.getByRole('button', { name: 'ตั้งเวลางานใหม่', exact: true }).click();
  await jobs.getByLabel('ชื่องานตั้งเวลา', { exact: true }).fill('Synthetic recurring draft');
  await jobs.getByLabel('สิ่งที่ให้ผู้ช่วยทำ', { exact: true }).fill('Prepare a concise public draft.');
  await jobs.getByLabel('บัญชี AI ของงาน', { exact: true }).selectOption('fake');
  const preview = jobs.getByRole('region', { name: 'สรุปก่อนบันทึก' });
  await expect(preview).toContainText(workspace);
  await expect(preview).toContainText('โมเดลเริ่มต้นของบัญชี');
  await expect(preview).toContainText(/UTC[+-]\d{2}:\d{2}/);
  await jobs.getByLabel('ทำซ้ำ', { exact: true }).selectOption('days');
  await jobs.locator('.schedule-days').getByText('ศ.', { exact: true }).click();
  await jobs.locator('.schedule-days').getByText('จ.', { exact: true }).click();
  await expect(jobs.getByRole('checkbox', { name: 'ศ.', exact: true })).toBeChecked();
  await jobs.getByLabel('เวลา', { exact: true }).fill('16:00');
  await expect(preview).toContainText('ทุก ศ. เวลา 16:00 น.');
  await jobs.getByRole('button', { name: 'บันทึกและเปิดใช้', exact: true }).click();
  await approve('อนุมัติงานตั้งเวลา?');
  await jobs.getByRole('button', { name: 'แก้ไขงาน Synthetic recurring draft', exact: true }).click();
  await jobs.getByLabel('ชื่องานตั้งเวลา', { exact: true }).fill('Updated recurring draft');
  await jobs.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click();
  await approve('อนุมัติงานตั้งเวลา?');
  await expect(jobs.locator('.schedule-card')).toContainText('Updated recurring draft');
  await jobs.getByRole('button', { name: 'พักงาน Updated recurring draft', exact: true }).click();
  await expect(jobs.locator('.schedule-card')).toContainText('พักไว้');
  await jobs.getByRole('button', { name: 'แก้ไขงาน Updated recurring draft', exact: true }).click();
  await expect(jobs.getByRole('checkbox', { name: 'เปิดใช้งานตามเวลาที่ตั้ง' })).not.toBeChecked();
  await expect(preview).toContainText('รอบถัดไปหากเปิดใช้');
  await page.evaluate(async () => {
    const { settings } = await window.step.call('snapshot');
    await window.step.call('settings', { ...settings, language: 'en' });
  });
  await page.reload();
  await page.locator('[data-tour="schedules"]').click();
  await jobs.getByRole('button', { name: 'Edit Updated recurring draft', exact: true }).click();
  await expect(jobs.getByRole('region', { name: 'Review before saving' })).toContainText('Account default model');
  await expect(jobs.getByRole('checkbox', { name: 'Run at the scheduled times' })).not.toBeChecked();
  await page.evaluate(async () => {
    const { settings } = await window.step.call('snapshot');
    await window.step.call('settings', { ...settings, language: 'th' });
  });
  await page.reload();
  await page.locator('[data-tour="schedules"]').click();
  await jobs.getByRole('button', { name: 'แก้ไขงาน Updated recurring draft', exact: true }).click();
  await expect(preview).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1350 });
  await page.screenshot({ path: 'release/qa/phase4-schedule-editor.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await jobs.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click({ timeout: 5000 });
  await expect(jobs.getByRole('form', { name: 'แก้ไขงานตั้งเวลา' })).toHaveCount(0);
  assert.equal((await page.evaluate(() => window.step.call('automationList'))).jobs[0].enabled, false, 'editing preserves pause');
  // A changed workspace must still stop execution; the page offers review, never an automatic rebind/retry.
  await app.evaluate(({ dialog }, workspace) => {
    const original = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => {
      dialog.showOpenDialog = original;
      return { canceled: false, filePaths: [workspace] };
    };
  }, movedWorkspace);
  await page.evaluate(() => window.step.call('workspace'));
  await jobs.getByRole('button', { name: 'ทำตอนนี้', exact: true }).click();
  await approve('เริ่มงานตั้งเวลา?');
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('automationList'))).history[0]?.code)
    .toBe('AUTOMATION_CONTEXT_CHANGED');
  await expect(jobs.locator('.schedule-problem')).toContainText('พื้นที่งานเปลี่ยนแล้ว');
  await page.setViewportSize({ width: 650, height: 1000 });
  assert.equal(await jobs.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'narrow schedule cards do not overflow');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'release/qa/phase4-schedule-recovery.png' });
  await jobs.getByRole('button', { name: 'ตรวจและบันทึกใหม่', exact: true }).click();
  await expect(preview).toContainText(movedWorkspace);
  await jobs.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click();
  await expect(jobs.getByRole('form', { name: 'แก้ไขงานตั้งเวลา' })).toHaveCount(0);
  const rebound = (await page.evaluate(() => window.step.call('automationList'))).jobs[0];
  assert.equal(rebound.workspace, movedWorkspace);
  assert.equal(rebound.enabled, false, 'reviewing a changed context preserves pause');
  await jobs.getByRole('button', { name: 'ทำตอนนี้', exact: true }).click();
  await approve('เริ่มงานตั้งเวลา?');
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('automationList'))).history[0]?.status, { timeout: 30000 })
    .toBe('review');
  const history = await page.evaluate(() => window.step.call('automationList'));
  assert.ok(history.history[0].sessionId);
  await expect(jobs.locator('.schedule-card')).toContainText('ร่างรอตรวจ');
  await expect(jobs.locator('.schedule-problem')).toHaveCount(0);
  await page.screenshot({ path: 'release/qa/phase4-schedules.png' });
  await jobs.getByRole('button', { name: 'ลบงาน Updated recurring draft', exact: true }).click();
  await page
    .getByRole('alertdialog', { name: 'ลบงาน "Updated recurring draft"?' })
    .getByRole('button', { name: 'ลบงาน', exact: true })
    .click();
  await expect(jobs.locator('.schedule-card')).toHaveCount(0);
  stage = 'mcp';
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.getByPlaceholder('พิมพ์เพื่อค้นหางานหรือคำสั่ง…').fill('MCP');
  await page.keyboard.press('Enter');
  const tools = page.getByRole('alertdialog', { name: 'เครื่องมือเพิ่มเติม (MCP และ Docker)' });
  await tools.getByText('บริการเสริม', { exact: true }).click();
  await tools.getByLabel('MCP server', { exact: true }).selectOption('fixture');
  await tools.getByRole('button', { name: 'ทดสอบ Google Workspace · fixture', exact: true }).click();
  await approve('ค้นหา MCP?');
  await approve('ค้นหาเครื่องมือจาก MCP?');
  await expect(tools.locator('pre')).toContainText('echo');
  await tools.getByLabel('ชื่อเครื่องมือ MCP', { exact: true }).fill('echo');
  await tools.getByRole('button', { name: 'ตรวจและเรียกเครื่องมือ', exact: true }).click();
  await approve('เรียก MCP?');
  await approve('เรียกใช้เครื่องมือ MCP?');
  await expect(tools.locator('pre')).toContainText('MCP synthetic result');
  await page.screenshot({ path: 'release/qa/phase4-automations-mcp.png' });
  await tools.getByRole('button', { name: 'ปิด', exact: true }).click();
  const unsafe = await page.evaluate(() => window.step.call('sandboxRun', { command: 'cat .env', files: [] }).catch(e => String(e)));
  assert.ok(unsafe.includes('SENSITIVE_PATH'));
  assert.deepEqual(errors, []);
  await writeFile(
    'release/qa/phase4-smoke.json',
    JSON.stringify(
      {
        passed: true,
        synthetic: true,
        coordinatorChildSessions: 2,
        cronCrudHistory: true,
        mcpDiscoveryCall: true,
        sandboxProtectedPathDenied: true,
      },
      null,
      2,
    ),
  );
  console.log('Phase 4 real Electron IPC/UI/SQLite smoke passed with synthetic provider/MCP');
} catch (e) {
  const page = await app.firstWindow();
  const state = await page
    .evaluate(async () => {
      try {
        const snapshot = await window.step.call('snapshot');
        return {
          policy: { source: snapshot.policy.source, features: snapshot.policy.features, problems: snapshot.policy.problems },
          sessions: snapshot.sessions.map(s => ({ id: s.id, mode: s.mode, status: s.status })),
          onboarding: snapshot.settings.onboarding,
          language: snapshot.settings.language,
          labels: [...document.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')),
        };
      } catch {
        return { snapshotUnavailable: true };
      }
    })
    .catch(() => ({ rendererUnavailable: true }));
  await writeFile('release/qa/phase4-failure.json', JSON.stringify({ stage, errors, state }, null, 2));
  console.error(JSON.stringify({ smoke: 'phase4', stage, errors, state }));
  await page.screenshot({ path: 'release/qa/phase4-failed.png' });
  throw e;
} finally {
  await app.close();
}
