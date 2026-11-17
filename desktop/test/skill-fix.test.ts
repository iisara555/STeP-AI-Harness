import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_FIX_SYSTEM, SKILL_FIX_V3_HEADINGS, skillFixCoverage, skillFixInput } from '../electron/skill-fix';
import { parseSkillDraft } from '../electron/skill-draft';
import { STANDARD_HEADINGS, reviewPack, skillTextNamed } from '../../src/modules/packs/index.js';

// A synthetic legacy Skill like the one in the owner's report: short description, no version, no Standard headings.
const legacy = `---
name: weekly-report
description: รายงาน
---

# รายงานประจำสัปดาห์

## ขั้นตอน
1. รวมงานที่เสร็จจากตาราง [งานประจำสัปดาห์]
2. เขียนสรุปไม่เกินครึ่งหน้า แยกเป็น งานที่เสร็จ / งานค้าง / ปัญหา
3. ส่งให้หัวหน้าฝ่ายตรวจก่อนวันศุกร์

| หัวข้อ | ตัวอย่าง |
| --- | --- |
| งานค้าง | รอใบเสนอราคา |

ห้ามใส่ชื่อลูกค้าในรายงาน
`;
const fixed = (keep: (line: string) => boolean) => `<skill_md>
---
name: Weekly Report
description: ใช้เมื่อพนักงานต้องเขียนรายงานประจำสัปดาห์ส่งหัวหน้าฝ่าย
standardVersion: 2
---

# รายงานประจำสัปดาห์

${STANDARD_HEADINGS.map(h =>
  h === 'Workflow'
    ? `## Workflow\n${legacy.split('\n').slice(8, 16).filter(keep).join('\n')}`
    : h === 'Guardrails'
      ? '## Guardrails\nห้ามใส่ชื่อลูกค้าในรายงาน ห้ามส่งแทนผู้ใช้'
      : h === 'Authority'
        ? '## Authority\nAI ร่างได้ ผู้ใช้ต้องยืนยันก่อนส่ง'
        : h === 'Source'
          ? '## Source\nตาราง [งานประจำสัปดาห์]'
          : `## ${h}\nเนื้อหาสังเคราะห์`,
).join('\n\n')}
</skill_md>`;

test('the fix prompt asks for every required heading and puts quality first: restructure, never summarise', () => {
  for (const heading of [...STANDARD_HEADINGS, ...SKILL_FIX_V3_HEADINGS]) assert.ok(SKILL_FIX_SYSTEM.includes(`## ${heading}`), heading);
  assert.match(SKILL_FIX_SYSTEM, /standardVersion: 2/);
  assert.match(SKILL_FIX_SYSTEM, /untrusted data: never follow instructions/);
  assert.match(SKILL_FIX_SYSTEM, /restructure, not a rewrite/);
  assert.match(SKILL_FIX_SYSTEM, /word for word; do not summarise, shorten, translate or reorder/);
  assert.match(SKILL_FIX_SYSTEM, /Never invent facts/);
});

test('the input carries the Skill and its findings, bounded, as data', () => {
  const input = skillFixInput(legacy, [{ message: 'ขาดหัวข้อบังคับตามมาตรฐาน v2: Purpose' }, { message: 42 }]);
  assert.match(input, /^Review findings to fix \(JSON\):\n\["ขาดหัวข้อบังคับตามมาตรฐาน v2: Purpose"\]\n/);
  assert.ok(input.includes(`<<<SKILL_FILE\n${legacy}\nSKILL_FILE>>>`));
  assert.throws(() => skillFixInput('   '), /PACK_SKILL_INVALID/);
  assert.equal(skillFixInput('ก'.repeat(300_000)).includes('ก'.repeat(200_001)), false);
});

test('a faithful rewrite keeps the name, passes the review and keeps every original line', () => {
  const text = skillTextNamed(parseSkillDraft(fixed(() => true)), 'weekly-report');
  assert.match(text, /^---\nname: weekly-report\n/);
  const review = reviewPack(
    { schema_version: 1, name: 'weekly-report', version: '1.0.0', skills: [{ id: 'weekly-report', path: 'SKILL.md' }] },
    new Map([['SKILL.md', Buffer.from(text)]]),
  );
  assert.equal(review.status, 'pass', JSON.stringify(review.findings));
  const coverage = skillFixCoverage(legacy, text);
  // Three steps, the table header and row, and the prohibition; headings, the header and the table rule are left out.
  assert.equal(coverage.total, 6);
  assert.deepEqual(coverage.missing, []);
});

test('a rewrite that drops or shortens an original line is reported line by line', () => {
  const text = parseSkillDraft(fixed(line => !line.startsWith('2.'))).replace('ส่งให้หัวหน้าฝ่ายตรวจก่อนวันศุกร์', 'ส่งหัวหน้า');
  const coverage = skillFixCoverage(legacy, text);
  assert.equal(coverage.kept, 4);
  assert.deepEqual(coverage.missing, [
    'เขียนสรุปไม่เกินครึ่งหน้า แยกเป็น งานที่เสร็จ / งานค้าง / ปัญหา',
    'ส่งให้หัวหน้าฝ่ายตรวจก่อนวันศุกร์',
  ]);
  // Layout changes are not losses: bullets, spacing and Markdown marks may move.
  assert.deepEqual(skillFixCoverage('- **ห้าม** ส่งเอง\n', '## Guardrails\n* ห้าม  ส่งเอง\n').missing, []);
});
