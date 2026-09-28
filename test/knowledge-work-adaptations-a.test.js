import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cases = [
  {
    id: 'CRM',
    file: 'skills/common/customer-support-faq-triage/SKILL.md',
    marker: '### Escalation Brief',
    fields: ['สิ่งที่ลองแล้ว', 'ผลกระทบที่ยืนยันแล้ว', 'ปลายทางที่เสนอ'],
  },
  {
    id: 'PITI',
    file: 'skills/pm/startup-discovery/SKILL.md',
    marker: '### Interview Evidence Grid',
    fields: ['จำนวนผู้ให้ข้อมูล', 'หลักฐานที่ขัดกัน', 'ข้อจำกัดของ sample'],
  },
  {
    id: 'MI',
    file: 'skills/common/market-signal-radar/SKILL.md',
    marker: '### Competitor Comparison',
    fields: ['หลักฐานพร้อมวันที่', 'positioning', 'สิ่งที่ยังต้องตรวจ'],
  },
];

for (const item of cases) {
  test(`${item.id}: วิธีใหม่มี contract และข้อมูลขั้นต่ำ`, () => {
    const md = readFileSync(new URL(`../${item.file}`, import.meta.url), 'utf8');
    assert.ok(md.includes(item.marker), `${item.id} missing ${item.marker}`);
    for (const field of item.fields) assert.ok(md.includes(field), `${item.id} missing ${field}`);
  });
}
