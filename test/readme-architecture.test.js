import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function countMatches(text, regex) {
  return (text.match(regex) || []).length;
}

function localMarkdownLinks(markdown) {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1].trim())
    .filter((target) => !target.startsWith('http://') && !target.startsWith('https://'))
    .map((target) => target.split('#')[0])
    .filter(Boolean);
}

test('employee documentation is aligned and links resolve', async (t) => {
  const [
    readme,
    startHere,
    employeeGuide,
    architecture,
    packageText,
    teams,
    skills,
    playbooks,
    actions,
    provenance,
    documents,
  ] = await Promise.all([
    readFile(resolve(repoRoot, 'README.md'), 'utf-8'),
    readFile(resolve(repoRoot, 'START-HERE.md'), 'utf-8'),
    readFile(resolve(repoRoot, 'docs/employee-guide.md'), 'utf-8'),
    readFile(resolve(repoRoot, 'docs/architecture.md'), 'utf-8'),
    readFile(resolve(repoRoot, 'package.json'), 'utf-8'),
    readFile(resolve(repoRoot, 'manifest/teams.yaml'), 'utf-8'),
    readFile(resolve(repoRoot, 'manifest/skills.yaml'), 'utf-8'),
    readFile(resolve(repoRoot, 'manifest/playbooks.yaml'), 'utf-8'),
    readFile(resolve(repoRoot, 'manifest/actions.yaml'), 'utf-8'),
    readFile(resolve(repoRoot, 'manifest/provenance.yaml'), 'utf-8'),
    readFile(resolve(repoRoot, 'manifest/documents.yaml'), 'utf-8'),
  ]);

  const pkg = JSON.parse(packageText);
  const teamCount = countMatches(teams, /^      - id:/gm);
  const clusterCount = countMatches(teams, /^  - id:/gm);
  const skillCount = countMatches(skills, /^  [a-z0-9_-]+:\s*$/gm);
  const playbookCount = countMatches(playbooks, /^  - id:/gm);
  const actionCount = countMatches(actions, /^  [a-z0-9_-]+:\s*$/gm);
  const provenanceCount = countMatches(provenance, /^  - id:/gm);

  await t.test('README has the employee-first onboarding contract', () => {
    assert.ok(readme.includes('# STeP AI'));
    assert.ok(readme.includes('คู่มือเริ่มต้นสำหรับพนักงาน'));
    assert.ok(readme.includes(`**v${pkg.version}**`));
    assert.ok(readme.includes(`| ทีม | **${teamCount} ทีม** |`));
    assert.ok(readme.includes(`| กลุ่ม routing | **${clusterCount} กลุ่ม** |`));
    assert.ok(readme.includes(`| Skills | **${skillCount} Skills** |`));
    assert.ok(readme.includes(`| Playbooks | **${playbookCount} Playbooks** |`));
    assert.ok(readme.includes(`| Actions | **${actionCount} Actions** |`));
    assert.ok(readme.includes('ตารางนี้นับจาก source ไม่ใช่รายการรับรองของ ZIP ที่พนักงานได้รับ'));
    assert.ok(readme.includes('[Pilot Operations](docs/pilot-operations.md)'));
    assert.ok(readme.includes('Shared Drive หรือช่องทางภายใน'));
    assert.ok(readme.includes('อย่าใช้ไฟล์จาก Public GitHub Release'));
    assert.ok(readme.includes('Repository visibility'));
    assert.ok(readme.includes('repository นี้มีสถานะ **Public**'));
    assert.ok(readme.includes('ชุดติดตั้งที่แจกพนักงานมาจาก **release tag เท่านั้น** ไม่ใช่จาก `main`'));
    assert.ok(readme.includes('Install-STeP-AI.bat'));
    assert.ok(readme.includes('Install-STeP-AI.command'));
    assert.ok(readme.includes('เริ่มใช้งาน STeP AI'));
  });

  await t.test('README contains the six employee acceptance outcomes', () => {
    for (const phrase of [
      'รู้ว่าจะดาวน์โหลดไฟล์จากที่ไหน',
      'ติดตั้งได้บน Windows หรือ macOS',
      'เลือกทีมและเปิดโฟลเดอร์ด้วย AI ที่องค์กรอนุมัติ',
      'พิมพ์งานแรกเป็นภาษาไทยได้',
      'รู้ว่าเมื่อใดต้องหยุดให้มนุษย์ยืนยัน',
      'รู้ว่าจะส่งปัญหาผ่าน [STeP AI Support](SUPPORT.md) อย่างไร',
    ]) {
      assert.ok(readme.includes(phrase), phrase);
    }
  });

  await t.test('README contains the six standard employee examples', () => {
    for (const phrase of [
      'ตรวจเอกสารก่อนส่ง',
      'สรุปประชุมและแยกสิ่งที่ต้องทำต่อ',
      'ร่างหนังสือหรือข้อความสื่อสาร',
      'ตรวจหรือร่าง TOR และงานจัดซื้อ',
      'วางแผนโครงการและทำ Timeline/Gantt',
      'ตรวจข้อมูลส่วนบุคคลและปิดบังก่อนส่ง',
    ]) {
      assert.ok(readme.includes(phrase), phrase);
    }
  });

  await t.test('README states the three privacy rules and support path', () => {
    assert.ok(readme.includes('ใช้เฉพาะโปรแกรม AI และช่องทางที่องค์กรอนุมัติ'));
    assert.ok(readme.includes('ห้ามใส่รหัสผ่าน, token, cookie, MFA หรือ secret'));
    assert.ok(readme.includes('ถ้าระบบแจ้งข้อมูลความเสี่ยงสูง'));
    assert.ok(readme.includes('ถ่ายภาพหน้าจอพร้อมข้อความผิดพลาด'));
    assert.ok(readme.includes('Feedback-STeP-AI.bat'));
    assert.ok(readme.includes('REQUEST_NEW_TASK.md'));
    assert.ok(readme.includes('[STeP AI Support](SUPPORT.md)'));
  });

  await t.test('documentation layers have distinct roles', () => {
    assert.ok(startHere.includes('ใบเริ่มต้นสั้นสำหรับ First Run'));
    assert.ok(startHere.includes('[README.md](README.md)'));
    assert.ok(employeeGuide.includes('คู่มือฉบับเต็มสำหรับพนักงาน'));
    assert.ok(employeeGuide.includes('สำหรับผู้ดูแลระบบ'));
    assert.ok(employeeGuide.includes('[STeP AI Support](../SUPPORT.md)'));
    assert.ok(!employeeGuide.includes('pip install hermes-agent'));
  });

  await t.test('employee-facing docs do not depend on an unassigned AI Champion', async () => {
    const surfaces = [
      ['README.md', readme],
      ['START-HERE.md', startHere],
      ['docs/employee-guide.md', employeeGuide],
      ['SUPPORT.md', await readFile(resolve(repoRoot, 'SUPPORT.md'), 'utf-8')],
      ['MAC-START-HERE.txt', await readFile(resolve(repoRoot, 'MAC-START-HERE.txt'), 'utf-8')],
      ['install/install-windows.ps1', await readFile(resolve(repoRoot, 'install/install-windows.ps1'), 'utf-8')],
      ['install/install-macos.sh', await readFile(resolve(repoRoot, 'install/install-macos.sh'), 'utf-8')],
      ['install/feedback-windows.ps1', await readFile(resolve(repoRoot, 'install/feedback-windows.ps1'), 'utf-8')],
      ['install/feedback-macos.sh', await readFile(resolve(repoRoot, 'install/feedback-macos.sh'), 'utf-8')],
      ['src/cli/commands/feedback.js', await readFile(resolve(repoRoot, 'src/cli/commands/feedback.js'), 'utf-8')],
    ];

    for (const [name, text] of surfaces) {
      assert.ok(!text.includes('AI Champion'), `${name} still depends on AI Champion`);
      assert.ok(!text.includes('CHAMPION & ADMIN MODE'), `${name} still exposes Champion admin wording`);
    }
  });

  await t.test('all README local links resolve', async () => {
    for (const link of localMarkdownLinks(readme)) {
      await access(resolve(repoRoot, link));
    }
  });

  await t.test('architecture and controlled-source gaps remain explicit', () => {
    assert.ok(architecture.includes('Organization Model 6D'));
    assert.ok(architecture.includes('WHO / WHERE / WHAT / WHY / HOW / AUTHORITY'));
    assert.ok(architecture.includes('Cross-cutting Safeguards'));
    assert.ok(architecture.includes('Privacy Gate'));
    assert.ok(architecture.includes('Source & Provenance'));
    assert.ok(architecture.includes('Human Authority'));
    assert.ok(documents.includes('qms-quality-manual:'));
    assert.ok(documents.includes('qms-master-document-list:'));
  });
});
