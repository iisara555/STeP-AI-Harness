import { _electron as electron } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-browser-agent-'));
const bundle = join(home, 'browser.cjs');
await build({
  entryPoints: [resolve('electron/browser-agent.ts')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});
const entry = join(home, 'main.cjs');
await writeFile(
  entry,
  `const {app,BrowserWindow}=require('electron');globalThis.AgentBrowser=require(${JSON.stringify(bundle)}).AgentBrowser;app.setPath('userData',${JSON.stringify(join(home, 'profile'))});app.whenReady().then(()=>{globalThis.testWindow=new BrowserWindow({show:false});return globalThis.testWindow.loadURL('about:blank');});`,
);
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(
    req.url === '/login'
      ? '<input type="password" aria-label="Password"><p>Private login screen</p>'
      : '<label>Search<input name="search"></label><button onclick="document.querySelector(\'p\').textContent=document.querySelector(\'input\').value">Apply</button><p>Unchanged</p>',
  );
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [entry], env, timeout: 45000 });
try {
  await app.firstWindow();
  await app.evaluate(({ webContents }, bundle) => {
    globalThis.agentBrowser = new globalThis.AgentBrowser();
    globalThis.approvalCount = 0;
    globalThis.accept = true;
    globalThis.changeDuringApproval = false;
    globalThis.context = {
      sessionId: 'owner',
      signal: new AbortController().signal,
      check: async () => {},
      review: () => {},
      approve: async () => {
        globalThis.approvalCount++;
        if (globalThis.changeDuringApproval) {
          const w = webContents.getAllWebContents().find(w => w.getURL().startsWith('http:'));
          await w.executeJavaScript(`document.querySelector('button').textContent='Changed target'`);
        }
        return globalThis.accept;
      },
    };
  }, bundle);
  const run = (input, args, content) =>
    app.evaluate(
      async (_electron, r) => {
        try {
          return await globalThis.agentBrowser.run({ tool: 'browser_control', ...r }, globalThis.context);
        } catch (e) {
          return { error: e.message };
        }
      },
      { input, args, ...(content !== undefined ? { content } : {}) },
    );
  let snapshot = await run(url, { action: 'open' });
  const tab = snapshot.tab;
  assert.ok(tab && snapshot.elements.length === 2);
  // Opening the same site again in the same task returns that tab (with any sign-in), without asking again.
  const asked = await app.evaluate(() => globalThis.approvalCount);
  const again = await run(url + '/', { action: 'open' });
  assert.equal(again.tab, tab);
  assert.equal(again.reused, true);
  assert.equal(await app.evaluate(() => globalThis.approvalCount), asked);
  snapshot = again;
  const fill = { action: 'fill', snapshot: snapshot.snapshot, ref: snapshot.elements.find(e => e.editable).ref };
  assert.equal((await run(tab, fill, 'Browser agent works')).performed, true);
  assert.equal((await run(tab, fill, 'Must not repeat')).error, 'BROWSER_STALE_TARGET');
  snapshot = await run(tab, { action: 'read' });
  let click = { action: 'click', snapshot: snapshot.snapshot, ref: snapshot.elements.find(e => e.label === 'Apply').ref };
  await app.evaluate(() => {
    globalThis.accept = false;
  });
  assert.equal((await run(tab, click)).error, 'BROWSER_ACTION_DECLINED');
  await app.evaluate(() => {
    globalThis.accept = true;
  });
  assert.equal((await run(tab, click)).performed, true);
  snapshot = await run(tab, { action: 'read' });
  assert.match(snapshot.text, /Browser agent works/);
  click = { action: 'click', snapshot: snapshot.snapshot, ref: snapshot.elements.find(e => e.label === 'Apply').ref };
  await app.evaluate(() => {
    globalThis.changeDuringApproval = true;
  });
  assert.equal((await run(tab, click)).error, 'BROWSER_STALE_TARGET');
  await app.evaluate(() => {
    globalThis.changeDuringApproval = false;
    globalThis.context.sessionId = 'another-task';
  });
  assert.equal((await run(tab, { action: 'read' })).error, 'BROWSER_CLOSED');
  await app.evaluate(() => {
    globalThis.context.sessionId = 'owner';
  });
  const login = await run(url + '/login', { action: 'open' });
  assert.equal(login.requiresManualLogin, true);
  assert.deepEqual(login.elements, []);
  assert.equal(login.text, '');
  assert.equal((await run('file:///C:/Windows/win.ini', { action: 'open' })).error, 'INVALID_URL');
  await run(tab, { action: 'close' });
  assert.equal((await run(tab, { action: 'read' })).error, 'BROWSER_CLOSED');
  console.log(
    'Browser agent smoke passed: real isolated pages, fill/click/read, denial, stale references, changed approval target, task ownership, login masking and URL rejection. No external sites or AI calls.',
  );
} finally {
  await app.evaluate(() => globalThis.agentBrowser?.close()).catch(() => {});
  await app.close();
  await new Promise(resolve => server.close(resolve));
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
