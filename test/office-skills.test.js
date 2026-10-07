import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { queryStepRouter } from '../src/cli/commands/ask.js';

test('Excel routes as its own capability while plans and finance stay specialized', async () => {
  const cases = [
    ['ช่วยแก้ไฟล์ Excel เปลี่ยนค่าเซลล์ A2 เป็นรหัส 00123', 'spreadsheet-work'],
    ['ช่วยตรวจสูตร Excel ในไฟล์นี้', 'spreadsheet-work'],
    ['ช่วยทำสไลด์ PowerPoint เป็นไฟล์ PPTX ที่แก้ต่อได้', 'presentation-design'],
    ['ช่วยตรวจ TOR ก่อนส่ง AFP', 'tor-review'],
  ];
  for (const [prompt, skill] of cases) {
    const result = await queryStepRouter(prompt, { team: 'cc', workspaceDir: 'tmp/__office-evals__' });
    assert.equal(result.routingContract.skill, skill, prompt);
  }
});
test('coauthoring extends existing skills and distinguishes author review from independent evidence', async () => {
  for (const path of ['skills/common/step-writing/SKILL.md', 'skills/common/document-review/SKILL.md', 'skills/pm/decision-memo/SKILL.md', 'skills/common/sop-authoring/SKILL.md'])
    assert.match(await readFile(path, 'utf8'), /document-coauthoring\.md/);
  const doc = await readFile('docs/document-coauthoring.md', 'utf8');
  assert.match(doc, /author-review/);
  assert.match(doc, /independent-reader/);
  assert.match(doc, /EXTRACTED_UNVERIFIED/);
  const registry = await readFile('manifest/skills.yaml', 'utf8');
  assert.match(registry, /spreadsheet-work:[\s\S]*?stage: draft/);
  assert.ok(!registry.includes('doc-coauthoring:'));
});
