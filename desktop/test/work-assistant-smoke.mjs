// Real renderer, host and tool loop with a local website and a synthetic provider; no real accounts or data.
import { _electron as electron, expect } from '@playwright/test';
import { Document, Packer, Paragraph } from 'docx';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-work-assistant-'));
const workspace = join(home, 'work');
await mkdir(workspace);
await mkdir('release/qa/work-assistant', { recursive: true });
await writeFile(join(workspace, 'note.txt'), 'Synthetic source. เลขประจำตัว 1234567890123');
await writeFile(
  join(workspace, 'sample.docx'),
  await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Synthetic document heading and contents')] }] })),
);
const server = createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<h1>Synthetic local website</h1><p>Public test content.</p>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const executable = join(home, 'provider.mjs');
await writeFile(
  executable,
  [
    "import readline from 'node:readline';",
    "import { existsSync } from 'node:fs';",
    "const send=o=>console.log(JSON.stringify({jsonrpc:'2.0',...o}));",
    'const fence=String.fromCharCode(96).repeat(3);',
    "let thread='';",
    "const respond=text=>{send({method:'item/agentMessage/delta',params:{delta:text}});send({method:'turn/completed',params:{turn:{status:'completed'}}});};",
    "const tool=r=>respond(fence+'step-tool\\n'+JSON.stringify(r)+'\\n'+fence);",
    "readline.createInterface({input:process.stdin}).on('line',line=>{",
    " const m=JSON.parse(line); if(m.method==='thread/start')thread='';",
    " send({id:m.id,result:m.method==='thread/start'?{thread:{id:'fixture'}}:{}});",
    " if(m.method!=='turn/start')return;",
    " thread+=m.params.input.map(i=>i.text||'').join('');",
    " if(thread.includes('NEXT_PLAIN_TASK')){const finish=()=>existsSync(" +
      JSON.stringify(join(home, 'plain-release')) +
      ")?respond('Synthetic second task finished'):setTimeout(finish,25);return finish();}",
    " if(thread.includes('1234567890123'))return respond('SYNTHETIC_PRIVACY_FAILURE');",
    ' const results=[...thread.matchAll(/<tool_results>\\s*([\\s\\S]*?)\\s*<\\/tool_results>/g)].map(m=>JSON.parse(m[1])[0]);',
    " if(!results.length)return tool({tool:'files',input:'note.txt'});",
    " if(results.length===1)return tool({tool:'doc_outline',input:'sample.docx'});",
    " if(results.length===2)return tool({tool:'browser_control',input:" + JSON.stringify(url) + ",args:{action:'open'}});",
    " if(results.length===3)return tool({tool:'changes',input:'summary.md',content:'Synthetic summary for review'});",
    " if(results.length===4)return tool({tool:'terminal',input:'echo forbidden'});",
    " if(results[4].code!=='ASSISTANT_COMMAND_DISABLED')return respond('SYNTHETIC_GUARD_FAILURE');",
    " if(results.length===5)return tool({tool:'google_workspace',input:'gmail.send',args:{action:'execute',account:'synthetic',params:{},body:{to:['nobody@example.test'],subject:'Synthetic',text:'Synthetic'}}});",
    " if(results[5].code!=='ASSISTANT_CLOUD_WRITE_DISABLED')return respond('SYNTHETIC_CLOUD_GUARD_FAILURE');",
    " if(results.length===6)return tool({tool:'files',input:'missing-synthetic-file.txt'});",
    " if(results[6].code!=='TOOL_FAILED')return respond('SYNTHETIC_ERROR_FAILURE');",
    " respond('Synthetic task finished; the file proposal needs review.');",
    '});',
  ].join('\n'),
);

const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app;
let page;
let phase = 'launch';
const progress = next => {
  phase = next;
  console.log(`Work assistant smoke: ${next}`);
};
const watchdog = setTimeout(() => {
  console.error(`Work assistant smoke timed out during ${phase}`);
  app?.process()?.kill('SIGKILL');
  server.closeAllConnections();
  process.exit(1);
}, 120000);
try {
  progress('launch Electron');
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true }).click();
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ state: 'detached' });
  await app.evaluate(
    ({ app }, data) => {
      const { DatabaseSync } = process.mainModule.require('node:sqlite');
      const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
      const put = (kind, id, value) =>
        db
          .prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value')
          .run(kind, id, JSON.stringify(value));
      const settings = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='settings' AND id='main'").get().value);
      put('settings', 'main', {
        ...settings,
        workspace: data.workspace,
        team: 'cc',
        tourDone: true,
        termsVersion: '2026-10-02',
        consentedAt: new Date().toISOString(),
      });
      put('connection', 'fake', {
        id: 'fake',
        provider: 'openai',
        mode: 'subscription',
        model: '',
        executable: data.executable,
        customRuntime: true,
        ready: true,
        note: 'Synthetic',
        modelsAt: new Date().toISOString(),
      });
      db.close();
    },
    { workspace, executable },
  );
  await page.reload();
  await page.locator('.statusbar .status-dot.ok').waitFor();
  const created = await page.evaluate(() => window.step.call('create', { connectionId: 'fake', project: 'Synthetic assistant' }));
  await page.reload();
  await page.locator('.statusbar .status-dot.ok').waitFor();
  progress('select assistant mode');
  const mode = page.getByRole('combobox', { name: 'โหมดทำงาน' });
  await mode.focus();
  await expect(mode).toBeFocused();
  if (process.platform === 'darwin') {
    // Playwright keyboard events do not reliably commit the macOS native select popup in CI.
    await mode.selectOption('assistant');
  } else {
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
  }
  await expect(mode).toHaveValue('assistant');
  await expect(page.locator('.work-assistant-guide')).toContainText('ผู้ดูแลต้องเปิดการตรวจข้อมูลส่วนบุคคล');
  await page.screenshot({ path: 'release/qa/work-assistant/privacy-off.png' });
  const blocked = await page.evaluate(async id => {
    try {
      await window.step.call('send', { id, text: 'Read the synthetic note', mode: 'chat', workflow: 'assistant' });
      return 'not blocked';
    } catch (error) {
      return String(error);
    }
  }, created.id);
  assert.match(blocked, /ASSISTANT_PRIVACY_REQUIRED/);
  progress('enable privacy policy');
  await writeFile(
    join(home, 'desktop-policy.json'),
    JSON.stringify({
      checks: { authority: true, privacy: true },
      pilot: false,
      features: { hybridSkillSelection: false },
      network: { privateHosts: ['127.0.0.1'] },
    }),
  );
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).policy.checks.privacy, { timeout: 15000 })
    .toBe(true);
  await expect(page.locator('.work-assistant-guide')).toContainText('อ่านเว็บและข้อมูล Google เมื่อเชื่อมบัญชี');
  await page.evaluate(() => {
    window.syntheticWorkActions = [];
    window.step.onEvent(event => {
      if (event.type === 'work-action') window.syntheticWorkActions.push(event.workAction);
    });
  });
  progress('run synthetic tool sequence');
  await page.locator('.composer textarea').fill('Read the local note and document, inspect the local website, and prepare a summary.');
  await page.keyboard.press('Enter');
  const finished = page.getByText('Synthetic task finished; the file proposal needs review.', { exact: true });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !(await finished.isVisible())) {
    const dialog = page.getByRole('alertdialog').first();
    if (await dialog.isVisible()) {
      const allow = dialog.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true });
      if (await allow.isVisible()) await allow.click();
    }
    await page.waitForTimeout(100);
  }
  await expect(finished).toBeVisible();
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === created.id)?.status, {
      timeout: 15000,
    })
    .toBe('review');
  progress('verify action trace and staged file');
  const snapshot = await page.evaluate(() => window.step.call('snapshot'));
  const run = snapshot.sessions.find(s => s.id === created.id).runs.at(-1);
  assert.equal(run.workflow, 'assistant');
  const records = run.steps.flatMap(step => step.tools || []);
  for (const tool of ['files', 'doc_outline', 'browser_control', 'changes'])
    assert.ok(
      records.some(record => record.tool === tool && record.ok),
      tool,
    );
  assert.ok(records.some(record => record.tool === 'terminal' && record.code === 'ASSISTANT_COMMAND_DISABLED'));
  assert.ok(records.some(record => record.tool === 'google_workspace' && record.code === 'ASSISTANT_CLOUD_WRITE_DISABLED'));
  assert.ok(records.some(record => record.tool === 'files' && record.code === 'TOOL_FAILED'));
  const events = await page.evaluate(() => window.syntheticWorkActions);
  assert.ok(events.some(event => event.tool === 'files' && event.state === 'running'));
  assert.ok(events.some(event => event.tool === 'files' && event.state === 'done'));
  assert.ok(events.some(event => event.tool === 'terminal' && event.state === 'failed'));
  assert.doesNotMatch(JSON.stringify(events), /1234567890123|note\.txt|sample\.docx|127\.0\.0\.1/);
  assert.equal(await readFile(join(workspace, 'note.txt'), 'utf8'), 'Synthetic source. เลขประจำตัว 1234567890123');
  await assert.rejects(readFile(join(workspace, 'summary.md')));
  await expect(page.locator('.work-assistant-activity summary')).toContainText('3 ขั้นตอนติดขัด');
  await expect(page.locator('.work-assistant-activity')).toHaveAttribute('open', '');
  await expect(page.locator('.work-assistant-activity').getByText('เตรียมข้อเสนอแก้ไขไฟล์')).toBeVisible();
  await expect(page.locator('.work-assistant-activity')).toContainText('ติดขัด');
  progress('verify review panel and responsive layouts');
  await page.getByRole('button', { name: 'ไปตรวจ', exact: true }).click();
  await expect(page.locator('.workbench-tabs button[aria-current="page"]')).toHaveText('รายการแก้ไข');
  await page.screenshot({ path: 'release/qa/work-assistant/wide.png' });
  await page.getByText('ขั้นตอนนี้ไม่สำเร็จ ตรวจผลก่อนลองอีกครั้ง หรือแจ้งผู้ดูแลพร้อมรหัส TOOL_FAILED').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'release/qa/work-assistant/unknown-error.png' });
  await page.setViewportSize({ width: 800, height: 900 });
  await page.screenshot({ path: 'release/qa/work-assistant/narrow.png' });
  await page.getByRole('button', { name: 'ไปตรวจ', exact: true }).click();
  await expect(page.locator('.workbench-tabs')).toBeVisible();
  await expect(page.locator('.workbench-tabs button[aria-current="page"]')).toHaveText('รายการแก้ไข');
  await page.screenshot({ path: 'release/qa/work-assistant/narrow-review.png' });
  await page.reload();
  await expect(page.locator('.work-assistant-activity')).toContainText('อ่านไฟล์ในพื้นที่งาน');
  progress('verify persistence and English theme');
  await app.evaluate(({ app }) => {
    const { DatabaseSync } = process.mainModule.require('node:sqlite');
    const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
    const settings = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='settings' AND id='main'").get().value);
    db.prepare("UPDATE records SET value=? WHERE kind='settings' AND id='main'").run(
      JSON.stringify({ ...settings, theme: 'dark', language: 'en' }),
    );
    db.close();
  });
  await page.reload();
  await page.getByRole('combobox', { name: 'Work mode' }).selectOption('assistant');
  await expect(page.locator('.work-assistant-guide')).toContainText('File and web assistant');
  await expect(page.locator('.work-assistant-activity summary')).toContainText('3 need attention');
  await expect(page.locator('.work-assistant-activity')).toContainText('Read workspace files');
  await page.screenshot({ path: 'release/qa/work-assistant/narrow-dark-en.png' });
  // A later ordinary chat in the same session must not display the assistant's previous steps as if they are running now.
  progress('verify ordinary follow-up');
  await page.getByRole('combobox', { name: 'Work mode' }).selectOption('chat');
  await page.locator('.composer textarea').fill('NEXT_PLAIN_TASK');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === created.id)?.status, {
      timeout: 15000,
    })
    .toBe('running');
  await expect(page.locator('.work-assistant-activity')).toHaveCount(0);
  await page.screenshot({ path: 'release/qa/work-assistant/plain-running.png' });
  await writeFile(join(home, 'plain-release'), 'continue');
  await expect(page.getByText('Synthetic second task finished', { exact: true })).toBeVisible({ timeout: 15000 });
  console.log(
    'Work assistant smoke passed: privacy policy, file/document/web tools, staged edit, command denial and persistent action history; synthetic data only.',
  );
} catch (error) {
  console.error(`Work assistant smoke failed during ${phase}`, error);
  throw error;
} finally {
  progress('cleanup');
  await writeFile(join(home, 'plain-release'), 'continue').catch(() => {});
  try {
    if (page && !page.isClosed()) {
      let escapeTimeout;
      try {
        await Promise.race([
          page.keyboard.press('Escape').catch(() => {}),
          new Promise(resolve => {
            escapeTimeout = setTimeout(resolve, 2000);
          }),
        ]);
      } finally {
        clearTimeout(escapeTimeout);
      }
    }
    if (app) {
      let closeTimeout;
      try {
        await Promise.race([
          app.close(),
          new Promise((_, reject) => {
            closeTimeout = setTimeout(() => {
              app.process()?.kill('SIGKILL');
              reject(new Error('ELECTRON_CLEANUP_TIMEOUT'));
            }, 10000);
          }),
        ]);
      } finally {
        clearTimeout(closeTimeout);
      }
    }
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    clearTimeout(watchdog);
  }
}
