// Actual Electron renderer -> IPC -> encrypted identity -> fixed central HTTP service. Synthetic accounts/images only.
import { _electron as electron, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
const home = await mkdtemp(join(tmpdir(), 'step-receipt-cloud-'));
let app;
const received = [];
const server = createServer((req, res) => {
  let body = '';
  req.on('data', part => {
    body += part;
  });
  req.on('end', () => {
    assert.equal(req.url, '/v1/receipt');
    assert.equal(req.headers['x-step-identity'], 'Bearer synthetic.id.token');
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers['x-goog-api-key'], undefined);
    const request = JSON.parse(body);
    assert.equal(request.key, undefined);
    assert.equal(request.model, undefined);
    assert.ok(request.images.length >= 1);
    assert.deepEqual(request.manifest[0], { page: 1 });
    received.push(request);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        model: 'gemini-3.8-flash',
        usage: { input: 10, output: 5, total: 15 },
        text: JSON.stringify({
          fields: {
            merchant: { value: 'ร้านสังเคราะห์', evidence: 'ร้านสังเคราะห์' },
            total: { value: '107.00', evidence: '107.00', region: { page: 1, x: 0.5, y: 0.6, width: 0.4, height: 0.1 } },
          },
          documentType: 'cash_bill',
          signatures: {
            receiver: { status: 'absent', evidence: 'ช่องผู้รับเงินว่าง', region: { page: 1, x: 0.1, y: 0.8, width: 0.5, height: 0.1 } },
          },
        }),
      }),
    );
  });
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const cloud = { url: 'https://ocr.example.test', model: 'gemini-3.8-flash' };
const policy = {
  receiptLocalOnly: false,
  receiptCloud: cloud,
  googleWorkspace: { clientId: 'synthetic-client.apps.googleusercontent.com', domains: ['example.test'], services: ['documents'] },
};
try {
  await writeFile(join(home, 'desktop-policy.json'), JSON.stringify(policy));
  await build({
    entryPoints: ['electron/store.ts', 'electron/vault.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outdir: join(home, 'fixtures'),
    outExtension: { '.js': '.cjs' },
  });
  const require = createRequire(import.meta.url);
  const { Store } = require(join(home, 'fixtures/store.cjs'));
  const { Vault } = require(join(home, 'fixtures/vault.cjs'));
  const store = new Store(join(home, 'workspace.sqlite'));
  store.put('vault-profile', 'main', 'synthetic-profile');
  const vault = new Vault(
    join(home, 'vault/vault.sqlite'),
    { wrap: value => Buffer.from('k' + value), unwrap: value => value.toString().slice(1) },
    'synthetic-profile',
  );
  const credential = vault.save({
    kind: 'google-oauth',
    label: 'Synthetic Google',
    destination: 'synthetic-client.apps.googleusercontent.com:12345',
    value: JSON.stringify({
      refresh: 'synthetic-refresh',
      access: 'synthetic-access',
      identity: 'synthetic.id.token',
      expires: Date.now() + 3600000,
    }),
  });
  store.put('google-account', 'ocr-account', {
    id: 'ocr-account',
    subject: '12345',
    label: 'fi••••@example.test',
    domain: 'example.test',
    scopes: ['openid', 'email'],
    services: [],
    credentialId: credential.id,
    clientId: 'synthetic-client.apps.googleusercontent.com',
    paused: false,
    revision: 1,
  });
  store.put('connection', 'chat-account', {
    id: 'chat-account',
    provider: 'antigravity',
    mode: 'subscription',
    model: 'gemini-3.8-flash-medium',
    executable: '',
    ready: true,
    note: '',
  });
  vault.close();
  store.close();
  const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_TEST_RECEIPT_CLOUD_URL: 'http://127.0.0.1:' + server.address().port };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true }).click();
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = value => Buffer.from('k' + value);
    safeStorage.decryptString = value => value.toString().slice(1);
  });
  const png = await app.evaluate(({ nativeImage }) =>
    nativeImage
      .createFromBitmap(Buffer.alloc(64 * 64 * 4, 255), { width: 64, height: 64 })
      .toPNG()
      .toString('base64'),
  );
  const file = join(home, 'synthetic.png');
  await writeFile(file, Buffer.from(png, 'base64'));
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, file);
  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  await expect(page.getByText('บริการ OCR ของ STeP พร้อมใช้', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ติดตั้ง OCR', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('บัญชี Google สำหรับ OCR ของ STeP')).toHaveValue('ocr-account');
  await page.getByRole('button', { name: 'เลือกใบเสร็จ', exact: true }).click();
  const consent = page.getByRole('alertdialog', { name: 'ส่งใบเสร็จให้บริการ OCR ของ STeP' });
  await consent.waitFor();
  assert.equal(received.length, 0);
  await expect(consent).toContainText(cloud.url);
  await consent.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await expect(page.getByRole('button', { name: 'เลือกใบเสร็จ', exact: true })).toBeEnabled();
  assert.equal(received.length, 0);
  await page.getByRole('button', { name: 'เลือกใบเสร็จ', exact: true }).click();
  await consent.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true }).click();
  await page.getByText('ตรวจ/แก้ข้อมูลที่อ่านได้', { exact: true }).click();
  await expect(page.getByLabel('ยอดรวมที่ชำระ')).toHaveValue('107.00');
  await expect(page.getByLabel('ลายเซ็นผู้รับเงิน', { exact: true })).toHaveValue('absent');
  await expect(page.getByLabel(/ตรวจทั้งหมดเทียบกับต้นฉบับแล้ว/)).not.toBeChecked();
  assert.equal(received.length, 1);
  const snapshot = await page.evaluate(() => window.step.call('snapshot'));
  assert.equal(snapshot.connections[0].provider, 'antigravity');
  assert.ok(!JSON.stringify(snapshot).includes('synthetic.id.token'));
  await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ ...policy, features: { receiptVision: false } }));
  // Policy files are polled every five seconds; allow a complete poll plus renderer/host scheduling.
  await expect.poll(async () => (await page.evaluate(() => window.step.call('ocrStatus'))).vision, { timeout: 15000 }).toBe(false);
  const denied = await page.evaluate(async () => {
    try {
      await window.step.call('receiptVision', { cloudAccountId: 'ocr-account' });
      return '';
    } catch (e) {
      return e.message;
    }
  });
  assert.match(denied, /VISION_DISABLED/);
  assert.equal(received.length, 1);
  assert.deepEqual(errors, []);
  console.log(
    'Central OCR smoke passed: Antigravity chat, Google identity, cancellation, image grouping, source evidence, unconfirmed fields and policy denial; synthetic fixtures only.',
  );
} finally {
  await app?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  assert.ok(home.startsWith(tmpdir()));
  await rm(home, { recursive: true, force: true });
}
