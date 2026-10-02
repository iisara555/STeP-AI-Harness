// Real chat -> tool loop -> isolated browser, with a deterministic local provider and website.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-browser-loop-'));
const workspace = join(home, 'work');
await mkdir(workspace);
const server = createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(
    "<label>Search<input></label><button onclick=\"document.querySelector('p').textContent='Confirmed: '+document.querySelector('input').value\">Apply</button><p>Waiting</p>",
  );
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const executable = join(home, 'provider.mjs');
await writeFile(
  executable,
  `
import readline from 'node:readline';
const send=o=>console.log(JSON.stringify({jsonrpc:'2.0',...o}));
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);send({id:m.id,result:m.method==='thread/start'?{thread:{id:'fixture'}}:{}});
 if(m.method!=='turn/start')return;
 const prompt=m.params.input.map(i=>i.text||'').join('');
 const results=[...prompt.matchAll(/<tool_results>\\s*([\\s\\S]*?)\\s*<\\/tool_results>/g)].map(m=>JSON.parse(m[1])[0]);
 const snapshots=results.filter(r=>r.ok).map(r=>JSON.parse(r.text)).filter(r=>r.snapshot);
 const current=snapshots.at(-1);
 let args,input=current?.tab||${JSON.stringify(url)},content;
 if(!results.length)args={action:'open'};
 else if(results.length===1){args={action:'fill',snapshot:current.snapshot,ref:current.elements.find(e=>e.editable).ref};content='Synthetic success';}
 else if(results.length===2||results.length===4)args={action:'read'};
 else if(results.length===3)args={action:'click',snapshot:current.snapshot,ref:current.elements.find(e=>e.label==='Apply').ref};
 const text=args?'\x60\x60\x60step-tool\\n'+JSON.stringify({tool:'browser_control',input,args,content})+'\\n\x60\x60\x60':current?.text.includes('Confirmed: Synthetic success')?'Browser task verified':'Browser verification failed';
 send({method:'item/agentMessage/delta',params:{delta:text}});send({method:'turn/completed',params:{turn:{status:'completed'}}});
});`,
);
// The local fixture site is a private address, which the assistant's browser opens only when policy lists it.
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ network: { privateHosts: ['127.0.0.1'] } }));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await expect(page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' })).toHaveCount(0);
  await app.evaluate(
    ({ app }, { workspace, executable }) => {
      const { DatabaseSync } = process.mainModule.require('node:sqlite');
      const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
      const settings = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='settings' AND id='main'").get().value);
      db.prepare("UPDATE records SET value=? WHERE kind='settings' AND id='main'").run(
        JSON.stringify({ ...settings, workspace, tourDone: true, consentedAt: new Date().toISOString(), termsVersion: '2026-10-02' }),
      );
      db.prepare('INSERT INTO records VALUES (?,?,?)').run(
        'connection',
        'fixture',
        JSON.stringify({
          id: 'fixture',
          provider: 'openai',
          mode: 'subscription',
          model: '',
          executable,
          customRuntime: true,
          ready: true,
          note: 'Synthetic',
          modelsAt: new Date().toISOString(),
        }),
      );
      db.close();
    },
    { workspace, executable },
  );
  await page.reload();
  await page.evaluate(() =>
    window.step.onEvent(event => {
      if (event.type === 'approval') window.auditApproval = event.approval;
      if (event.type === 'approval-close' && window.auditApproval?.id === event.approvalId) window.auditApproval = null;
    }),
  );
  await page.locator('.composer textarea').fill(`ช่วยอ่านเว็บ ${url} และกรอกข้อความ Synthetic success แล้วคลิก Apply เพื่อทดสอบในเครื่อง`);
  await page.keyboard.press('Enter');
  // Open, fill and click each ask once. With privacy checks off (the default), page text goes to the AI without asking.
  const titles = [];
  for (let i = 0; i < 3; i++) {
    // Each approval follows a model step; slow runners (macOS x64) need more than the 5 s default.
    await expect.poll(() => page.evaluate(() => Boolean(window.auditApproval)), { timeout: 30000 }).toBe(true);
    const dialog = page.getByRole('alertdialog');
    await dialog.waitFor();
    const approval = await page.evaluate(() => window.auditApproval);
    titles.push(approval.title);
    await dialog.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.auditApproval?.id)).not.toBe(approval.id);
  }
  await expect(page.getByText('Browser task verified', { exact: true })).toBeVisible({ timeout: 15000 });
  const browsers = await app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .filter(w => w.getURL().startsWith('http:'))
      .map(w => ({ partition: w.session.isPersistent(), url: w.getURL() })),
  );
  assert.equal(browsers.length, 1);
  assert.equal(browsers[0].partition, false);
  // The page shows inside the main window's Web tab, not in a pop-up window.
  const docked = await app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    const view = windows[0].contentView.children.find(v => v.webContents?.getURL().startsWith('http:'));
    return { windows: windows.length, bounds: view?.getBounds(), visible: view?.getVisible() };
  });
  assert.equal(docked.windows, 1, 'no pop-up browser window');
  assert.ok(docked.bounds && docked.bounds.width > 100 && docked.bounds.height > 100, JSON.stringify(docked));
  assert.equal(docked.visible, true);
  await page.locator('.browser-tab.active').waitFor();
  const host = await page.locator('.browser-host').boundingBox();
  assert.ok(Math.abs(host.x - docked.bounds.x) <= 1 && Math.abs(host.width - docked.bounds.width) <= 1, 'page drawn over the Web tab');
  await page.screenshot({ path: 'release/qa/browser-docked.png' });
  // A dialog over the panel hides the page and shows its picture instead, so the dialog is never drawn under it.
  const shown = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]
        .contentView.children.filter(v => v.webContents?.getURL().startsWith('http:'))
        .map(v => v.getVisible()),
    );
  await page.locator('[data-tour="palette"]').click();
  await page.getByRole('dialog', { name: 'คำสั่ง' }).waitFor();
  await expect.poll(shown).toEqual([false]);
  await page.locator('.browser-host img').waitFor({ state: 'attached' });
  await page.keyboard.press('Escape');
  await expect.poll(shown).toEqual([true]);
  await expect(page.locator('.browser-host img')).toHaveCount(0);
  // Closing the tab closes the page.
  await page.getByRole('button', { name: 'ปิดเว็บนี้' }).click();
  await expect.poll(shown).toEqual([]);
  await expect(page.locator('.browser-tab')).toHaveCount(0);
  assert.equal(titles.filter(t => t === 'ส่งผลเครื่องมือให้ AI?').length, 0);
  assert.equal(await page.getByRole('alertdialog').count(), 0);
  console.log(
    'Browser chat loop passed: open -> fill -> read -> click -> read -> verified, 3 action approvals and no data approvals with privacy checks off; local fixtures only.',
  );
} finally {
  await app?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
