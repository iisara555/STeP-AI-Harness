// Synthetic hostile-page check. Chromium maps the test host locally; no external DNS or real account is used.
import { _electron as electron } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const home = await mkdtemp(join(tmpdir(), 'step-browser-network-'));
let privateRequests = 0,
  app;
const server = createServer((req, res) => {
  if (req.url === '/private-data') {
    privateRequests++;
    res.end('synthetic internal endpoint');
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<p>synthetic public page</p><img src="http://blocked.step-review.example:${server.address().port}/private-data">`);
});
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const bundle = join(home, 'browser.cjs'),
    entry = join(home, 'main.cjs');
  await build({
    entryPoints: [resolve('electron/browser-agent.ts')],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  });
  await writeFile(
    entry,
    `const {app,BrowserWindow}=require('electron');globalThis.AgentBrowser=require(${JSON.stringify(bundle)}).AgentBrowser;app.setPath('userData',${JSON.stringify(home)});app.whenReady().then(()=>new BrowserWindow({show:false}).loadURL('about:blank'));`,
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [entry, '--host-resolver-rules=MAP blocked.step-review.example 127.0.0.1'], env, timeout: 45000 });
  await app.firstWindow();
  const url = `http://127.0.0.1:${server.address().port}`;
  const result = await app.evaluate(async (_electron, url) => {
    const checkedHosts = [];
    globalThis.agent = new globalThis.AgentBrowser(
      undefined,
      () => ['127.0.0.1'],
      async host => {
        checkedHosts.push(host);
        return [{ address: '127.0.0.1', family: 4 }];
      },
    );
    const snapshot = await globalThis.agent.run(
      { tool: 'browser_control', input: url, args: { action: 'open' } },
      {
        sessionId: 'synthetic-owner',
        signal: new AbortController().signal,
        check: async () => {},
        approve: async () => true,
        review: () => {},
      },
    );
    return { ...snapshot, checkedHosts };
  }, url);
  assert.match(result.text, /synthetic public page/);
  assert.ok(result.checkedHosts.includes('blocked.step-review.example'), 'DNS checks must cover subresources as well as the initial page');
  assert.equal(privateRequests, 0, 'a public-looking subresource hostname must not reach a private address');
  console.log('Browser network smoke passed: DNS-resolved private subresources blocked.');
} finally {
  if (app) {
    await app.evaluate(() => globalThis.agent?.close()).catch(() => {});
    await app.close();
  }
  await new Promise(resolve => server.close(resolve));
  await rm(home, { recursive: true, force: true });
}
