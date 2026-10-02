import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleStream } from '../src/tools';
import { credentialsOnly, unscanned } from '../electron/checks';
import { privateHostName, publicSite } from '../electron/web-fetch';

const privacy: any = await import('../../src/modules/privacy/index.js');
const credentials = (text: string) => credentialsOnly(text, privacy.scanPrivacyText, privacy.CREDENTIAL_PATTERN);

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
