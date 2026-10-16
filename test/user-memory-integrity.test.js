import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyPersonalization,
  ensureGitignored,
  generateUserMemoryTemplate,
  parseUserMemory,
  savePersonalization,
  updateUserMemoryProfile,
} from '../src/modules/user-memory.js';

const exec = promisify(execFile);
const moduleUrl = new URL('../src/modules/user-memory.js', import.meta.url).href;

async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(), 'step-user-memory-integrity-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('an empty team field is filled in place without eating the routing cluster line', async t => {
  const dir = await workspace(t);
  await writeFile(join(dir, 'USER.md'), generateUserMemoryTemplate({ name: 'สมชาย', team: '', cluster: 'finance' }));
  await updateUserMemoryProfile(dir, { team: 'afp', cluster: 'finance' });
  const text = await readFile(join(dir, 'USER.md'), 'utf8');
  const parsed = parseUserMemory(text);
  assert.equal(parsed.profile.team, 'afp');
  assert.equal(parsed.profile.cluster, 'finance');
  assert.equal(parsed.profile.role, '');
  assert.match(text, /- \*\*กลุ่มงานสำหรับ Routing \(Routing Cluster\)\*\*: finance\n- \*\*บทบาทหน้าที่/);
});

test('an empty cluster field is filled in place without eating the role line', async t => {
  const dir = await workspace(t);
  await writeFile(join(dir, 'USER.md'), generateUserMemoryTemplate({ name: 'A', team: 'afp', role: 'นักบัญชี' }));
  await updateUserMemoryProfile(dir, { team: 'afp', cluster: 'finance' });
  const parsed = parseUserMemory(await readFile(join(dir, 'USER.md'), 'utf8'));
  assert.equal(parsed.profile.cluster, 'finance');
  assert.equal(parsed.profile.role, 'นักบัญชี');
});

test('upgrading an older USER.md keeps its working preferences and notes', () => {
  const legacy = [
    '# STeP User Memory',
    '',
    '## 1. ข้อมูลผู้ใช้งาน (User Profile)',
    '- **ชื่อ / ชื่อเรียก (Name/Nickname)**: สมหญิง',
    '- **ทีมหลัก (Primary Team)**: QS',
    '',
    '## 3. สไตล์และแนวทางการทำงาน (Working Preferences)',
    '- **การจัดรูปแบบผลลัพธ์ (Output Format)**: ตอบเป็นย่อหน้าสั้น',
    '- **รูปแบบไฟล์ (File Type)**: DOCX เท่านั้น',
    '',
    '## 7. บันทึกเพิ่มเติมและการเรียนรู้ (Working Notes & Clarifications)',
    '- ใช้ปีงบประมาณ พ.ศ. เสมอ',
    '- ส่งร่างให้หัวหน้าตรวจก่อน',
    '',
  ].join('\n');
  const upgraded = parseUserMemory(applyPersonalization(legacy, { name: 'สมหญิง', assistantName: 'Mate', personality: 'concise' }));
  assert.equal(upgraded.profile.name, 'สมหญิง');
  assert.equal(upgraded.assistant.personality, 'concise');
  assert.equal(upgraded.preferences['การจัดรูปแบบผลลัพธ์ (Output Format)'], 'ตอบเป็นย่อหน้าสั้น');
  assert.equal(upgraded.preferences['รูปแบบไฟล์ (File Type)'], 'DOCX เท่านั้น');
  assert.deepEqual(upgraded.notes, ['ใช้ปีงบประมาณ พ.ศ. เสมอ', 'ส่งร่างให้หัวหน้าตรวจก่อน']);
});

test('names and styles containing $& or $$ are saved literally', async t => {
  const created = applyPersonalization('', { name: 'A', assistantName: 'B' });
  const text = applyPersonalization(created, {
    name: 'Tom $& Jerry',
    assistantName: 'Bot $$1',
    personality: 'custom',
    assistantTone: "ตอบสั้น $' $` $1",
  });
  const parsed = parseUserMemory(text);
  assert.equal(parsed.profile.name, 'Tom $& Jerry');
  assert.equal(parsed.assistant.name, 'Bot $$1');
  assert.equal(parsed.assistant.tone, "ตอบสั้น $' $` $1");

  const dir = await workspace(t);
  await writeFile(join(dir, 'USER.md'), created);
  await updateUserMemoryProfile(dir, { team: 'afp', cluster: 'a$&b', starterPrompts: ['ทำ $& ให้'] });
  const updated = parseUserMemory(await readFile(join(dir, 'USER.md'), 'utf8'));
  assert.equal(updated.profile.cluster, 'a$&b');
  assert.match(await readFile(join(dir, 'USER.md'), 'utf8'), /- ทำ \$& ให้\n/);
});

test('a 300-character custom style is kept whole in USER.md', () => {
  const tone = 'ก'.repeat(300);
  const text = applyPersonalization('', { name: 'A', personality: 'custom', assistantTone: tone });
  assert.equal(parseUserMemory(text).assistant.tone, tone);
  assert.equal(parseUserMemory(applyPersonalization(text, { name: 'A', personality: 'custom', assistantTone: tone })).assistant.tone, tone);
});

test('a later negation in .gitignore does not count as ignoring the private files', async t => {
  const dir = await workspace(t);
  await writeFile(join(dir, '.gitignore'), 'USER.md\nMEMORY.md\nASSISTANT.md\n.step/memory/\n!USER.md\n');
  assert.equal(await ensureGitignored(dir), true);
  const lines = (await readFile(join(dir, '.gitignore'), 'utf8')).split('\n');
  assert.ok(lines.lastIndexOf('USER.md') > lines.indexOf('!USER.md'));
  // Once the rule follows the negation, nothing more is added.
  assert.equal(await ensureGitignored(dir), false);

  await writeFile(join(dir, '.gitignore'), '/USER.md\nMEMORY.md\nASSISTANT.md\n.step/memory/\n');
  assert.equal(await ensureGitignored(dir), false);
});

test('parallel profile saves from several processes keep every change', async t => {
  const dir = await workspace(t);
  await savePersonalization(dir, { name: 'เริ่มต้น', assistantName: 'Mate' });
  const run = code =>
    exec(process.execPath, ['--input-type=module', '--eval', `import * as m from ${JSON.stringify(moduleUrl)};\n${code}`], { timeout: 20_000 });
  await Promise.all([
    run(`for (let i = 0; i < 8; i++) await m.updateUserMemoryProfile(${JSON.stringify(dir)}, { team: 'afp', cluster: 'finance' });`),
    run(`for (let i = 0; i < 8; i++) await m.savePersonalization(${JSON.stringify(dir)}, { name: 'สมชาย', assistantName: 'Mate', team: 'afp' });`),
    run(`for (let i = 0; i < 8; i++) await m.updateUserMemoryProfile(${JSON.stringify(dir)}, { team: 'afp', cluster: 'finance', starterPrompts: ['ตรวจใบเสร็จ'] });`),
  ]);
  const text = await readFile(join(dir, 'USER.md'), 'utf8');
  const parsed = parseUserMemory(text);
  assert.equal(parsed.profile.name, 'สมชาย');
  assert.equal(parsed.profile.team, 'afp');
  assert.equal(parsed.profile.cluster, 'finance');
  assert.match(text, /- ตรวจใบเสร็จ\n/);
  assert.equal((text.match(/First Run Completed/g) || []).length, 1);
  assert.deepEqual((await readdir(dir)).filter(f => f.endsWith('.lock') || f.endsWith('.tmp')), []);
});
