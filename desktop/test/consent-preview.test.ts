import test from 'node:test';
import assert from 'node:assert/strict';
import { consentPreview } from '../electron/consent-preview';
import { DesktopTools } from '../electron/tools';

test('diagnostic approval shows file, findings and limits, while retaining reviewed technical data', async () => {
  const payload = JSON.stringify({
    path: 'fixture.ts',
    diagnostics: [{ code: 2322, line: 2, column: 7, message: 'Type mismatch' }],
    incomplete: true,
    engine: 'typescript-language-service',
  });
  let detail: any;
  const tools = new DesktopTools(
    { root: async () => '/synthetic' } as any,
    { privacy: (text: string) => ({ action: 'pass', classification: 'public', findings: [], redactedText: text }) } as any,
    {} as any,
    {
      rule: () => ({}),
      request: async (_rule: any, value: any) => {
        detail = value;
        return true;
      },
    } as any,
    {} as any,
    () => ({ checks: { privacy: true } }) as any,
    () => 'ask',
    '',
  );
  const sent = await tools.outgoing(payload, {
    sessionId: 'synthetic',
    connection: { provider: 'openai', model: 'fixture' },
    signal: new AbortController().signal,
  } as any);
  assert.match(detail.preview, /fixture.ts/);
  assert.match(detail.preview, /2.*7.*Type mismatch/);
  assert.match(detail.preview, /ตรวจได้บางส่วน/);
  assert.doesNotMatch(detail.preview, /"diagnostics"|"engine"/);
  assert.equal(detail.technical, payload);
  assert.equal(sent, payload, 'presentation does not change the payload sent under consent');
});

test('structured previews retain consequential values and readable list contents without JSON syntax', () => {
  const preview = consentPreview(
    JSON.stringify({
      command: 'npm run build',
      path: 'src/main.ts',
      entries: [{ label: 'Synthetic account', origin: 'https://example.test' }],
    }),
  );
  for (const value of ['npm run build', 'src/main.ts', 'Synthetic account', 'https://example.test']) assert.ok(preview.includes(value));
  assert.doesNotMatch(preview, /[{}\[\]"]/);
  assert.equal(consentPreview('Plain reviewed text'), 'Plain reviewed text');
  assert.match(consentPreview(JSON.stringify({ path: 'ok.ts', diagnostics: [], incomplete: false })), /0/);
  const nested = consentPreview(
    JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ files: [{ name: 'Synthetic report' }] }) }] }),
  );
  assert.match(nested, /Synthetic report/);
  assert.doesNotMatch(nested, /\{"files"/);
  assert.doesNotThrow(() => consentPreview(JSON.stringify({ diagnostics: [null] })));
});
