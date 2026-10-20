// Real chat -> masked UI -> OS Vault -> HTTPS login/OTP; deterministic provider, no real credentials.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:https';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { httpsFixture } from './https-fixture.mjs';
const home = await mkdtemp(join(tmpdir(), 'step-vault-hermes-')),
  workspace = join(home, 'work');
await mkdir(workspace);
const { key, cert, fingerprint } = httpsFixture();
let logins = 0,
  codes = 0,
  automaticOtp = false;
const currentCode = () => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', Buffer.from('12345678901234567890')).update(counter).digest();
  return String((hash.readUInt32BE(hash.at(-1) & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
};
const server = createServer({ key, cert }, (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.url === '/address')
    return res.end(
      '<form method="post"><input autocomplete="address-line1"><input autocomplete="address-level2"><input autocomplete="postal-code"><input autocomplete="country"><button>Continue</button></form>',
    );
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      const values = new URLSearchParams(body);
      if (req.url === '/login') {
        assert.equal(values.get('username'), 'synthetic-employee');
        assert.equal(values.get('password'), 'synthetic-password-marker');
        logins++;
        res.end(
          '<form method="post" action="/code"><label>Verification code<input name="otp" autocomplete="one-time-code"></label><button>Verify</button></form>',
        );
      } else {
        assert.equal(values.get('otp'), automaticOtp ? currentCode() : '123456');
        codes++;
        res.end('<h1>Vault login verified</h1>');
      }
    });
    return;
  }
  res.end(
    '<form method="post" action="/login"><input name="username" autocomplete="username"><input type="password" name="password"><button>Sign in</button></form>',
  );
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = 'https://127.0.0.1:' + server.address().port;
const executable = join(home, 'provider.mjs'),
  record = join(home, 'provider-input.log');
await writeFile(
  executable,
  `
import readline from 'node:readline';import {appendFileSync} from 'node:fs';
const send=o=>console.log(JSON.stringify({jsonrpc:'2.0',...o}));let thread='';
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);send({id:m.id,result:m.method==='thread/start'?{thread:{id:'fixture'}}:{}});
 if(m.method==='thread/start')thread='';if(m.method!=='turn/start')return;
 const next=m.params.input.map(i=>i.text||'').join('');thread+=next;appendFileSync(${JSON.stringify(record)},next+'\\n');
 const results=[...thread.matchAll(/<tool_results>\\s*([\\s\\S]*?)\\s*<\\/tool_results>/g)].map(m=>JSON.parse(m[1])[0]);
 const values=results.filter(r=>r.ok).map(r=>{try{return JSON.parse(r.text)}catch{return {}}});const last=values.at(-1);
 const tab=values.find(v=>v.tab)?.tab;const accounts=values.filter(v=>Array.isArray(v.entries)).at(-1)?.entries||[];
 let request;
 const scenario=thread.includes('Run synthetic address fill')?'address':'website';
 if(scenario!=='website'){
   if(!results.length)request={tool:'browser_control',input:${JSON.stringify(origin)}+'/'+scenario,args:{action:'open'}};
   else if(last?.filledFields){}
   else if(last&&Array.isArray(last.entries))request={tool:'browser_vault',input:tab,args:{action:'fill',handle:accounts.find(entry=>entry.kind===scenario).handle}};
   else request={tool:'browser_vault',input:tab,args:{action:'list'}};
 }
 else if(!results.length)request={tool:'browser_control',input:${JSON.stringify(origin + '/login')},args:{action:'open'}};
 else if(last?.text?.includes('Vault login verified')){}
 else if(last?.protectedForm&&last.elements.some(element=>element.label==='Verify'))request={tool:'browser_control',input:tab,args:{action:'click',snapshot:last.snapshot,ref:last.elements.find(element=>element.label==='Verify').ref}};
 else if(last?.requiresManualLogin&&last?.text?.includes('Verification'))request={tool:'browser_vault',input:tab,args:{action:'enter_code'}};
 else if(last?.requiresManualLogin)request={tool:'browser_vault',input:tab,args:{action:'list'}};
 else if(last&&Array.isArray(last.entries))request={tool:'browser_vault',input:tab,args:accounts.length?{action:'fill',handle:accounts[0].handle,submit:true}:{action:'save_login'}};
 else request={tool:'browser_control',input:tab,args:{action:'read'}};
 // Sensitive login text is withheld; after a successful login fill, the next step is a masked code request.
 if(last?.requiresManualLogin && results.some(r=>r.ok&&JSON.parse(r.text||'{}').submitted))request={tool:'browser_vault',input:tab,args:{action:'enter_code',...(accounts[0]?{handle:accounts[0].handle}:{})}};
 const text=request?'\x60\x60\x60step-tool\\n'+JSON.stringify(request)+'\\n\x60\x60\x60':scenario==='website'?'Vault login verified':'Vault '+scenario+' fill verified';
 send({method:'item/agentMessage/delta',params:{delta:text}});send({method:'turn/completed',params:{turn:{status:'completed'}}});
});`,
);
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ network: { privateHosts: ['127.0.0.1'] } }));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let app,
  phase = 'launch';
const deadline = setTimeout(() => {
  console.error('Vault parity timeout: ' + phase);
  app?.process().kill('SIGKILL');
  process.exitCode = 1;
}, 90000);
deadline.unref();
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true }).click();
  await app.evaluate(
    ({ app }, data) => {
      const { DatabaseSync } = process.mainModule.require('node:sqlite');
      const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
      const settings = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='settings' AND id='main'").get().value);
      db.prepare("UPDATE records SET value=? WHERE kind='settings' AND id='main'").run(
        JSON.stringify({
          ...settings,
          workspace: data.workspace,
          tourDone: true,
          consentedAt: new Date().toISOString(),
          termsVersion: '2026-10-02',
        }),
      );
      db.prepare('INSERT INTO records VALUES (?,?,?)').run(
        'connection',
        'fixture',
        JSON.stringify({
          id: 'fixture',
          provider: 'openai',
          mode: 'subscription',
          model: '',
          executable: data.executable,
          customRuntime: true,
          ready: true,
          note: 'Synthetic',
          modelsAt: new Date().toISOString(),
        }),
      );
      db.close();
      app.on('certificate-error', (event, _contents, url, _error, certificate, callback) => {
        const crypto = process.mainModule.require('node:crypto');
        const actual = crypto.createHash('sha256').update(new crypto.X509Certificate(certificate.data).raw).digest('hex').toUpperCase();
        if (new URL(url).origin === data.origin && actual === data.fingerprint.replaceAll(':', '')) {
          event.preventDefault();
          callback(true);
        } else callback(false);
      });
    },
    { workspace, executable, origin, fingerprint },
  );
  await page.reload();
  await page.evaluate(() => {
    window.vaultAudit = [];
    window.vaultPromptEvents = [];
    window.step.onEvent(event => {
      if (event.type === 'approval') window.vaultAudit.push(event.approval.title);
      if (event.type.startsWith('vault-prompt'))
        window.vaultPromptEvents.push({ type: event.type, id: event.vaultPrompt?.id, kind: event.vaultPrompt?.kind });
    });
  });
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('step:call');
    globalThis.vaultPromptResponses = [];
    ipcMain.removeHandler('step:call');
    ipcMain.handle('step:call', async (event, method, input) => {
      if (method === 'vaultPromptRespond')
        globalThis.vaultPromptResponses.push({
          id: input.id,
          hasUsername: Boolean(input.value?.username),
          hasPassword: Boolean(input.value?.password),
          hasCode: Boolean(input.value?.code),
        });
      return original(event, method, input);
    });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (let round = 0; round < 3; round++) {
    phase = 'round ' + (round + 1);
    console.log('Vault Hermes phase: ' + phase);
    if (round === 2) {
      const state = await page.evaluate(() => window.step.call('vaultState'));
      await page.evaluate(
        entry =>
          window.step.call('vaultSave', {
            id: entry.id,
            revision: entry.revision,
            kind: entry.kind,
            label: entry.label,
            destination: entry.destination,
            username: 'synthetic-employee',
            otpSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
            remember: true,
          }),
        state.entries.find(entry => entry.kind === 'website'),
      );
      automaticOtp = true;
    }
    if (round) await page.getByRole('button', { name: 'เริ่มงานใหม่', exact: true }).click();
    await page.evaluate(() => {
      window.vaultAudit = [];
    });
    await page.locator('.composer textarea').fill('Open the synthetic website and sign in');
    await page.keyboard.press('Enter');
    const open = page.getByRole('alertdialog');
    await expect(open).toBeVisible({ timeout: 20000 });
    await open.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true }).click();
    if (!round) {
      const prompt = page.getByRole('alertdialog', { name: 'บันทึกบัญชีและเข้าสู่ระบบ', exact: true });
      await expect(prompt).toBeVisible({ timeout: 20000 });
      await prompt.getByLabel('ชื่อผู้ใช้หรืออีเมล', { exact: true }).fill('synthetic-employee');
      await prompt.getByLabel('รหัสผ่านของเว็บไซต์นี้', { exact: true }).fill('synthetic-password-marker');
      assert.equal(await prompt.getByLabel('รหัสผ่านของเว็บไซต์นี้', { exact: true }).getAttribute('type'), 'password');
      await prompt.getByRole('checkbox').check();
      await prompt.getByLabel('รหัสผ่านของเว็บไซต์นี้', { exact: true }).press('Enter');
    }
    if (round < 2) {
      const code = page.getByRole('alertdialog', { name: 'รหัสยืนยัน', exact: true });
      await expect(code).toBeVisible({ timeout: 30000 });
      await code.getByLabel('รหัสยืนยัน', { exact: true }).fill('123456');
      await code.getByLabel('รหัสยืนยัน', { exact: true }).press('Enter');
    }
    const verify = page.getByRole('alertdialog', { name: 'ให้ผู้ช่วยกดขั้นสุดท้ายนี้?', exact: true });
    await expect(verify).toBeVisible({ timeout: 30000 });
    await verify.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true }).click();
    await expect(page.getByText('Vault login verified', { exact: true }).first()).toBeVisible({ timeout: 20000 });
    const approvals = await page.evaluate(() => window.vaultAudit);
    assert.equal(approvals.length, 2, JSON.stringify(approvals));
    const snapshot = await page.evaluate(() => window.step.call('snapshot'));
    assert.doesNotMatch(JSON.stringify(snapshot.sessions), /synthetic-password-marker|123456/);
    const state = await page.evaluate(() => window.step.call('vaultState'));
    assert.equal(state.enabled, true);
    assert.equal(state.protected, true);
    assert.equal(state.blockHostExecution, false);
    await page.getByRole('button', { name: 'ปิดเว็บนี้', exact: true }).last().click();
  }
  await assert.rejects(
    page.evaluate(
      origin => window.step.call('vaultSave', { kind: 'payment', destination: origin, label: 'Unsupported', remember: true }),
      origin,
    ),
    /FEATURE_DISABLED/,
  );
  assert.equal(logins, 3);
  assert.equal(codes, 3);
  for (const kind of ['address']) {
    phase = kind + ' from chat';
    console.log('Vault Hermes phase: ' + phase);
    const fields = { address_line1: 'Synthetic private street', city: 'Test city', postal_code: '00000', country: 'TH' };
    await page.evaluate(
      ({ kind, fields, origin }) =>
        window.step.call('vaultSave', { kind, fields, destination: origin, label: 'Synthetic ' + kind, remember: true }),
      { kind, fields, origin },
    );
    await page.getByRole('button', { name: 'เริ่มงานใหม่', exact: true }).click();
    await page.evaluate(() => (window.vaultAudit = []));
    await page.locator('.composer textarea').fill('Run synthetic ' + kind + ' fill');
    await page.keyboard.press('Enter');
    const open = page.getByRole('alertdialog');
    await expect(open).toBeVisible({ timeout: 20000 });
    await open.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true }).click();
    await expect(page.getByText('Vault ' + kind + ' fill verified', { exact: true })).toBeVisible({ timeout: 20000 });
    assert.equal((await page.evaluate(() => window.vaultAudit)).length, 1);
    const actual = await app.evaluate(
      async ({ webContents }, url) =>
        webContents
          .getAllWebContents()
          .find(contents => contents.getURL() === url)
          .executeJavaScript('[...document.querySelectorAll("input")].map(el=>el.value)'),
      origin + '/' + kind,
    );
    assert.ok(actual.includes('Synthetic private street'));
    await page.getByRole('button', { name: 'ปิดเว็บนี้', exact: true }).last().click();
  }
  assert.deepEqual(errors, []);
  const sent = await readFile(record, 'utf8');
  assert.doesNotMatch(sent, /synthetic-password-marker|123456|4111111111111111|Synthetic private street/);
  console.log(
    'Vault Hermes smoke passed: secure Save & sign in, masked manual OTP, automatic TOTP, protected Verify button with final consent, saved-account auto-login without fill approval, no credentials in chat/provider input, coding runtime with protected Vault.',
  );
} catch (error) {
  if (app) {
    const page = await app.firstWindow();
    console.log(
      'Prompt lifecycle diagnostics',
      await page.evaluate(() => window.vaultPromptEvents),
      await app.evaluate(() => globalThis.vaultPromptResponses),
      { logins, codes },
    );
    const snapshot = await page.evaluate(() => window.step.call('snapshot'));
    console.log(JSON.stringify(snapshot.sessions.map(s => ({ status: s.status, messages: s.messages, trace: s.trace }))).slice(-7000));
  }
  console.log((await readFile(record, 'utf8').catch(() => '')).slice(-5000));
  throw error;
} finally {
  clearTimeout(deadline);
  if (app) await app.close();
  await new Promise(done => server.close(done));
  await rm(home, { recursive: true, force: true });
}
