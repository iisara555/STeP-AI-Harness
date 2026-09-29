import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatElapsed, formatTokens, groupSessions, matchesSession } from '../src/ui';
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
  assert.match(source, /value="oauth">Claude Console OAuth/);
  assert.match(source, /mode: e\.target\.value === 'claude' \? 'oauth'/);
  assert.match(source, /โควตา API/);
  assert.match(source, /ไม่ใช่โควตา Claude Pro\/Max/);
});
