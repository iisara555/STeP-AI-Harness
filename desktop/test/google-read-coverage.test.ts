import test from 'node:test';
import assert from 'node:assert/strict';
import { googleReadCoverage } from '../electron/google-read-coverage';
import { googleMailContent } from '../electron/google-mail';
import { googleInvocation } from '../electron/google-operations';

const body = (text: string, mimeType = 'text/plain') => ({ mimeType, body: { data: Buffer.from(text).toString('base64url') } });

test('paged and incomplete searches cannot establish that no matching record exists', () => {
  for (const data of [
    { files: [], nextPageToken: 'synthetic-next' },
    { files: [], incompleteSearch: true },
  ]) {
    const coverage = googleReadCoverage({ operation: 'drive.list' }, data);
    assert.equal(coverage.complete, false);
    assert.equal(coverage.returnedItems, 0);
    assert.ok(coverage.reasons.length);
    assert.match(coverage.guidance, /cannot establish/);
  }
  const complete = googleReadCoverage({ operation: 'drive.list' }, { files: [] });
  assert.equal(complete.complete, true);
  assert.match(complete.scope, /result page only/);
});

test('Docs requests all tabs and coverage inspects child tabs without claiming images are read', () => {
  const request = { operation: 'docs.get' as const, params: { documentId: 'synthetic-doc' } };
  assert.equal(new URL(googleInvocation(request).url).searchParams.get('includeTabsContent'), 'true');
  const data = { tabs: [{ documentTab: { body: {} }, childTabs: [{ documentTab: { body: {}, inlineObjects: { image: {} } } }] }] };
  const coverage = googleReadCoverage(request, data);
  assert.equal(coverage.tabsRead, 2);
  assert.equal(coverage.complete, false);
  assert.ok(coverage.reasons.includes('EMBEDDED_CONTENT_NOT_READ'));
  assert.ok(googleReadCoverage(request, { body: {} }).reasons.includes('DOCUMENT_TABS_UNAVAILABLE'));
});

test('mail text and MIME traversal limits are explicit before the model receives the result', () => {
  const long = googleMailContent({ id: 'synthetic-mail', payload: body('ก'.repeat(80001)) });
  assert.equal(long.text.length, 80000);
  assert.equal(long.contentTruncated, true);
  assert.ok(googleReadCoverage({ operation: 'gmail.get' }, long).reasons.includes('CONTENT_TRUNCATED'));
  const wide = googleMailContent({ payload: { parts: Array.from({ length: 55 }, () => body('SYNTHETIC')) } });
  assert.equal(wide.contentTruncated, true);
  const complete = googleMailContent({ payload: body('เลข 0007 ยอด 1200.50') });
  assert.equal(complete.contentTruncated, undefined);
  assert.equal(googleReadCoverage({ operation: 'gmail.get' }, complete).complete, true);
});

test('HTML-only mail is inert text with header, footer and table values retained', () => {
  const html =
    '<html><body><header>เลข 0007</header><main><p>วันนัดสังเคราะห์</p><table><tr><th>ยอดเงิน</th><td>1200.50</td></tr></table></main><footer>เงื่อนไขท้ายข้อความ</footer><script>DO_NOT_EXECUTE</script><img src="https://tracker.example.test/pixel" /></body></html>';
  const mail = googleMailContent({ payload: body(html, 'text/html') });
  assert.equal(mail.contentFormat, 'html-text');
  assert.match(mail.text, /เลข 0007/);
  assert.match(mail.text, /ยอดเงิน\s+1200\.50/);
  assert.match(mail.text, /เงื่อนไขท้ายข้อความ/);
  assert.doesNotMatch(mail.text, /DO_NOT_EXECUTE|tracker\.example/);
  assert.equal(mail.inlineImagesNotRead, true);
  assert.equal(googleReadCoverage({ operation: 'gmail.get' }, mail).complete, false);
  const emptyAlternative = googleMailContent({ payload: { parts: [body('  '), body('<p>SYNTHETIC HTML BODY</p>', 'text/html')] } });
  assert.match(emptyAlternative.text, /SYNTHETIC HTML BODY/);
  assert.equal(emptyAlternative.contentFormat, 'html-text');
  assert.ok(googleMailContent({ payload: body('') }).contentUnavailable);
  const unsafe = googleMailContent({ payload: body('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///synthetic">]><html>&e;</html>', 'text/html') });
  assert.equal(unsafe.text, '');
  assert.ok(unsafe.contentUnavailable);
});

test('plain-text alternatives are preferred and attachment bodies do not become message text', () => {
  const mail = googleMailContent({
    payload: {
      parts: [
        body('ข้อมูลต้นเรื่อง 00123'),
        body('<p>HTML alternative</p>', 'text/html'),
        { ...body('ATTACHMENT CONTENT'), filename: 'synthetic.txt' },
      ],
    },
  });
  assert.equal(mail.text, 'ข้อมูลต้นเรื่อง 00123');
  assert.equal(mail.contentFormat, undefined);
  assert.equal(mail.attachments?.length, 1);
  assert.ok(googleReadCoverage({ operation: 'gmail.get' }, mail).reasons.includes('ATTACHMENTS_NOT_READ'));
  assert.equal(googleReadCoverage({ operation: 'gmail.threads.get' }, { messages: [mail], messagesTruncated: true }).complete, false);
});

test('Calendar requires an explicit ordered interval with timezone and sorts expanded events', () => {
  const request = {
    operation: 'calendar.events' as const,
    params: { calendarId: 'primary', timeMin: '2026-10-26T00:00:00+07:00', timeMax: '2026-11-02T00:00:00+07:00' },
  };
  const url = new URL(googleInvocation(request).url);
  assert.equal(url.searchParams.get('orderBy'), 'startTime');
  assert.equal(url.searchParams.get('singleEvents'), 'true');
  for (const params of [
    { timeMin: '2026-10-26' },
    { timeMin: '2026-10-26T00:00:00' },
    { timeMax: request.params.timeMin },
    { timeMin: request.params.timeMax },
    { timeMin: 'yesterday' },
    { timeMin: '2026-02-31T00:00:00Z' },
    { timeMin: '2026-10-26T24:00:00Z' },
  ])
    assert.throws(() => googleInvocation({ ...request, params: { ...request.params, ...params } }), /INVALID_GOOGLE_INPUT/);
  const coverage = googleReadCoverage(request, { items: [], nextPageToken: 'synthetic-next' });
  assert.equal(coverage.complete, false);
  assert.equal(coverage.timeMin, request.params.timeMin);
});
