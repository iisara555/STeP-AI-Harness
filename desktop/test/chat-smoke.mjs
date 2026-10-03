// Real renderer/preload/host/RPC path with a synthetic provider and isolated files. No account or quota is used.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
// A minimal PDF; an empty string makes a page without a text layer, like a scanned page.
function minimalPdf(pages) {
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((text, i) => {
    const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : '';
    objects[4 + i * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objects[5 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map(o => `${String(o).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const home = await mkdtemp(join(tmpdir(), 'step-chat-smoke-')),
  workspace = join(home, 'files');
await mkdir(workspace);
await mkdir('release/qa', { recursive: true });
// Exercise the manual proposal fallback; the enabled loop has its own complete smoke test.
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { toolLoop: false } }));
const executable = join(home, 'codex.mjs');
await writeFile(
  executable,
  `import {createInterface} from 'node:readline';
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;
 const result=r.method==='thread/start'?{thread:{id:'thread'}}:r.method==='model/list'?{data:[{id:'synthetic-chat',displayName:'Synthetic Chat',isDefault:true}]}:{};
 send({id:r.id,result});if(r.method==='turn/start'){const prompt=r.params.input[0].text;const current=prompt.slice(Math.max(prompt.lastIndexOf('<current_message>'),prompt.lastIndexOf('<request>')));const text=current.includes('Second message')?'Second answer received':current.includes('Draft request')?'# Synthetic draft\\nEditable output':current.includes('Tool proposal')?'Review this request\\n\\n\u0060\u0060\u0060step-tool\\n{"tool":"terminal","input":"echo proposed"}\\n\u0060\u0060\u0060':'First answer received';
 if(prompt.startsWith('Use the live web search tool now')){send({method:'item/started',params:{item:{id:'search',type:'webSearch',action:{type:'search'}}}});setTimeout(()=>{send({method:'item/completed',params:{item:{id:'search',type:'webSearch'}}});send({method:'item/agentMessage/delta',params:{delta:'Synthetic evidence only. [Government fixture](https://www.thaigov.go.th/example)'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});},1600);return;}
 if(prompt.includes('<web_evidence>')){send({method:'item/agentMessage/delta',params:{delta:'Synthetic holiday answer '}});setTimeout(()=>{send({method:'item/agentMessage/delta',params:{delta:'from retrieved evidence'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});},3400);return;}
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
  // Skipping saves settings before the wizard closes; reading the store earlier races that write.
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ state: 'detached' });
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
  // The first send shows the usage terms; sending waits until they are ticked.
  const acceptAndSend = consent.getByRole('button', { name: 'รับทราบและส่ง' });
  await expect(acceptAndSend).toBeDisabled();
  await consent.getByRole('checkbox', { name: 'ฉันอ่านและรับทราบข้อตกลงการใช้งาน' }).check();
  await acceptAndSend.click();
  await expect.poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).settings.termsVersion).toBe('2026-10-02');
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
  // Feedback under an answer: a rating stays on the message; "needs fixing" proposes, "remember this" saves after the dialog.
  const answer = page.locator('article.message.assistant').first();
  await answer.getByRole('button', { name: 'ดี', exact: true }).click();
  await expect(answer.getByRole('button', { name: 'ดี', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const rated = (await page.evaluate(() => window.step.call('snapshot'))).sessions[0].messages.find(m => m.role === 'assistant');
  assert.equal(rated.feedback, 'good');
  await answer.getByRole('button', { name: 'ต้องแก้', exact: true }).click();
  const fixDialog = page.getByRole('alertdialog', { name: 'คำตอบนี้ต้องแก้อะไร' });
  await fixDialog.locator('textarea').fill('สรุปเป็นตารางท้ายคำตอบ');
  await fixDialog.getByRole('button', { name: 'ส่งความเห็น' }).click();
  await fixDialog.waitFor({ state: 'detached' });
  let memory = await page.evaluate(() => window.step.call('memoryList'));
  assert.ok(memory.proposals.some(p => p.type === 'feedback' && p.text === 'สรุปเป็นตารางท้ายคำตอบ'));
  assert.equal(memory.entries.length, 0, 'feedback waits for confirmation');
  await expect(answer.getByRole('button', { name: 'ต้องแก้', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await answer.getByRole('button', { name: 'จำสิ่งนี้', exact: true }).click();
  const rememberDialog = page.getByRole('alertdialog', { name: 'จำสิ่งนี้ไว้ใช้กับงานถัดไป' });
  assert.equal(await rememberDialog.locator('textarea').inputValue(), 'First answer received');
  await rememberDialog.getByRole('button', { name: 'จำไว้', exact: true }).click();
  await rememberDialog.waitFor({ state: 'detached' });
  memory = await page.evaluate(() => window.step.call('memoryList'));
  assert.ok(memory.entries.some(m => m.text === 'First answer received' && m.scope === 'private'));
  // Task commands sit in the title menu, as in Claude Desktop.
  await page.getByRole('button', { name: 'ตัวเลือกงานนี้' }).click();
  await expect(page.getByRole('menuitem')).toHaveCount(5);
  await page.screenshot({ path: 'release/qa/chat-title-menu.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('menu').waitFor({ state: 'detached' });
  await page.locator('.composer textarea').fill('ประกาศวันหยุดราชการปีงบ 2570');
  await page.getByText('Web Search อัตโนมัติ · ค้นแหล่งข้อมูลล่าสุดก่อนตอบ', { exact: true }).waitFor();
  await page.keyboard.press('Enter');
  await page.getByText('กำลังค้นเว็บ', { exact: true }).waitFor();
  // The waiting motion keeps moving even when the OS asks for reduced motion (Windows animations off).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.activity .goo-a').evaluate(el => getComputedStyle(el).animationName), 'goo-a');
  await page.emulateMedia({ reducedMotion: null });
  // One quiet working line: what is happening and how long it has taken.
  await expect(page.locator('.activity-detail')).toHaveText(/^\d+:\d{2}$|0 วินาที/);
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
  // Chat is the one everyday mode, like other AI apps; the drafting mode stays for tasks that use it.
  await expect(page.getByRole('combobox', { name: 'โหมดทำงาน' }).locator('option[value="draft"]')).toHaveCount(0);
  // The earlier run saves its answer just before it releases the task; wait until a new run is accepted.
  await waitComplete(id);
  await expect
    .poll(() =>
      page.evaluate(
        id =>
          window.step.call('send', { id, text: 'Draft request', mode: 'draft' }).then(
            () => 'sent',
            e => String(e),
          ),
        id,
      ),
    )
    .toBe('sent');
  await waitComplete(id);
  const showDraft = page.getByRole('button', { name: 'เปิดร่าง', exact: true });
  if (await showDraft.count()) await showDraft.click();
  await page.getByText('ใช้ร่างนี้', { exact: true }).waitFor();
  snapshot = await page.evaluate(() => window.step.call('snapshot'));
  assert.match(snapshot.sessions[0].proposals.at(-1).text, /Synthetic draft/);
  await page.getByText('ใช้ร่างนี้', { exact: true }).click();
  await page.locator('.draft-editor').filter({ hasText: 'Synthetic draft' }).waitFor();
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
  const toolApproval = page.getByRole('alertdialog', { name: 'รันคำสั่งนี้บนเครื่อง?' });
  await toolApproval.waitFor();
  assert.equal((await page.evaluate(() => window.step.call('toolTasks'))).length, 0, 'commands wait for human approval');
  await toolApproval.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true }).click();
  await page.locator('.task-card pre').filter({ hasText: 'terminal-ui-ok' }).waitFor();
  await page.getByRole('button', { name: 'ใช้ผลใน Chat', exact: true }).click();
  // Standard consent: a clean source the person picked is sent without another dialog.
  await page.locator('.send').click();
  await waitComplete(id);
  assert.equal(await consent.count(), 0);
  const withSource = await page.evaluate(() => window.step.call('snapshot'));
  // In chat, tool results stay with the conversation's files and are shown on the message they came with.
  assert.match(withSource.sessions[0].files.at(-1).text, /terminal-ui-ok/);
  assert.deepEqual(withSource.sessions[0].messages.filter(m => m.role === 'user').at(-1).files, [{ name: 'ผลจากเครื่องมือในแอป' }]);
  await page.getByRole('button', { name: 'ไฟล์งาน', exact: true }).click();
  await page.getByRole('button', { name: 'สร้างไฟล์ใหม่' }).click();
  await page.getByRole('textbox', { name: 'File path' }).fill('new.txt');
  await page.getByRole('textbox', { name: 'File content' }).fill('Reviewed file content');
  await page.getByRole('button', { name: 'ตรวจใน Changes' }).click();
  await page.getByRole('button', { name: 'บันทึกที่ตรวจแล้ว' }).click();
  await page
    .getByRole('alertdialog', { name: 'เขียนไฟล์ที่ตรวจแล้ว?' })
    .getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true })
    .click();
  await page.waitForTimeout(100);
  assert.equal(await readFile(join(workspace, 'new.txt'), 'utf8'), 'Reviewed file content');
  await page.getByRole('button', { name: 'เว็บ', exact: true }).click();
  await page.getByRole('textbox', { name: 'Browser URL' }).fill('http://127.0.0.1:' + server.address().port);
  await page.getByRole('button', { name: 'เปิดเว็บ', exact: true }).click();
  // The page opens inside the Web tab (no pop-up window) and reads back for the chat.
  await page.locator('.browser-tab.active').waitFor();
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1, 'no pop-up browser window');
  const opened = await page.evaluate(async () => {
    const dock = await window.step.call('browserDock', { action: 'state' });
    return window.step.call('toolBrowserRead', { id: dock.active });
  });
  assert.match(opened.text, /Browser fixture/);
  await page.getByRole('button', { name: 'ปิดเว็บนี้' }).click();
  await page.locator('.browser-tab').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'ผลงาน', exact: true }).click();
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
  // A PDF whose second page has no text layer (like a scanned signature page) goes to the AI as page images when
  // privacy checks are off (the default), without a local OCR install.
  const signed = join(home, 'signed-minutes.pdf');
  await writeFile(signed, minimalPdf(['Meeting minutes: team A sends the draft', '']));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, signed);
  const scanned = await page.evaluate(id => window.step.call('attach', { id }), id);
  assert.equal(scanned.usable, true, JSON.stringify(scanned));
  assert.equal(scanned.vision, true);
  assert.match(scanned.status, /PDF สแกน · ส่งเป็นภาพ 2 หน้า/);
  assert.match(scanned.imagePreview, /^data:image\/jpeg;base64,/);
  // A file that cannot be read is marked on its chip, and sending is refused with the reason instead of dropping
  // the file quietly.
  const broken = join(home, 'signed-minutes-broken.pdf');
  await writeFile(broken, '%PDF-1.4\nnot a real document');
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, broken);
  const before = (await page.evaluate(() => window.step.call('snapshot'))).sessions[0].messages.length;
  await page.getByRole('button', { name: 'ตรวจและแนบเอกสาร' }).click();
  await page.getByRole('dialog', { name: 'ตรวจข้อความแนบ' }).getByText('เปิดหรืออ่านไฟล์นี้ไม่ได้', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'กลับไปที่งาน' }).click();
  await page.locator('.attachments .refused').filter({ hasText: 'signed-minutes-broken.pdf' }).waitFor();
  await page.locator('.composer textarea').fill('สรุปไฟล์นี้');
  await page.keyboard.press('Enter');
  await page.getByText('ส่งไฟล์ “signed-minutes-broken.pdf” ให้ AI ไม่ได้', { exact: false }).waitFor();
  assert.equal((await page.evaluate(() => window.step.call('snapshot'))).sessions[0].messages.length, before, 'nothing was sent');
  assert.equal(await page.locator('.composer textarea').inputValue(), 'สรุปไฟล์นี้');
  await page.getByRole('button', { name: 'นำไฟล์ออก' }).click();
  await page.locator('.composer textarea').fill('');
  // With privacy checks off (the default) an image goes to a vision model as it is: no local OCR service is needed.
  const photo = join(home, 'photo.png');
  await writeFile(
    photo,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTj4AAAAASUVORK5CYII=', 'base64'),
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, photo);
  const attached = await page.evaluate(id => window.step.call('attach', { id, vision: true }), id);
  assert.equal(attached.usable, true, JSON.stringify(attached));
  // Native workflows: the composer offers them, and an approved plan shows as a card whose button runs the execute workflow.
  const picker = page.getByRole('combobox', { name: 'โหมดทำงาน' });
  for (const workflow of ['plan', 'requirements', 'diagnose']) assert.equal(await picker.locator(`option[value="${workflow}"]`).count(), 1);
  assert.equal(await picker.locator('option[value="execute"]').isDisabled(), true, 'nothing to execute before a plan is approved');
  await app.evaluate(async ({ app }, id) => {
    const { DatabaseSync } = process.mainModule.require('node:sqlite');
    const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
    const s = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='session' AND id=?").get(id).value);
    s.workPlan = {
      goal: 'จัดสัมมนา AI Harness',
      tasks: [
        { title: 'ร่างกำหนดการ', status: 'done', note: 'ส่งให้ทีมแล้ว' },
        { title: 'ขออนุมัติงบ (ผู้มีอำนาจ)', status: 'todo' },
      ],
      approvedAt: new Date().toISOString(),
    };
    db.prepare("UPDATE records SET value=? WHERE kind='session' AND id=?").run(JSON.stringify(s), id);
    db.close();
  }, id);
  await page.reload();
  const card = page.locator('.work-plan');
  await card.getByText('เสร็จ 1/2').waitFor();
  await card.getByText('ส่งให้ทีมแล้ว').waitFor();
  const sent = (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === id).messages.length;
  await card.getByRole('button', { name: 'ทำตามแผนต่อ' }).click();
  await expect(picker).toHaveValue('execute');
  await expect
    .poll(async () => {
      const s = (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === id);
      return s.messages.slice(sent).find(m => m.role === 'user')?.text || '';
    })
    .toBe('ลงมือทำตามแผน');
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === id).status)
    .not.toBe('running');
  await page.screenshot({ path: 'release/qa/work-plan.png' });
  await picker.selectOption('chat');
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
          'scanned PDF sent as page images',
          'native workflows and the plan card',
          'draft output',
          'inert AI tool proposals',
          'terminal output',
          'tool-result privacy consent',
          'answer feedback and remember this',
          'reviewed file changes',
          'sandbox browser reader',
          'unready connection keeps input',
          'withheld attachment refuses to send with its reason',
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
