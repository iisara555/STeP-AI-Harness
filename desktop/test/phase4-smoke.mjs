import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-phase4-smoke-')),
  workspace = join(home, 'work'),
  executable = join(home, 'codex.mjs'),
  mcp = join(home, 'mcp.mjs');
await mkdir(workspace);
await mkdir('release/qa', { recursive: true });
await writeFile(
  executable,
  `import readline from 'node:readline';const send=o=>console.log(JSON.stringify({jsonrpc:'2.0',...o}));
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;send({id:m.id,result:m.method==='thread/start'?{thread:{id:'synthetic'}}:{}});
if(m.method==='turn/start'){const p=(m.params.input||[]).filter(i=>i.type==='text').map(i=>i.text||'').join('');
const text=p.includes('Decompose the request')?JSON.stringify({tasks:[{id:'a',query:'Prepare topic A',dependsOn:[]},{id:'b',query:'Prepare topic B',dependsOn:[]}]}):'Phase 4 synthetic draft';
setTimeout(()=>{send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:10,outputTokens:5,totalTokens:15}}}});send({method:'item/agentMessage/delta',params:{delta:text}});send({method:'turn/completed',params:{turn:{status:'completed'}}});},40);}});`,
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
    features: { coordinator: true, cron: true, mcp: true, sandbox: false, toolLoop: false },
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
  assert.equal(initial.policy.features.coordinator, true, 'fixture coordinator policy loaded');
  assert.equal(initial.sessions.find(s => s.id === 'parent')?.mode, 'draft', 'fixture parent draft loaded');
  stage = 'coordinator';
  const approve = async title => {
    const dialog = page.getByRole('alertdialog', { name: title });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true }).click();
  };
  await page.getByLabel('แบ่งงานย่อย', { exact: true }).check();
  await page.locator('.composer textarea').fill('Prepare a synthetic draft about two public topics.');
  await page.keyboard.press('Enter');
  const consent = page.getByRole('alertdialog', { name: 'ยืนยันการส่งข้อมูลให้ AI' });
  await consent.waitFor();
  await consent.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้', exact: true }).click();
  await approve('ตรวจแผนงานย่อยก่อนเริ่ม?');
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === 'parent').status, {
      timeout: 30000,
    })
    .toBe('review');
  const coordinated = await page.evaluate(() => window.step.call('snapshot'));
  assert.equal(coordinated.sessions.filter(s => s.parentId === 'parent').length, 3);
  assert.equal(coordinated.sessions.find(s => s.id === 'parent').proposals[0].text, 'Phase 4 synthetic draft');
  await page.getByRole('button', { name: 'ตัวเลือกงานนี้' }).click();
  stage = 'automation';
  await page.getByRole('menuitem', { name: 'งานตั้งเวลา', exact: true }).click();
  const jobs = page.locator('.schedules');
  await jobs.getByRole('button', { name: 'งานใหม่', exact: true }).click();
  await jobs.getByLabel('ชื่องานตั้งเวลา', { exact: true }).fill('Synthetic recurring draft');
  await jobs.getByLabel('สิ่งที่ให้ผู้ช่วยทำ', { exact: true }).fill('Prepare a concise public draft.');
  await jobs.getByLabel('บัญชี AI ของงาน', { exact: true }).selectOption('fake');
  await jobs.getByRole('button', { name: 'บันทึกและเปิดใช้', exact: true }).click();
  await approve('อนุมัติงานตั้งเวลา?');
  await jobs.getByRole('button', { name: 'แก้ไขงาน Synthetic recurring draft', exact: true }).click();
  await jobs.getByLabel('ชื่องานตั้งเวลา', { exact: true }).fill('Updated recurring draft');
  await jobs.getByRole('button', { name: 'บันทึกและเปิดใช้', exact: true }).click();
  await approve('อนุมัติงานตั้งเวลา?');
  await expect(jobs.locator('.schedule-card')).toContainText('Updated recurring draft');
  await jobs.getByRole('button', { name: 'พักงาน Updated recurring draft', exact: true }).click();
  await expect(jobs.locator('.schedule-card')).toContainText('พักไว้');
  await jobs.getByRole('button', { name: 'ทำตอนนี้', exact: true }).click();
  await approve('เริ่มงานตั้งเวลา?');
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('automationList'))).history[0]?.status, { timeout: 30000 })
    .toBe('review');
  const history = await page.evaluate(() => window.step.call('automationList'));
  assert.ok(history.history[0].sessionId);
  await expect(jobs.locator('.schedule-card')).toContainText('ร่างรอตรวจ');
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
  await tools.getByText('เครื่องมือ MCP', { exact: true }).click();
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
        coordinatorChildSessions: 3,
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
