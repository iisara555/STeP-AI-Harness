// Synthetic HTTPS/browser and real OS-storage restart acceptance; no live account or model calls.
import { _electron as electron } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:https';
import { httpsFixture } from './https-fixture.mjs';
import assert from 'node:assert/strict';
const home = await mkdtemp(join(tmpdir(), 'step-vault-electron-'));
const { key, cert, fingerprint } = httpsFixture();
let app;
const server = createServer({ key, cert }, (req, res) => {
  res.setHeader('content-type', 'text/html');
  if (req.url === '/new-password')
    return res.end(
      '<form method="post"><input autocomplete="username"><input type="password" autocomplete="new-password"><button>Create account</button></form>',
    );
  if (req.url === '/payment')
    return res.end(
      '<form method="post"><input autocomplete="cc-number" name="number"><input autocomplete="cc-name"><input autocomplete="cc-exp" placeholder="MM/YY"><input autocomplete="cc-csc"><button type="button" onclick="document.body.innerHTML=\'<h1>Paid synthetic</h1>\'">Pay</button></form>',
    );
  if (req.url === '/address')
    return res.end(
      '<form method="post"><label>Street<input name="street"></label><input autocomplete="address-level2"><input autocomplete="postal-code"><select autocomplete="country"><option value="US">United States</option><option value="TH">Thailand</option></select><button type="button">Continue</button></form>',
    );
  if (req.url === '/split-code')
    return res.end(
      '<form method="post">' +
        Array.from({ length: 6 }, (_, i) => '<input name="otp' + i + '" maxlength="1" autocomplete="one-time-code">').join('') +
        '<button>Verify</button></form>',
    );
  // An intranet-style login: the username box has no telling name, the button carries the page's own click handler.
  if (req.url === '/intranet' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      const form = new URLSearchParams(body);
      const ok = form.get('txtUser') === 'synthetic-user' && form.get('txtPass') === 'synthetic-password' && form.get('clicked') === '1';
      res.end(ok ? '<h1>Home</h1><p>signed in</p>' : '<p>wrong</p>');
    });
    return;
  }
  if (req.url === '/intranet')
    return res.end(
      '<form method="post" action="/intranet"><input type="text" name="txtUser" placeholder="STeP Account"><input type="password" name="txtPass"><input type="hidden" name="clicked" value="0"><button type="submit" onclick="this.form.clicked.value=1">Sign in</button></form><a href="/forgot">Forgot password</a>',
    );
  // A page like STeP MBS: typing marks the form (its HTML changes after filling) and a show-password eye is a second
  // submit-type button, so only the button named for signing in may be pressed.
  if (req.url === '/mbs' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      const form = new URLSearchParams(body);
      const ok = form.get('user') === 'synthetic-user' && form.get('pass') === 'synthetic-password' && form.get('via') === 'signin';
      res.end(ok ? '<h1>MBS</h1><p>welfare home</p>' : '<p>wrong</p>');
    });
    return;
  }
  if (req.url === '/mbs')
    return res.end(
      '<meta charset="utf-8"><form method="post" action="/mbs" oninput="this.classList.add(\'touched\')"><input type="text" name="user"><input type="password" name="pass"><button aria-label="แสดงรหัสผ่าน" onclick="event.preventDefault()">👁</button><input type="hidden" name="via" value=""><button type="submit" onclick="this.form.via.value=\'signin\'">เข้าสู่ระบบ</button></form>',
    );
  if (req.url === '/two') res.end('<form method="post"><input name="username" autocomplete="username"><button>Next</button></form>');
  else if (req.url === '/changed')
    res.end(
      '<form method="post"><input name="username" oninput="this.form.action=\'https://hostile.test\'"><input type="password"></form>',
    );
  else
    res.end(
      '<form method="post"><input name="username" autocomplete="username"><input type="password" autocomplete="current-password"><button>Login</button></form>',
    );
});
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let phase = 'fixture setup';
const checkpoint = name => {
  phase = name;
  console.log(`Vault Electron phase: ${name}`);
};
// Native evaluate/close calls have no default deadline; a stall must report its phase and fail.
const deadline = setTimeout(() => {
  console.error(`Vault Electron timed out during ${phase}`);
  process.exitCode = 1;
  app?.process().kill('SIGKILL');
}, 90_000);
deadline.unref();
try {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = 'https://127.0.0.1:' + server.address().port;
  const bundle = join(home, 'vault.cjs'),
    browserBundle = join(home, 'browser.cjs'),
    entry = join(home, 'main.cjs');
  await build({ entryPoints: [resolve('electron/vault.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'cjs' });
  await build({
    entryPoints: [resolve('electron/browser-agent.ts')],
    outfile: browserBundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  });
  await writeFile(
    entry,
    `const {app,BrowserWindow,safeStorage}=require('electron');globalThis.fixtureErrors=[];app.on('web-contents-created',(event,w)=>w.on('did-fail-load',(event,code)=>globalThis.fixtureErrors.push(code)));globalThis.fixtureErrors=[];app.on('web-contents-created',(event,w)=>w.on('did-fail-load',(event,code)=>globalThis.fixtureErrors.push(code)));const {Vault}=require(${JSON.stringify(bundle)});globalThis.AgentBrowser=require(${JSON.stringify(browserBundle)}).AgentBrowser;app.setPath('userData',${JSON.stringify(join(home, 'profile'))});app.on('certificate-error',(event,contents,url,error,certificate,callback)=>{globalThis.fixtureErrors.push([error,certificate.fingerprint]);globalThis.fixtureErrors.push([error,certificate.fingerprint]);if(new URL(url).origin===${JSON.stringify(origin)}&&require('crypto').createHash('sha256').update(new (require('crypto').X509Certificate)(certificate.data).raw).digest('hex').toUpperCase()===${JSON.stringify(fingerprint.replaceAll(':', ''))}){event.preventDefault();callback(true);}else callback(false);});app.whenReady().then(()=>{globalThis.vault=new Vault(${JSON.stringify(join(home, 'vault.sqlite'))},{wrap:s=>{if(!safeStorage.isEncryptionAvailable())throw Error('OS_STORAGE_UNAVAILABLE');return safeStorage.encryptString(s)},unwrap:b=>safeStorage.decryptString(b)});const w=new BrowserWindow({show:false});w.loadURL('about:blank');});app.on('will-quit',()=>globalThis.vault.close());`,
  );
  checkpoint('launch storage fixture');
  app = await electron.launch({ args: [entry], env, timeout: 45000 });
  await app.firstWindow();
  const saved = await app.evaluate(
    (_electron, origin) =>
      globalThis.vault.save({
        label: 'fixture',
        kind: 'website',
        destination: origin,
        username: 'synthetic-user',
        password: 'synthetic-password',
      }),
    origin,
  );
  assert.equal(Object.hasOwn(saved, 'password'), false);
  checkpoint('close first process');
  await app.close();
  app = undefined;
  // Same profile, separate Electron process: this exercises actual safeStorage, not mock encryption.
  checkpoint('restart storage fixture');
  app = await electron.launch({ args: [entry], env, timeout: 45000 });
  await app.firstWindow();
  await app.evaluate(() => {
    globalThis.agent = new globalThis.AgentBrowser(undefined, () => ['127.0.0.1']);
    globalThis.context = {
      sessionId: 'owner',
      signal: new AbortController().signal,
      check: async () => {},
      approve: async () => true,
      review: () => {},
    };
  });
  const open = url =>
    app
      .evaluate(
        async (_electron, url) =>
          globalThis.agent.run({ tool: 'browser_control', input: url, args: { action: 'open' } }, globalThis.context),
        url,
      )
      .catch(async error => {
        console.log(await app.evaluate(() => globalThis.fixtureErrors));
        throw error;
      });
  const page = await open(origin + '/login');
  checkpoint('exact-origin fill');
  const result = await app.evaluate(async (_electron, id) => {
    const expected = await globalThis.agent.prepareVault(id, 'owner', globalThis.context.signal);
    const [credential] = globalThis.vault.catalog('owner', expected.origin);
    return globalThis.vault.fill(
      credential.handle,
      'owner',
      expected.origin,
      async () => true,
      payload => globalThis.agent.fillVault(id, 'owner', expected, payload, globalThis.context.signal),
    );
  }, page.tab);
  assert.deepEqual(result.filledFields, ['username', 'password']);
  assert.equal(result.status, 'filled');
  const hidden = await app.evaluate(
    async (_electron, id) =>
      globalThis.agent.run({ tool: 'browser_control', input: id, args: { action: 'read' } }, globalThis.context).then(
        () => false,
        e => e.message,
      ),
    page.tab,
  );
  assert.equal(hidden, 'BROWSER_VAULT_SENSITIVE');
  await app.evaluate(() => globalThis.agent.closeOwner('owner'));
  const changed = await open(origin + '/changed');
  checkpoint('changed-form partial fill');
  const partial = await app.evaluate(async (_electron, id) => {
    const expected = await globalThis.agent.prepareVault(id, 'owner', globalThis.context.signal);
    const [credential] = globalThis.vault.catalog('owner', expected.origin);
    return globalThis.vault.fill(
      credential.handle,
      'owner',
      expected.origin,
      async () => true,
      payload => globalThis.agent.fillVault(id, 'owner', expected, payload, globalThis.context.signal),
    );
  }, changed.tab);
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.filledFields, ['username']);
  await app.evaluate(() => globalThis.agent.closeOwner('owner'));
  const single = await open(origin + '/two');
  checkpoint('identifier-only fill');
  const one = await app.evaluate(async (_electron, id) => {
    const expected = await globalThis.agent.prepareVault(id, 'owner', globalThis.context.signal);
    const [credential] = globalThis.vault.catalog('owner', expected.origin);
    return globalThis.vault.fill(
      credential.handle,
      'owner',
      expected.origin,
      async () => true,
      payload => globalThis.agent.fillVault(id, 'owner', expected, payload, globalThis.context.signal),
    );
  }, single.tab);
  assert.deepEqual(one.filledFields, ['username']);
  await app.evaluate(() => globalThis.agent.closeOwner('owner'));
  const intranet = await open(origin + '/intranet');
  assert.equal(intranet.requiresManualLogin, true);
  checkpoint('plain username fill and sign in');
  const signedIn = await app.evaluate(async (_electron, id) => {
    const expected = await globalThis.agent.prepareVault(id, 'owner', globalThis.context.signal);
    const [credential] = globalThis.vault.catalog('owner', expected.origin);
    const result = await globalThis.vault.fill(
      credential.handle,
      'owner',
      expected.origin,
      async () => true,
      payload => globalThis.agent.fillVault(id, 'owner', expected, payload, globalThis.context.signal, true),
    );
    return { fields: expected.fields, result };
  }, intranet.tab);
  assert.deepEqual(signedIn.fields, ['username', 'password']);
  assert.deepEqual(signedIn.result.filledFields, ['username', 'password']);
  assert.equal(signedIn.result.submitted, true);
  assert.equal(signedIn.result.navigated, true);
  // The next page no longer holds the form, so the AI reads it without a manual resume, and never the password.
  const landing = await app.evaluate(
    async (_electron, id) => globalThis.agent.run({ tool: 'browser_control', input: id, args: { action: 'read' } }, globalThis.context),
    intranet.tab,
  );
  assert.match(landing.text, /signed in/);
  assert.equal(JSON.stringify(landing).includes('synthetic-password'), false);
  await app.evaluate(() => globalThis.agent.closeOwner('owner'));
  const mbs = await open(origin + '/mbs');
  checkpoint('sign in after the form changes and beside a show-password button');
  const welfare = await app.evaluate(async (_electron, id) => {
    const expected = await globalThis.agent.prepareVault(id, 'owner', globalThis.context.signal);
    const [credential] = globalThis.vault.catalog('owner', expected.origin);
    return globalThis.vault.fill(
      credential.handle,
      'owner',
      expected.origin,
      async () => true,
      payload => globalThis.agent.fillVault(id, 'owner', expected, payload, globalThis.context.signal, true),
    );
  }, mbs.tab);
  assert.equal(welfare.submitted, true);
  assert.equal(welfare.navigated, true);
  const landingMbs = await app.evaluate(
    async (_electron, id) => globalThis.agent.run({ tool: 'browser_control', input: id, args: { action: 'read' } }, globalThis.context),
    mbs.tab,
  );
  assert.match(landingMbs.text, /welfare home/);
  checkpoint('unsupported payment, protected address and split-code forms');
  const signup = await open(origin + '/new-password');
  const signupError = await app.evaluate(async (_electron, id) => {
    try {
      await globalThis.agent.prepareVault(id, 'owner', globalThis.context.signal);
      return 'unexpected';
    } catch (error) {
      return error.message;
    }
  }, signup.tab);
  assert.equal(signupError, 'VAULT_FORM_UNSUPPORTED');
  await app.evaluate(
    async (_electron, id) => globalThis.agent.run({ tool: 'browser_control', input: id, args: { action: 'close' } }, globalThis.context),
    signup.tab,
  );
  const card = await open(origin + '/payment');
  const refused = await app.evaluate(async (_electron, id) => {
    try {
      await globalThis.agent.prepareProtected(id, 'owner', 'payment', globalThis.context.signal);
      return false;
    } catch (error) {
      return error.message;
    }
  }, card.tab);
  assert.equal(refused, 'VAULT_FORM_UNSUPPORTED');
  for (const [path, kind, values] of [
    ['/address', 'address', { address_line1: 'Synthetic street', city: 'Test city', postal_code: '00000', country: 'Thailand' }],
    ['/split-code', 'code', { code: '123456' }],
  ]) {
    const opened = await open(origin + path);
    const filled = await app.evaluate(
      async (_electron, { id, kind, values }) => {
        const expected = await globalThis.agent.prepareProtected(id, 'owner', kind, globalThis.context.signal);
        const result = await globalThis.agent.fillProtected(id, 'owner', expected, values, globalThis.context.signal);
        const dom = await globalThis.agent.tabs
          .get(id)
          .contents.executeJavaScript('[...document.querySelectorAll("input,select")].map(el=>el.value)');
        const read = await globalThis.agent.run({ tool: 'browser_control', input: id, args: { action: 'read' } }, globalThis.context);
        return { result, dom, read };
      },
      { id: opened.tab, kind, values },
    );
    assert.equal(filled.result.status, 'filled');
    assert.equal(filled.read.protectedForm, true);
    assert.equal(filled.read.text, '');
    assert.ok(filled.read.elements.every(element => !element.editable));
    if (kind === 'address') assert.ok(filled.dom.includes('TH'));
    if (kind === 'code') assert.deepEqual(filled.dom, ['1', '2', '3', '4', '5', '6']);
    assert.doesNotMatch(JSON.stringify(filled.read), /4111111111111111|Synthetic street|123456/);
    const image = await app.evaluate(async (_electron, id) => {
      try {
        await globalThis.agent.capture(id, globalThis.context);
        return 'unexpected';
      } catch (error) {
        return error.message;
      }
    }, opened.tab);
    assert.equal(image, 'BROWSER_IMAGE_SENSITIVE');
    if (kind !== 'code') {
      const denied = await app.evaluate(
        async (_electron, { id, snapshot, ref }) => {
          let approvals = 0;
          try {
            await globalThis.agent.run(
              { tool: 'browser_control', input: id, args: { action: 'click', snapshot, ref } },
              {
                ...globalThis.context,
                routine: () => true,
                approve: async () => {
                  approvals++;
                  return false;
                },
              },
            );
            return { approvals };
          } catch (error) {
            return { approvals, error: error.message };
          }
        },
        { id: opened.tab, snapshot: filled.read.snapshot, ref: filled.read.elements[0].ref },
      );
      assert.equal(denied.approvals, 1);
      assert.equal(denied.error, 'BROWSER_ACTION_DECLINED');
    }
    await app.evaluate(
      async (_electron, id) => globalThis.agent.run({ tool: 'browser_control', input: id, args: { action: 'close' } }, globalThis.context),
      opened.tab,
    );
  }
  checkpoint('close owned browser views');
  await app.evaluate(() => globalThis.agent.closeOwner('owner'));
  await mkdir('release/qa/vault', { recursive: true });
  console.log(
    'Vault Electron smoke passed: actual OS encryption across restart, HTTPS exact-origin fill, identifier-only login, plain-username sign in with reading resumed on the next page, sign in after the form changes beside a show-password button, changed form partial outcome and model-read suppression.',
  );
} finally {
  checkpoint('close application');
  if (app) await app.close();
  checkpoint('close HTTPS fixture');
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  checkpoint('remove private fixture');
  assert.ok(home.startsWith(tmpdir()));
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  clearTimeout(deadline);
}
