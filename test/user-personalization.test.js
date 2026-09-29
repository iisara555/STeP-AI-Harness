import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPersonalization, generateUserMemoryTemplate, parseUserMemory, savePersonalization } from '../src/modules/user-memory.js';

test('personalization updates name, assistant and style and completes First Run', () => {
  const before = generateUserMemoryTemplate({ team: 'cc', activeProjects: ['งานสัมมนา AI'] });
  const after = parseUserMemory(applyPersonalization(before, { name: 'ต้น', assistantName: 'น้องสเต็ป', personality: 'concise' }));
  assert.equal(after.profile.name, 'ต้น'); assert.equal(after.assistant.name, 'น้องสเต็ป');
  assert.equal(after.assistant.personality, 'concise'); assert.match(after.assistant.tone, /ตอบสั้น/);
  assert.equal(after.assistant.firstRunCompleted, true); assert.deepEqual(after.activeProjects, ['งานสัมมนา AI']);
});

test('custom style is kept on one line and unknown presets fall back safely', () => {
  const text = applyPersonalization('', { name: 'A', personality: 'custom', assistantTone: 'เรียกผมว่าพี่\nตอบเป็นข้อ ๆ' });
  const parsed = parseUserMemory(text);
  assert.equal(parsed.assistant.tone, 'เรียกผมว่าพี่ ตอบเป็นข้อ ๆ');
  assert.equal(parseUserMemory(applyPersonalization('', { personality: 'rude' })).assistant.personality, 'coworker');
});

test('saving creates USER.md once, keeps notes on update, and gitignores it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-user-'));
  assert.equal((await savePersonalization(dir, { name: 'ต้น', personality: 'professional' })).created, true);
  const withNote = (await readFile(join(dir, 'USER.md'), 'utf-8')).replace('## 7. บันทึกเพิ่มเติมและการเรียนรู้ (Working Notes & Clarifications)\n', '## 7. บันทึกเพิ่มเติมและการเรียนรู้ (Working Notes & Clarifications)\n- ชอบตาราง\n');
  await writeFile(join(dir, 'USER.md'), withNote);
  await savePersonalization(dir, { name: 'ต้น', assistantName: 'Mate', personality: 'coworker' });
  const parsed = parseUserMemory(await readFile(join(dir, 'USER.md'), 'utf-8'));
  assert.equal(parsed.assistant.name, 'Mate'); assert.ok(parsed.notes.includes('ชอบตาราง'));
  assert.match(await readFile(join(dir, '.gitignore'), 'utf-8'), /USER\.md/);
});
