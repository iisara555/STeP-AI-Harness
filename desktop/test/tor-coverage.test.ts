import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { missingTorSections } from '../electron/tor-coverage';

const template = await readFile(
  new URL('../../skills/common/thai-official-documents/templates/tor-16-sections-template.md', import.meta.url),
  'utf8',
);
const headings = [...template.matchAll(/^([๐-๙]+)\.\s+(.+)$/gm)];
const makeDraft = (omit: number[] = []) =>
  headings
    .map((match, index) => (omit.includes(index + 1) ? '' : `## ${match[1]}. ${match[2]}\n\nเนื้อหาสังเคราะห์ [รอยืนยัน: ข้อมูล]`))
    .filter(Boolean)
    .join('\n\n');

test('the working outline is complete with Thai, Arabic and bold numbered headings', () => {
  assert.deepEqual(missingTorSections(makeDraft(), template), []);
  const arabic = headings.map((match, index) => `## **${index + 1}. ${match[2]}**\nเนื้อหา`).join('\n\n');
  assert.deepEqual(missingTorSections(arabic, template), []);
  const plain = headings.map((match, index) => `${index + 1}. ${match[2]}\nเนื้อหา`).join('\n\n');
  assert.deepEqual(missingTorSections(plain, template), []);
});

test('the existing full TOR fixture is recognized despite shorter heading labels', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/document-drafts.json', import.meta.url), 'utf8'));
  assert.deepEqual(missingTorSections(fixture.documents.tor, template), []);
});

test('subclauses, tables, code blocks and numbered lists do not hide missing main sections', () => {
  const draft = [
    makeDraft([7, 14]),
    '7.1 ผลผลิตย่อย',
    '| 7. ผลผลิตและรายการส่งมอบ | ตัวอย่าง |',
    '```text\n## ๑๔. การรับประกันความชำรุดบกพร่อง\n```',
    '14. รายการวัสดุสังเคราะห์',
    'โปรดตรวจข้อ ๗ และข้อ ๑๔',
  ].join('\n\n');
  const missing = missingTorSections(draft, template)!;
  assert.deepEqual(
    missing.map(section => section.number),
    [7, 14],
  );
  assert.match(missing[0].title, /ผลผลิต/);
  assert.match(missing[1].title, /รับประกัน/);
});

test('an invalid working template does not produce a misleading completeness result', () => {
  assert.equal(missingTorSections(makeDraft(), '๑. หลักการและเหตุผล'), null);
});
