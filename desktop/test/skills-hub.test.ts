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
  assert.match(allowed, /เพิ่ม Skill ของฉัน/);
  assert.match(allowed, /Skill ของฉัน/);
  assert.match(allowed, /meeting-notes/);
  assert.match(allowed, /เพิ่มโดย สมหญิง ใจดี · cc · /);
  assert.match(allowed, /ใช้เองบนเครื่องนี้/);
  // features.staffSkills: false → App passes no onAddOwn, so neither the button nor imported packs show.
  const off = render({ ownPacks: [pack] });
  assert.doesNotMatch(off, /เพิ่ม Skill ของฉัน/);
  assert.doesNotMatch(off, /meeting-notes/);
});

test('organization Skills credit their consenting contributors and others show no credit', () => {
  const credited = render({ skills: [skill({ contributors: [{ name: 'Somchai', team: 'afp', date: '2026-10-18' }] })] });
  assert.match(credited, /เพิ่มโดย Somchai · afp · /);
  assert.doesNotMatch(render({}), /เพิ่มโดย/);
});

test("the person's team Skills lead under their own heading, without a tag on every card", () => {
  const skills = [
    skill({ name: 'audit-prep', title: 'เตรียมตรวจประเมิน', owner: 'qa' }),
    skill({ name: 'leave-letter', title: 'หนังสือลา', owner: 'cc' }),
    skill({ name: 'meeting-summary', title: 'สรุปการประชุม', owner: 'common', teams: ['cc'] }),
  ];
  const html = render({ skills, team: 'cc' });
  const team = html.indexOf('<h2>ทีมคุณ</h2>'),
    organization = html.indexOf('Skill ขององค์กร');
  assert.ok(team > -1 && organization > team);
  // Owned by the team or shared with it: both sit in the team group. Another team's Skill follows the second heading.
  for (const title of ['หนังสือลา', 'สรุปการประชุม']) {
    const at = html.indexOf(title);
    assert.ok(at > team && at < organization, title);
  }
  assert.ok(html.indexOf('เตรียมตรวจประเมิน') > organization);
  assert.doesNotMatch(html, /tag team/);
  // No team chosen: one plain list, no headings.
  const plain = render({ skills });
  assert.doesNotMatch(plain, /ทีมคุณ|Skill ขององค์กร/);
});

test('a usable card has one control named for its action, and a Skill that is not ready has none', () => {
  const ready = render({});
  assert.equal(ready.match(/class="skill-go"/g)?.length, 3); // two built-in tools and the Skill
  assert.match(ready, /<button class="skill-go" aria-label="ใช้ Skill นี้" title="\/leave-letter · ทีม CC · draft · staff">/);
  assert.equal(ready.match(/aria-label="เปิดเครื่องมือ"/g)?.length, 2);
  // The action is named for screen readers only: the visible label is not repeated on every card.
  assert.doesNotMatch(ready, />ใช้ Skill นี้</);
  const waiting = render({ skills: [skill({ status: 'registered', inRouter: false })] });
  assert.equal(waiting.match(/class="skill-go"/g)?.length, 2);
  assert.doesNotMatch(waiting, /aria-label="ใช้ Skill นี้"/);
});
