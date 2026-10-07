import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleStream } from '../src/tools';
import { credentialsOnly, unscanned } from '../electron/checks';
import { privateHostName, publicSite } from '../electron/web-fetch';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatMarkdown } from '../src/chat-markdown';
import { mkdtemp, mkdir, writeFile, chmod, lstat, link, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const privacy: any = await import('../../src/modules/privacy/index.js');
const credentials = (text: string) => credentialsOnly(text, privacy.scanPrivacyText, privacy.CREDENTIAL_PATTERN);

test('untrusted model Markdown cannot render active HTML, executable links or remote images', () => {
  const html = renderToStaticMarkup(
    createElement(ChatMarkdown, {
      text: [
        'safe text',
        '<script>alert(1)</script><iframe src="file:///private"></iframe>',
        '<img src="https://example.com/track" onerror="alert(1)">',
        '[danger](javascript:alert%281%29)',
        '![tracker](https://example.com/track)',
        '```html\n<script>alert(2)</script>\n```',
      ].join('\n\n'),
    }),
  );
  assert.match(html, /safe text/);
  assert.doesNotMatch(html, /<(?:script|iframe|img)\b|href="javascript:/i);
  assert.match(html, /&lt;/, 'code is escaped even when syntax highlighting inserts markup');
});

test('app data stays private and existing database links are rejected before SQLite opens them', async () => {
  const { prepareLocalData } = await import('../electron/local-data');
  const root = await mkdtemp(join(tmpdir(), 'step-private-data-'));
  try {
    const data = join(root, 'profile');
    await mkdir(data, { mode: 0o755 });
    await chmod(data, 0o755);
    await prepareLocalData(data);
    if (process.platform !== 'win32') {
      assert.equal((await lstat(data)).mode & 0o777, 0o700);
      assert.equal((await lstat(join(data, 'logs'))).mode & 0o777, 0o700);
    }
    const outside = join(root, 'outside.sqlite');
    await writeFile(outside, 'synthetic data that must not be opened as SQLite');
    await link(outside, join(data, 'workspace.sqlite'));
    await assert.rejects(prepareLocalData(data), /LOCAL_DATA_INVALID/);
    const alias = join(root, 'alias');
    await symlink(data, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(prepareLocalData(alias), /LOCAL_DATA_INVALID/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('credentials require an OS-backed key store, including rejection of Linux basic_text fallback', async () => {
  const { requireSecureStorage } = await import('../electron/secure-storage');
  const unavailable = { isEncryptionAvailable: () => false };
  for (const platform of ['win32', 'darwin', 'linux'] as const)
    assert.throws(() => requireSecureStorage(unavailable, platform), /SECURE_STORAGE_UNAVAILABLE/);
  for (const backend of ['basic_text', 'unknown', undefined])
    assert.throws(
      () => requireSecureStorage({ isEncryptionAvailable: () => true, getSelectedStorageBackend: () => backend }, 'linux'),
      /SECURE_STORAGE_UNAVAILABLE/,
    );
  for (const backend of ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'])
    assert.doesNotThrow(() =>
      requireSecureStorage({ isEncryptionAvailable: () => true, getSelectedStorageBackend: () => backend }, 'linux'),
    );
  for (const platform of ['win32', 'darwin'] as const)
    assert.doesNotThrow(() => requireSecureStorage({ isEncryptionAvailable: () => true }, platform));
});

test('the live reply shows the model words without the tool requests written between them', () => {
  const tool = '```step-tool\n{"tool":"browser_control","input":"https://mis.step.cmu.ac.th/","args":{"action":"open"}}\n```';
  assert.equal(visibleStream(`กำลังเปิด MIS ให้ค่ะ\n${tool}`), 'กำลังเปิด MIS ให้ค่ะ');
  assert.equal(visibleStream('ขอเปิดเว็บก่อน\n```step-tool\n{"tool":"brow'), 'ขอเปิดเว็บก่อน', 'a request still being typed');
  assert.equal(visibleStream('อ่านคู่มือก่อน\n```json\n{"tool":"skill","input":"x"}\n```\n\nเสร็จแล้ว'), 'อ่านคู่มือก่อน\n\nเสร็จแล้ว');
  assert.equal(visibleStream('{"tool":"reference","input":"step-executive-board"}'), '');
  assert.equal(visibleStream('ตัวอย่างโค้ด\n```js\nconst a = 1;\n```'), 'ตัวอย่างโค้ด\n```js\nconst a = 1;\n```', 'ordinary code stays');
  assert.equal(visibleStream('กำลังพิมพ์ ``'), 'กำลังพิมพ์');
});

test('with privacy checks off, credentials are still masked and nothing else is touched', () => {
  const plain = 'ร่างอีเมลถึงนายสมชาย โทร 081-234-5678';
  assert.deepEqual(credentials(plain), unscanned(plain));
  const fake = ['sk', 'abcdefghij'.repeat(3)].join('-');
  const key = `ใช้ api_key: ${fake} ในการเชื่อมต่อ`;
  const masked = credentials(key);
  assert.equal(masked.action, 'auto-mask');
  assert.doesNotMatch(masked.redactedText, /sk-abcdefghij/);
  assert.match(masked.redactedText, /\[credential-redacted\]/);
  const url = credentials('https://evil.example/collect?token=abc123secret');
  assert.notEqual(url.action, 'pass', 'a URL carrying a token is never fetched as it is');
});

test("the assistant's browser opens public sites only, unless policy lists an intranet host", async () => {
  for (const host of ['localhost', '127.0.0.1', '192.168.1.1', '10.0.0.5', 'router', 'printer.local', '[::1]'])
    assert.equal(privateHostName(host), true, host);
  assert.equal(privateHostName('mis.step.cmu.ac.th'), false);
  await assert.rejects(publicSite(new URL('http://192.168.1.1/')), /WEB_ADDRESS_BLOCKED/);
  await publicSite(new URL('http://intranet.step/'), ['intranet.step']);
  await assert.rejects(
    publicSite(new URL('https://rebind.example/'), [], async () => [{ address: '10.1.2.3', family: 4 }]),
    /WEB_ADDRESS_BLOCKED/,
    'a public name that resolves to a private address',
  );
  await publicSite(new URL('https://mis.step.cmu.ac.th/'), [], async () => [{ address: '202.28.1.1', family: 4 }]);
});

test('policy lists intranet hosts for the browser only as plain host names', async () => {
  const { parsePolicy } = await import('../electron/policy');
  const ok = parsePolicy({ network: { privateHosts: ['Intranet.STEP', '10.0.0.5'], proxyUrl: 'http://proxy.step:8080/' } });
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.policy.network, { privateHosts: ['intranet.step', '10.0.0.5'], proxyUrl: 'http://proxy.step:8080/' });
  for (const privateHosts of ['intranet', ['http://intranet/'], ['.step'], new Array(51).fill('a.b')])
    assert.ok(parsePolicy({ network: { privateHosts } }).problems.length, JSON.stringify(privateHosts).slice(0, 40));
});
