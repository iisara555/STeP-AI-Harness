import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LESSONS_HEADING, evalCase, proposalMarkdown, skillPatch } from '../electron/skill-proposal';

const lesson = {
  name: 'ห้ามเดาเลขภาษี',
  kind: 'procedure' as const,
  trigger: 'ใบเสร็จ,receipt',
  text: '1. ระบุว่าไม่พบ\n2. ห้ามเดาจากชื่อร้าน',
};
const at = '2026-10-05T00:00:00.000Z';

test('the SKILL.md patch applies with git, with or without a final newline, and adds the lessons section once', async () => {
  for (const original of ['# Skill\n\nSteps\n', '# Skill\n\nSteps', 'x\n', `# Skill\n${LESSONS_HEADING}\n\n### Earlier\n\nstep\n`]) {
    const dir = await mkdtemp(join(tmpdir(), 'step-patch-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    await mkdir(join(dir, 'skills/x'), { recursive: true });
    await writeFile(join(dir, 'skills/x/SKILL.md'), original);
    const patch = skillPatch('skills/x/SKILL.md', original, lesson, at);
    const applied = spawnSync('git', ['apply', '-'], { cwd: dir, input: patch });
    assert.equal(applied.status, 0, String(applied.stderr) + '\n' + patch);
    const after = await readFile(join(dir, 'skills/x/SKILL.md'), 'utf8');
    assert.equal(after.split(LESSONS_HEADING).length, 2, 'one lessons section');
    assert.match(after, /### ห้ามเดาเลขภาษี \(ใช้เมื่อคำขอเกี่ยวกับ: ใบเสร็จ,receipt\)\n\n1\. ระบุว่าไม่พบ\n2\. ห้ามเดาจากชื่อร้าน\n/);
    assert.ok(after.endsWith('รอผู้ดูแล Skill ตรวจ_\n'));
  }
});

test('the proposal file carries the lesson, evidence, patch and a test case the maintainer must finish', () => {
  const skill = {
    name: 'receipt-check',
    title: 'ตรวจใบเสร็จ',
    path: 'skills/common/receipt-check/SKILL.md',
    owner: 'afp',
    version: '1.0.0',
  };
  const markdown = proposalMarkdown({
    skill,
    skillText: '# Skill\n',
    lesson,
    lessonId: 'abcdef12-0000',
    revision: 2,
    evidence: 'ผู้ใช้แก้: ห้ามเดา',
    team: 'ga',
    at,
  });
  assert.match(markdown, /- Skill: `receipt-check` \(skills\/common\/receipt-check\/SKILL\.md\)/);
  assert.match(markdown, /ทีมเจ้าของ Skill: afp/);
  assert.match(markdown, /```diff\n--- a\/skills\/common\/receipt-check\/SKILL\.md/);
  const json = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(markdown)![1]);
  assert.deepEqual(json, evalCase(skill, lesson, 'ga', 'abcdef12-0000'));
  assert.deepEqual(json.outputAssertions, ['ระบุว่าไม่พบ', 'ห้ามเดาจากชื่อร้าน']);
  assert.match(json.prompt, /TODO/);
});

test('the maintainer script refuses the TODO prompt, then applies the patch and the case', async t => {
  const repo = resolve('..');
  // A full checkout of the repository (the validator reads all of it), with this version of the script.
  const copy = join(await mkdtemp(join(tmpdir(), 'step-apply-')), 'repo');
  execFileSync('git', ['worktree', 'add', '-q', '--detach', copy, 'HEAD'], { cwd: repo });
  t.after(() => execFileSync('git', ['worktree', 'remove', '--force', copy], { cwd: repo }));
  await cp(join(repo, 'scripts/apply-skill-proposal.mjs'), join(copy, 'scripts/apply-skill-proposal.mjs'));
  const skillPath = 'skills/pm/meeting-summary/SKILL.md';
  const skill = { name: 'meeting-summary', title: 'สรุปประชุม', path: skillPath, owner: 'pm' };
  const markdown = proposalMarkdown({
    skill,
    skillText: await readFile(join(copy, skillPath), 'utf8'),
    lesson: { name: 'ผู้รับผิดชอบที่ไม่ระบุ', kind: 'preference', trigger: '', text: 'ถ้าบันทึกไม่ระบุผู้รับผิดชอบ ให้เขียนว่ารอยืนยัน' },
    lessonId: '12345678-aaaa',
    revision: 1,
    evidence: 'ผู้ใช้แก้',
    team: 'pm',
    at,
  });
  // A Windows checkout (core.autocrlf) has CRLF line endings; the proposal, made from LF text, still applies.
  const crlf = (await readFile(join(copy, skillPath), 'utf8')).replace(/\r?\n/g, '\r\n');
  await writeFile(join(copy, skillPath), crlf);
  const file = join(copy, 'proposal.md');
  await writeFile(file, markdown);
  const run = () => spawnSync(process.execPath, ['scripts/apply-skill-proposal.mjs', file], { cwd: copy, encoding: 'utf8' });
  const refused = run();
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /replace the TODO/);
  await writeFile(file, markdown.replace(/TODO: [^"]*/, 'สรุปประชุมนี้ให้หน่อย ในบันทึกไม่ระบุว่าใครรับผิดชอบงานไหน'));
  const applied = run();
  assert.equal(applied.status, 0, applied.stderr + applied.stdout);
  const after = await readFile(join(copy, skillPath), 'utf8');
  assert.match(after, /ถ้าบันทึกไม่ระบุผู้รับผิดชอบ ให้เขียนว่ารอยืนยัน\r\n/);
  assert.ok(after.startsWith(crlf.slice(0, -2)), 'the Skill is unchanged above the lesson');
  assert.equal(after.replace(/\r\n/g, '').includes('\n'), false, 'the file keeps CRLF throughout');
  const evals = JSON.parse(await readFile(join(copy, 'evals/skills/meeting-summary.json'), 'utf8'));
  assert.ok(evals.cases.some((c: any) => c.id === 'lesson-12345678' && c.dimension === 'regression'));
  // The same proposal again: the patch no longer applies.
  const again = run();
  assert.notEqual(again.status, 0);
});
