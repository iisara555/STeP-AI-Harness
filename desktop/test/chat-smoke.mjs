// Real renderer/preload/host/RPC path with a synthetic provider and isolated files. No account or quota is used.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const home = await mkdtemp(join(tmpdir(), 'step-chat-smoke-')),
  workspace = join(home, 'files');
await mkdir(workspace);
await mkdir('release/qa', { recursive: true });
const executable = join(home, 'codex.mjs');
await writeFile(
  executable,
  `import {createInterface} from 'node:readline';
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;
 const result=r.method==='thread/start'?{thread:{id:'thread'}}:r.method==='model/list'?{data:[{id:'synthetic-chat',displayName:'Synthetic Chat',isDefault:true}]}:{};
 send({id:r.id,result});if(r.method==='turn/start'){const prompt=r.params.input[0].text;const text=prompt.includes('Second message')?'Second answer received':prompt.includes('Draft request')?'# Synthetic draft\\nEditable output':prompt.includes('Tool proposal')?'Review this request\\n\\n\u0060\u0060\u0060step-tool\\n{"tool":"terminal","input":"echo proposed"}\\n\u0060\u0060\u0060':'First answer received';
 if(prompt.startsWith('Use the live web search tool now')){send({method:'item/started',params:{item:{id:'search',type:'webSearch',action:{type:'search'}}}});setTimeout(()=>{send({method:'item/completed',params:{item:{id:'search',type:'webSearch'}}});send({method:'item/agentMessage/delta',params:{delta:'Synthetic evidence only. [Government fixture](https://www.thaigov.go.th/example)'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});},1600);return;}
 if(prompt.includes('Fresh web search evidence')){send({method:'item/agentMessage/delta',params:{delta:'Synthetic holiday answer '}});setTimeout(()=>{send({method:'item/agentMessage/delta',params:{delta:'from retrieved evidence'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});},3400);return;}
 setTimeout(()=>{send({method:'item/agentMessage/delta',params:{delta:text}});send({method:'turn/completed',params:{turn:{status:'completed'}}});},120);}
});`,
);
const server = createServer((_req, res) =>
  res.end(
    '<html><head><title>Synthetic Browser</title></head><body><h1>Browser fixture</h1><p>Public synthetic content.</p></body></html>',
  ),
);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
const errors = [];
try {
  const page = await app.firstWindow();
  async function waitComplete(id) {
    for (let i = 0; i < 200; i++) {
      const data = await page.evaluate(() => window.step.call('snapshot'));
      const session = id ? data.sessions.find(s => s.id === id) : data.sessions[0];
      if (session?.status === 'review') return session;
      if (session?.status === 'error') throw new Error(JSON.stringify(session.messages));
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('Synthetic provider did not complete');
  }
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.setViewportSize({ width: 1000, height: 760 });
  // Populate only this synthetic SQLite store, leaving the installed profile untouched.
  await app.evaluate(
    async ({ app }, data) => {
      const { DatabaseSync } = process.mainModule.require('node:sqlite');
      const db = new DatabaseSync(joinPath(app.getPath('userData'), 'workspace.sqlite'));
      function joinPath(a, b) {
        return a + '/' + b;
      }
      const put = (kind, id, value) =>
        db
          .prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value')
          .run(kind, id, JSON.stringify(value));
      const s = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='settings' AND id='main'").get().value);
      put('settings', 'main', { ...s, workspace: data.workspace, tourDone: true });
      put('connection', 'synthetic', {
        id: 'synthetic',
        provider: 'openai',
        mode: 'subscription',
        model: '',
        executable: data.executable,
        customRuntime: true,
        ready: true,
        note: 'Synthetic fixture',
        modelsAt: new Date().toISOString(),
      });
      db.close();
    },
    { workspace, executable },
  );
  await page.reload();
  await page.locator('.composer textarea').waitFor();
  await page.locator('.composer textarea').fill('First message');
  await page.keyboard.press('Enter');
  const consent = page.getByRole('alertdialog', { name: 'ยืนยันการส่งข้อมูลให้ AI' });
  await consent.waitFor();
  assert.equal(await page.locator('.composer textarea').inputValue(), 'First message');
  await consent.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้' }).click();
  await page.getByText('First answer received', { exact: true }).waitFor();
  await waitComplete();
  let snapshot = await page.evaluate(() => window.step.call('snapshot'));
  const id = snapshot.sessions[0].id;
  assert.deepEqual(
    snapshot.sessions[0].messages.filter(m => m.role !== 'status').map(m => m.text),
    ['First message', 'First answer received'],
  );
  assert.equal(snapshot.sessions[0].proposals.length, 0);
  assert.equal(await page.locator('.composer textarea').inputValue(), '');
  await page.locator('.composer textarea').fill('ประกาศวันหยุดราชการปีงบ 2570');
  await page.getByText('Web Search อัตโนมัติ · ค้นแหล่งข้อมูลล่าสุดก่อนตอบ', { exact: true }).waitFor();
  await page.keyboard.press('Enter');
  await page.getByText('กำลังค้นเว็บ', { exact: true }).waitFor();
  await expect(page.locator('.activity-detail')).toContainText('แอปยังทำงานอยู่');
  await page.screenshot({ path: 'release/qa/web-search-running.png', fullPage: true });
  await page.getByText('Synthetic holiday answer', { exact: false }).waitFor();
  // A heartbeat must keep the already streamed answer visible until completion.
  await page.waitForTimeout(3100);
  await expect(page.locator('.message-body').last()).toContainText('Synthetic holiday answer');
  await waitComplete(id);
  await page.getByRole('button', { name: 'Government fixture · www.thaigov.go.th' }).waitFor();
  const searched = await page.evaluate(() => window.step.call('snapshot'));
  assert.equal(searched.sessions[0].messages.at(-1).text, 'Synthetic holiday answer from retrieved evidence');
  assert.equal(searched.sessions[0].messages.at(-1).webSources[0].url, 'https://www.thaigov.go.th/example');
  await page.locator('.composer textarea').fill('Second message');
  await page.locator('.send').click();
  await page.getByText('Second answer received', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Draft / Output', exact: true }).click();
  await page.locator('.composer textarea').fill('Draft request');
  await page.keyboard.press('Enter');
  await waitComplete(id);
  await page.getByText('ใช้ร่างนี้', { exact: true }).waitFor();
  snapshot = await page.evaluate(() => window.step.call('snapshot'));
  assert.match(snapshot.sessions[0].proposals.at(-1).text, /Synthetic draft/);
  await page.getByText('ใช้ร่างนี้', { exact: true }).click();
  await page.locator('.draft-editor').filter({ hasText: 'Synthetic draft' }).waitFor();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.locator('.composer textarea').fill('Tool proposal');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /ตรวจ terminal: echo proposed/ }).click();
  await expect(page.getByRole('textbox', { name: 'Terminal command' })).toHaveValue('echo proposed');
  assert.equal((await page.evaluate(() => window.step.call('toolTasks'))).length, 0, 'tool proposals never execute themselves');
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await page
    .getByRole('textbox', { name: 'Terminal command' })
    .fill(process.platform === 'win32' ? 'Write-Output "terminal-ui-ok"' : 'echo terminal-ui-ok');
  await page.getByRole('button', { name: 'ตรวจและรัน' }).click();
  await page.locator('.task-card pre').filter({ hasText: 'terminal-ui-ok' }).waitFor();
  await page.getByRole('button', { name: 'ใช้ผลใน Chat', exact: true }).click();
  await page.locator('.send').click();
  await consent.waitFor();
  await consent.getByRole('button', { name: 'มีสิทธิ์ส่งข้อมูลนี้' }).click();
  await waitComplete(id);
  const withSource = await page.evaluate(() => window.step.call('snapshot'));
  assert.match(withSource.sessions[0].sourceText, /terminal-ui-ok/);
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: 'สร้างไฟล์ใหม่' }).click();
  await page.getByRole('textbox', { name: 'File path' }).fill('new.txt');
  await page.getByRole('textbox', { name: 'File content' }).fill('Reviewed file content');
  await page.getByRole('button', { name: 'ตรวจใน Changes' }).click();
  await page.getByRole('button', { name: 'บันทึกที่ตรวจแล้ว' }).click();
  await page.waitForTimeout(100);
  assert.equal(await readFile(join(workspace, 'new.txt'), 'utf8'), 'Reviewed file content');
  await page.getByRole('button', { name: 'Browser', exact: true }).click();
  await page.getByRole('textbox', { name: 'Browser URL' }).fill('http://127.0.0.1:' + server.address().port);
  await page.getByRole('button', { name: 'เปิดเว็บ', exact: true }).click();
  await page.getByRole('button', { name: 'อ่านหน้าเว็บปัจจุบัน' }).click();
  await page.locator('.browser-preview pre').filter({ hasText: 'Browser fixture' }).waitFor();
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'release/qa/chat-workspace-light.png', fullPage: true });
  await page.evaluate(async () => {
    const s = await window.step.call('snapshot');
    await window.step.call('settings', { ...s.settings, theme: 'dark' });
  });
  await page.reload();
  const openOutput = page.getByRole('button', { name: 'เปิดร่าง', exact: true });
  if (await openOutput.count()) await openOutput.click();
  await page.locator('.draft-editor').waitFor();
  await page.screenshot({ path: 'release/qa/chat-workspace-dark.png', fullPage: true });
  // An unready connection reports the blocker and preserves the typed request.
  await app.evaluate(async ({ app }) => {
    const { DatabaseSync } = process.mainModule.require('node:sqlite');
    const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
    const row = db.prepare("SELECT value FROM records WHERE kind='connection' AND id='synthetic'").get();
    const c = JSON.parse(row.value);
    c.ready = false;
    db.prepare("UPDATE records SET value=? WHERE kind='connection' AND id='synthetic'").run(JSON.stringify(c));
    db.close();
  });
  await page.reload();
  await page.locator('.composer textarea').fill('Keep this unsent message');
  await page.locator('.send').click();
  await page.getByText('กรุณาเชื่อมต่อและทดสอบ AI ในการตั้งค่าก่อน', { exact: true }).waitFor();
  assert.equal(await page.locator('.composer textarea').inputValue(), 'Keep this unsent message');
  assert.deepEqual(errors, []);
  await writeFile(
    'release/qa/chat-smoke.json',
    JSON.stringify(
      {
        passed: true,
        profile: 'synthetic',
        checks: [
          'Enter send',
          'first-send consent replay',
          'button send',
          'direct chat answer',
          'public holiday search routing',
          'native web-search progress',
          'heartbeat preserves streaming',
          'web source cards',
          'draft output',
          'inert AI tool proposals',
          'terminal output',
          'tool-result privacy consent',
          'reviewed file changes',
          'sandbox browser reader',
          'unready connection keeps input',
        ],
        sessionId: id,
      },
      null,
      2,
    ),
  );
  console.log('Chat and tools Electron smoke passed (synthetic provider, no live account calls).');
} finally {
  await app.close();
  await new Promise(r => server.close(r));
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
