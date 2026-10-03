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
      : req.url === '/coffee'
        ? // As on seleniumbase.io/coffee (coffee-cart, Vue): the cup is a plain <div> with a click listener, the pointer
          // cursor shows only on hover, the name is the inner aria-label and the price is in the list item's heading.
          // The app root listens for every click too, as frameworks that delegate events do; it is not a target itself.
          '<style>.cup:hover{cursor:pointer}</style><div id="app"><ul>' +
          ['Espresso:10.00', 'Americano:7.00']
            .map(c => {
              const [n, p] = c.split(':');
              return `<li><h4>${n}<br><small>$${p}</small></h4><div class="w"><div class="cup"><div class="cup-body" aria-label="${n}"><div>espresso</div><div>water</div></div></div></div></li>`;
            })
            .join('') +
          '</ul><button id="pay">Total: $0.00</button></div><script>let t=0;document.getElementById("app").addEventListener("click",()=>{});for(const w of document.querySelectorAll(".w"))w.addEventListener("click",()=>{t+=w.querySelector(".cup-body").getAttribute("aria-label")==="Americano"?7:10;document.getElementById("pay").textContent="Total: $"+t.toFixed(2)})</script>'
        : req.url === '/shop'
          ? '<div id="menu"><div class="card" style="cursor:pointer"><h3>Americano</h3><span style="cursor:pointer">$3.00</span></div><div class="card" style="cursor:pointer"><h3>Cappuccino</h3></div></div><p id="cart">Cart: 0</p><script>let n=0;for(const c of document.querySelectorAll(".card"))c.addEventListener("click",()=>{document.getElementById("cart").textContent="Cart: "+(++n)})</script>'
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
    // The local fixture server is a private address: listed as an intranet host, as policy network.privateHosts would.
    globalThis.agentBrowser = new globalThis.AgentBrowser(undefined, () => ['127.0.0.1']);
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
  // A card a page made clickable with its own script (a pointer cursor, no button or link) is a target too, once.
  const shop = await run(url + '/shop', { action: 'open' });
  const cards = shop.elements.filter(e => /Americano|Cappuccino/.test(e.label));
  assert.equal(cards.length, 2, JSON.stringify(shop.elements));
  assert.equal(
    (await run(shop.tab, { action: 'click', snapshot: shop.snapshot, ref: cards.find(e => /Americano/.test(e.label)).ref })).performed,
    true,
  );
  assert.match((await run(shop.tab, { action: 'read' })).text, /Cart: 1/);
  // A tile made clickable only by a script's click listener, with no pointer cursor until hovered, is found through
  // its listener, named by its inner label and placed by its heading; the framework's root is not offered.
  const coffee = await run(url + '/coffee', { action: 'open' });
  const americano = coffee.elements.find(e => e.label === 'Americano');
  assert.ok(americano, JSON.stringify(coffee.elements));
  assert.equal(americano.context, 'Americano $7.00');
  assert.equal(coffee.elements.filter(e => e.label === 'Espresso').length, 1);
  assert.equal(
    coffee.elements.some(e => /Espresso.*Americano/s.test(e.label)),
    false,
    'the app root is not a target',
  );
  for (let i = 0; i < 2; i++) {
    const page = await run(coffee.tab, { action: 'read' });
    const cup = page.elements.find(e => e.label === 'Americano');
    assert.equal((await run(coffee.tab, { action: 'click', snapshot: page.snapshot, ref: cup.ref })).performed, true);
  }
  const paid = await run(coffee.tab, { action: 'read' });
  assert.match(paid.text, /Total: \$14\.00/);
  // The temporary marks are gone from the page after each read.
  assert.equal(
    await app.evaluate(({ webContents }) =>
      webContents
        .getAllWebContents()
        .find(w => w.getURL().endsWith('/coffee'))
        .executeJavaScript('[...document.querySelectorAll("*")].some(el => [...el.attributes].some(a => a.name.startsWith("data-step-")))'),
    ),
    false,
  );
  await run(coffee.tab, { action: 'close' });
  // Other local or private addresses stay closed to the assistant.
  for (const blocked of ['http://localhost:9/', 'http://192.168.1.1/', 'http://10.0.0.1/'])
    assert.equal((await run(blocked, { action: 'open' })).error, 'WEB_ADDRESS_BLOCKED', blocked);
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
