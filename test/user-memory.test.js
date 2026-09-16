import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  initUserMemory,
  loadUserMemory,
  saveUserMemory,
  parseUserMemory,
  ensureGitignored,
  generateUserMemoryTemplate,
} from '../src/modules/user-memory.js';

test('User Memory (USER.md) & Clarification Suite', async (t) => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'step-memory-test-'));

  t.after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  await t.test('Case 1: initUserMemory creates template with options', async () => {
    const res = await initUserMemory(tmpDir, {
      name: 'สมชาย',
      team: 'afp',
      role: 'เจ้าหน้าที่การเงินและพัสดุ',
      tone: 'สุภาพ ทางการ',
      activeProjects: ['โครงการพัฒนาผู้ประกอบการนวัตกรรม'],
      frequentSkills: ['tor-review', 'receipt-audit'],
    });

    assert.equal(res.created, true);
    assert.ok(res.filePath.endsWith('USER.md'));

    const loaded = await loadUserMemory(tmpDir);
    assert.equal(loaded.exists, true);
    assert.equal(loaded.profile.name, 'สมชาย');
    assert.equal(loaded.profile.team, 'afp');
    assert.equal(loaded.profile.role, 'เจ้าหน้าที่การเงินและพัสดุ');
    assert.ok(loaded.activeProjects.includes('โครงการพัฒนาผู้ประกอบการนวัตกรรม'));
    assert.ok(loaded.frequentSkills.includes('tor-review'));
  });

  await t.test('Case 2: initUserMemory is idempotent and does not overwrite existing', async () => {
    const res = await initUserMemory(tmpDir, {
      name: 'คนอื่น',
      team: 'qs',
    });

    assert.equal(res.created, false);
    const loaded = await loadUserMemory(tmpDir);
    assert.equal(loaded.profile.name, 'สมชาย'); // preserved
  });

  await t.test('Case 3: ensureGitignored automatically adds USER.md and MEMORY.md', async () => {
    const gitignorePath = join(tmpDir, '.gitignore');
    await writeFile(gitignorePath, 'node_modules/\n.DS_Store\n', 'utf-8');

    const updated = await ensureGitignored(tmpDir);
    assert.equal(updated, true);

    const content = await readFile(gitignorePath, 'utf-8');
    assert.ok(content.includes('USER.md'));
    assert.ok(content.includes('MEMORY.md'));

    // Second call should not duplicate
    const updatedAgain = await ensureGitignored(tmpDir);
    assert.equal(updatedAgain, false);
  });

  await t.test('Case 4: parseUserMemory handles empty or custom markdown safely', () => {
    const emptyParsed = parseUserMemory('');
    assert.deepEqual(emptyParsed.activeProjects, []);
    assert.equal(emptyParsed.profile.name, '');

    const customMd = `# Custom Header
## 1. ข้อมูลผู้ใช้งาน (User Profile)
- **ชื่อ / ชื่อเรียก (Name/Nickname)**: Art
- **ทีมหลัก (Primary Team)**: DEV
- **บทบาทหน้าที่ (Role/Function)**: Fullstack Lead
- **รูปแบบการสื่อสารที่ชอบ (Preferred Tone)**: กระชับ ตรงประเด็น
- **ภาษาหลัก (Language)**: ภาษาไทย / English

## 3. โครงการและบริบทที่ทำอยู่ (Active Projects & Contexts)
- STeP AI Harness v0.2
- RSP North Mobile

## 4. ทักษะที่ใช้งานบ่อย (Frequently Used Skills)
- git-branching
- deploy-checklist
`;

    const parsed = parseUserMemory(customMd);
    assert.equal(parsed.profile.name, 'Art');
    assert.equal(parsed.profile.team, 'dev');
    assert.equal(parsed.profile.role, 'Fullstack Lead');
    assert.deepEqual(parsed.activeProjects, ['STeP AI Harness v0.2', 'RSP North Mobile']);
    assert.deepEqual(parsed.frequentSkills, ['git-branching', 'deploy-checklist']);
  });
});
