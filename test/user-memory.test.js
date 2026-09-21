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
  updateUserMemoryProfile,
  needsFirstRunCompanion,
  getPersonalityPreset,
} from '../src/modules/user-memory.js';

test('User Memory (USER.md), First Run Companion & Clarification Suite', async (t) => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'step-memory-test-'));

  t.after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  await t.test('Case 1: initUserMemory creates template with assistant defaults and options', async () => {
    const res = await initUserMemory(tmpDir, {
      name: 'สมชาย',
      team: 'afp',
      cluster: 'governance-operations',
      starterPrompts: [
        'ช่วยตรวจ TOR นี้ก่อนส่ง AFP',
        'ช่วย pre-check ใบเสร็จชุดนี้',
        'ช่วยสรุปคำขอจัดซื้อรายการนี้',
      ],
      role: 'เจ้าหน้าที่การเงินและพัสดุ',
      activeProjects: ['โครงการพัฒนาผู้ประกอบการนวัตกรรม'],
      frequentSkills: ['tor-review', 'receipt-audit'],
    });

    assert.equal(res.created, true);
    assert.ok(res.filePath.endsWith('USER.md'));

    const loaded = await loadUserMemory(tmpDir);
    assert.equal(loaded.exists, true);
    assert.equal(loaded.profile.name, 'สมชาย');
    assert.equal(loaded.profile.team, 'afp');
    assert.equal(loaded.profile.cluster, 'governance-operations');
    assert.equal(loaded.profile.role, 'เจ้าหน้าที่การเงินและพัสดุ');
    assert.equal(loaded.assistant.name, 'STeP Mate');
    assert.equal(loaded.assistant.personality, 'coworker');
    assert.equal(loaded.assistant.firstRunCompleted, false);
    assert.equal(needsFirstRunCompanion(loaded), true);
    assert.ok(loaded.activeProjects.includes('โครงการพัฒนาผู้ประกอบการนวัตกรรม'));
    assert.ok(loaded.frequentSkills.includes('tor-review'));
  });

  await t.test('Case 2: initUserMemory is idempotent and does not overwrite existing', async () => {
    const res = await initUserMemory(tmpDir, {
      name: 'คนอื่น',
      team: 'qs',
      assistantName: 'Friday',
    });

    assert.equal(res.created, false);
    const loaded = await loadUserMemory(tmpDir);
    assert.equal(loaded.profile.name, 'สมชาย');
    assert.equal(loaded.assistant.name, 'STeP Mate');
  });

  await t.test('Case 2b: deferred team confirmation updates USER.md routing identity and starter tasks', async () => {
    const updated = await updateUserMemoryProfile(tmpDir, {
      team: 'cc',
      cluster: 'market-creative',
      starterPrompts: [
        'ช่วยทำ Designer Brief จากข้อมูลนี้ให้ครบก่อนส่งทีมออกแบบ',
        'ช่วยคิด Event Concept จาก TOR นี้',
        'ช่วยจัดโครง Presentation นี้ให้ message ชัด',
      ],
    });

    assert.equal(updated.updated, true);
    const loaded = await loadUserMemory(tmpDir);
    assert.equal(loaded.profile.team, 'cc');
    assert.equal(loaded.profile.cluster, 'market-creative');

    const raw = await readFile(join(tmpDir, 'USER.md'), 'utf-8');
    assert.ok(raw.includes('ช่วยทำ Designer Brief จากข้อมูลนี้ให้ครบก่อนส่งทีมออกแบบ'));
    assert.ok(raw.includes('ช่วยคิด Event Concept จาก TOR นี้'));
    assert.ok(raw.includes('ช่วยจัดโครง Presentation นี้ให้ message ชัด'));
  });

  await t.test('Case 3: ensureGitignored automatically adds USER.md and MEMORY.md', async () => {
    const gitignorePath = join(tmpDir, '.gitignore');
    await writeFile(gitignorePath, 'node_modules/\n.DS_Store\n', 'utf-8');

    const updated = await ensureGitignored(tmpDir);
    assert.equal(updated, true);

    const content = await readFile(gitignorePath, 'utf-8');
    assert.ok(content.includes('USER.md'));
    assert.ok(content.includes('MEMORY.md'));

    const updatedAgain = await ensureGitignored(tmpDir);
    assert.equal(updatedAgain, false);
  });

  await t.test('Case 4: parseUserMemory handles legacy markdown without forcing onboarding', () => {
    const emptyParsed = parseUserMemory('');
    assert.deepEqual(emptyParsed.activeProjects, []);
    assert.equal(emptyParsed.profile.name, '');
    assert.equal(emptyParsed.assistant.firstRunCompleted, null);
    assert.equal(needsFirstRunCompanion(emptyParsed), false);

    const legacyMd = `# Custom Header
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

    const parsed = parseUserMemory(legacyMd);
    assert.equal(parsed.profile.name, 'Art');
    assert.equal(parsed.profile.team, 'dev');
    assert.equal(parsed.profile.role, 'Fullstack Lead');
    assert.equal(parsed.assistant.firstRunCompleted, null);
    assert.equal(needsFirstRunCompanion(parsed), false);
    assert.deepEqual(parsed.activeProjects, ['STeP AI Harness v0.2', 'RSP North Mobile']);
    assert.deepEqual(parsed.frequentSkills, ['git-branching', 'deploy-checklist']);
  });

  await t.test('Case 5: completed First Run persists assistant identity and personality', async () => {
    const completed = generateUserMemoryTemplate({
      name: 'กล้อง',
      team: 'cc',
      assistantName: 'Friday',
      personality: 'concise',
      firstRunCompleted: true,
    });

    await saveUserMemory(tmpDir, completed);
    const loaded = await loadUserMemory(tmpDir);

    assert.equal(loaded.profile.name, 'กล้อง');
    assert.equal(loaded.profile.team, 'cc');
    assert.equal(loaded.assistant.name, 'Friday');
    assert.equal(loaded.assistant.personality, 'concise');
    assert.equal(loaded.assistant.firstRunCompleted, true);
    assert.equal(needsFirstRunCompanion(loaded), false);
  });

  await t.test('Case 6: personality presets are small, predictable and employee-friendly', () => {
    assert.equal(getPersonalityPreset('coworker').label, 'เพื่อนร่วมงาน');
    assert.equal(getPersonalityPreset('professional').label, 'มืออาชีพ');
    assert.equal(getPersonalityPreset('concise').label, 'กระชับ');
    assert.equal(getPersonalityPreset('unknown').label, 'เพื่อนร่วมงาน');
  });

  await t.test('Case 7: generated template contains private first-run state without secrets', () => {
    const content = generateUserMemoryTemplate();
    assert.ok(content.includes('## 2. ผู้ช่วยส่วนตัว (Personal Assistant)'));
    assert.ok(content.includes('**ชื่อผู้ช่วย (Assistant Name)**: STeP Mate'));
    assert.ok(content.includes('**First Run Completed**: false'));
    assert.ok(content.includes('ห้ามบันทึกรหัสผ่าน Token'));
  });
});

test('workspace with no .gitignore still gets USER.md and MEMORY.md excluded', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'step-gitignore-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  // A workspace that becomes a repository later must not pick these up: the
  // employee's own profile lives in them.
  assert.equal(await ensureGitignored(dir), true);
  const created = await readFile(join(dir, '.gitignore'), 'utf-8');
  assert.ok(created.includes('USER.md'));
  assert.ok(created.includes('MEMORY.md'));

  // Running again is a no-op rather than a duplicate append.
  assert.equal(await ensureGitignored(dir), false);
  assert.equal(await readFile(join(dir, '.gitignore'), 'utf-8'), created);
});

test('existing .gitignore keeps its content when the entries are added', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'step-gitignore-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, '.gitignore'), 'node_modules/\ndist/\n', 'utf-8');

  assert.equal(await ensureGitignored(dir), true);
  const content = await readFile(join(dir, '.gitignore'), 'utf-8');
  assert.ok(content.includes('node_modules/'));
  assert.ok(content.includes('dist/'));
  assert.ok(content.includes('USER.md'));
  assert.ok(content.includes('MEMORY.md'));
});
