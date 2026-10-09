import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatElapsed, formatTokens, groupSessions, matchesSession, RichText } from '../src/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '../src/types';

const session = (id: string, updatedAt: string, extra: Partial<Session> = {}) =>
  ({
    id,
    title: id,
    project: '',
    team: 'cc',
    connectionId: 'c',
    messages: [],
    draft: '',
    revision: 0,
    versions: [],
    proposals: [],
    originalQuery: '',
    answers: [],
    clarification: false,
    status: 'idle',
    updatedAt,
    sources: [],
    ...extra,
  }) as Session;
test('chat Markdown renders like other AI apps and keeps HTML, scripts, images and tool requests out', () => {
  const text = [
    'Hello **bold** and `inline` and ~~old~~',
    '',
    '```js',
    '<script>alert(1)</script>',
    'const x = 1;',
    '```',
    '',
    '| Name | Value |',
    '| --- | --- |',
    '| x | 1 |',
    '',
    '> a quote',
    '',
    '- [x] done',
    '- [ ] todo',
    '',
    '[docs](https://example.com/a) [bad](javascript:alert(1)) ![pixel](https://tracker.example/p.png)',
    '',
    '<img src=x onerror=alert(1)><b>raw</b>',
    '',
    '```step-tool',
    '{"tool":"terminal","input":"echo hidden"}',
    '```',
  ].join('\n');
  const html = renderToStaticMarkup(createElement(RichText, { text }));
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>inline<\/code>/);
  assert.match(html, /<del>old<\/del>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /class="hljs-keyword">const</);
  assert.match(html, /<table>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /type="checkbox"[^>]*checked/);
  assert.match(html, /href="https:\/\/example.com\/a"/);
  assert.doesNotMatch(html, /javascript:|<script>|<img|onerror|<b>raw|echo hidden/);
  // A streamed answer with an unclosed tool request shows nothing of it yet.
  assert.doesNotMatch(renderToStaticMarkup(createElement(RichText, { text: 'ok\n```step-tool\n{"tool":"ter' })), /tool/);
});

test('sessions group pinned first, then by recency', () => {
  const now = new Date('2026-09-29T12:00:00');
  const groups = groupSessions(
    [
      session('old', '2026-06-01T10:00:00'),
      session('today', '2026-09-29T09:00:00'),
      session('pin', '2026-01-01T00:00:00', { pinned: true }),
      session('yesterday', '2026-09-28T20:00:00'),
    ],
    now,
  );
  assert.deepEqual(
    groups.map(g => [g.label, g.sessions.map(s => s.id)]),
    [
      ['ปักหมุด', ['pin']],
      ['วันนี้', ['today']],
      ['เมื่อวาน', ['yesterday']],
      ['เก่ากว่านั้น', ['old']],
    ],
  );
});

test('search finds sessions by conversation and draft content', () => {
  const s = session('a', '2026-09-29T00:00:00', {
    title: 'บรีฟ',
    draft: 'กำหนดการงานสัมมนา',
    messages: [{ role: 'user', text: 'ขอโทนทางการ', at: '' }],
  });
  assert.ok(matchesSession(s, 'สัมมนา'));
  assert.ok(matchesSession(s, 'โทนทางการ'));
  assert.ok(!matchesSession(s, 'งบประมาณ'));
});

test('status formats stay compact', () => {
  assert.equal(formatTokens(950), '950');
  assert.equal(formatTokens(14_900), '14.9k');
  assert.equal(formatElapsed(65_000), '1:05');
});

test('theme tokens use the confirmed STeP CI colours and never the superseded template palette', async () => {
  const { readFile } = await import('node:fs/promises');
  // Compare without whitespace so formatting the stylesheet does not matter.
  const css = (await readFile(new URL('../src/theme.css', import.meta.url), 'utf8')).toLowerCase().replace(/\s+/g, '');
  assert.match(css, /--accent:#ffc709/);
  assert.match(css, /--on-accent:#231f20/);
  assert.match(css, /--text:#231f20/);
  for (const old of ['#f9ae3b', '#f2a32d', '#2b333d', '#285d50']) assert.ok(!css.includes(old), old);
});

test('Claude provider offers supported Console OAuth and clearly separates it from Pro/Max', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/ui.tsx', import.meta.url), 'utf8');
  assert.match(source, /value="oauth">\{t\('Claude Console OAuth/);
  const { providerDefaultMode } = await import('../src/ui');
  // Console OAuth bills the API, so it is never the default for Claude.
  assert.equal(providerDefaultMode('claude'), 'api');
  assert.equal(providerDefaultMode('claude', true), 'subscription');
  assert.equal(providerDefaultMode('copilot'), 'oauth');
  assert.equal(providerDefaultMode('compatible'), 'api');
  assert.match(source, /โควตา API/);
  assert.match(source, /ไม่ใช่โควตา Claude Pro\/Max/);
});
