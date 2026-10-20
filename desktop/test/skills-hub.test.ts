import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OwnPack, SkillEntry } from '../src/types';

// The hub's illustration imports a PNG, which Vite serves in the app; Node gets an empty URL instead.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      'export async function load(url, context, next) { return url.endsWith(".png") ? { format: "module", source: "export default \'\'", shortCircuit: true } : next(url, context); }',
    ),
);
const { SkillsHub } = await import('../src/skills');

const skill = (extra: Partial<SkillEntry> = {}): SkillEntry => ({
  name: 'leave-letter',
  title: 'หนังสือลา',
  description: 'ร่างหนังสือลา',
  category: 'staff',
  path: 'skills/staff/leave-letter/SKILL.md',
  status: 'routed',
  inRegistry: true,
  inRouter: true,
  owner: 'cc',
  version: '1.0.0',
  stage: 'draft',
  cluster: '',
  teams: [],
  triggers: [],
  ...extra,
});
const pack: OwnPack = {
  id: 'my-pack',
  enabled: true,
  personal: true,
  skills: [{ id: 'meeting-notes' }],
  credit: { name: 'สมหญิง ใจดี', team: 'cc', uploadedAt: '2026-10-18T02:00:00.000Z' },
};
const render = (props: Partial<Parameters<typeof SkillsHub>[0]>) =>
  renderToStaticMarkup(createElement(SkillsHub, { skills: [skill()], onUse: () => {}, onOpenTool: () => {}, ...props }));

test('the add-my-Skill button and own Skills appear only while staff Skills are allowed', () => {
  const allowed = render({ ownPacks: [pack], onAddOwn: () => {} });
  assert.match(allowed, /เพิ่มตัวช่วยงานของฉัน/);
  assert.match(allowed, /ตัวช่วยงานของฉัน/);
  assert.match(allowed, /meeting-notes/);
  assert.match(allowed, /เพิ่มโดย สมหญิง ใจดี · cc · /);
  assert.match(allowed, /ใช้เองบนเครื่องนี้/);
  // features.staffSkills: false → App passes no onAddOwn, so neither the button nor imported packs show.
  const off = render({ ownPacks: [pack] });
  assert.doesNotMatch(off, /เพิ่มตัวช่วยงานของฉัน/);
  assert.doesNotMatch(off, /meeting-notes/);
});

test('organization Skills credit their consenting contributors and others show no credit', () => {
  const credited = render({ skills: [skill({ contributors: [{ name: 'Somchai', team: 'afp', date: '2026-10-18' }] })] });
  assert.match(credited, /เพิ่มโดย Somchai · afp · /);
  assert.doesNotMatch(render({}), /เพิ่มโดย/);
});
