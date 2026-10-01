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
    features: { coordinator: true, cron: true, mcp: true, sandbox: false, toolLoop: false },
    mcpServers: [{ name: 'fixture', transport: 'stdio', command: process.execPath, args: [mcp] }],
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
  tourDone: true,
  consentedAt: new Date().toISOString(),
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
try {
  const page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  await page.getByRole('button', { name: 'งานตามรอบ', exact: true }).click();
  const jobs = page.getByRole('alertdialog', { name: 'งานตามรอบและเครื่องมือเพิ่มเติม' });
  await jobs.getByLabel('ชื่องานตามรอบ', { exact: true }).fill('Synthetic recurring draft');
  await jobs.getByLabel('คำขอตามรอบ', { exact: true }).fill('Prepare a concise public draft.');
  await jobs.getByLabel('บัญชีงานตามรอบ', { exact: true }).selectOption('fake');
  await jobs.getByRole('button', { name: 'บันทึกงานตามรอบ', exact: true }).click();
  await jobs.getByRole('button', { name: 'แก้ไขงาน', exact: true }).waitFor();
  await jobs.getByRole('button', { name: 'แก้ไขงาน', exact: true }).click();
  await jobs.getByLabel('ชื่องานตามรอบ', { exact: true }).fill('Updated recurring draft');
  await jobs.getByRole('button', { name: 'บันทึกงานตามรอบ', exact: true }).click();
  await expect(jobs).toContainText('Updated recurring draft');
  await jobs.getByRole('button', { name: 'เริ่มตอนนี้', exact: true }).click();
  await approve('เริ่มงานตามรอบ?');
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('automationList'))).history[0]?.status, { timeout: 30000 })
    .toBe('review');
  const history = await page.evaluate(() => window.step.call('automationList'));
  assert.ok(history.history[0].sessionId);
  await jobs.getByText('เครื่องมือ MCP', { exact: true }).click();
  await jobs.getByLabel('MCP server', { exact: true }).selectOption('fixture');
  await jobs.getByRole('button', { name: 'ค้นหาเครื่องมือ', exact: true }).click();
  await approve('ค้นหา MCP?');
  await approve('ค้นหาเครื่องมือจาก MCP?');
  await expect(jobs.locator('pre')).toContainText('echo');
  await jobs.getByLabel('ชื่อเครื่องมือ MCP', { exact: true }).fill('echo');
  await jobs.getByRole('button', { name: 'ตรวจและเรียกเครื่องมือ', exact: true }).click();
  await approve('เรียก MCP?');
  await approve('เรียกใช้เครื่องมือ MCP?');
  await expect(jobs.locator('pre')).toContainText('MCP synthetic result');
  await page.screenshot({ path: 'release/qa/phase4-automations-mcp.png' });
  await jobs.getByRole('button', { name: 'ลบงาน', exact: true }).click();
  await jobs.getByRole('button', { name: 'ยืนยันลบงาน', exact: true }).click();
  await expect(jobs.getByRole('button', { name: 'แก้ไขงาน', exact: true })).toHaveCount(0);
  await jobs.getByRole('button', { name: 'ปิด', exact: true }).click();
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
  await page.screenshot({ path: 'release/qa/phase4-failed.png' });
  throw e;
} finally {
  await app.close();
}
