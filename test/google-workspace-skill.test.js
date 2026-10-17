import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { checkContract } from '../skills/common/google-workspace/scripts/check-contract.mjs';
import { queryStepRouter } from '../src/modules/router/service.js';
import { loadSkillCatalog } from '../src/modules/skills/catalog.js';

test('plain account questions route across teams and remain discoverable with automatic routing disabled', async () => {
  const questions = ['วันนี้มีนัดอะไร', 'พรุ่งนี้มีประชุมไหม', 'มีงานอะไรค้างบ้าง', 'ช่วยหาอีเมลเรื่องใบเสนอราคา'];
  for (const team of ['', 'ga', 'cc', 'afp', 'mi', 'qs', 'piti', 'sit', 'crm']) {
    for (const prompt of questions) {
      const routed = await queryStepRouter(prompt, { team, cluster: '' });
      assert.equal(routed.routingMode, 'SKILL', `${team}: ${prompt}`);
      assert.equal(routed.routingContract.skill, 'google-workspace', `${team}: ${prompt}`);
    }
  }
  for (const prompt of questions) {
    const manual = await queryStepRouter(prompt, { team: 'cc', autoRoute: false });
    assert.equal(manual.routingMode, 'GENERAL');
    assert.equal(manual.candidateSkills[0].skill.name, 'google-workspace');
  }
  const entry = (await loadSkillCatalog()).find(skill => skill.name === 'google-workspace');
  assert.equal(entry.status, 'routed');
  assert.match(entry.description.slice(0, 140), /วันนี้มีนัดอะไร/);
  assert.ok(entry.triggers.includes('อีเมล'));
});

test('organization meetings, procedures, pasted mail and look-alike words do not route to the account Skill', async () => {
  for (const prompt of [
    'อุทยานฯ มีประชุมอะไรบ้างในแต่ละปี',
    'STeP มีประชุมคณะกรรมการบ้างไหม',
    'มีงานที่ต้องทำก่อนส่งเบิก AFP อะไรบ้าง',
    'จัดอบรมผู้ประกอบการ มีงานที่ต้องทำอะไรบ้าง',
    'ช่วยหาเมล็ดกาแฟที่ดีที่สุด',
    'ช่วยดูเมลเบิร์นมีอะไรเที่ยว',
    'สรุปอีเมลที่ลูกค้าส่งมา ให้หน่อย ข้อความคือ สวัสดีครับ ขอใบเสนอราคาภายในวันศุกร์',
  ]) {
    const routed = await queryStepRouter(prompt, { team: 'ga', cluster: '' });
    assert.notEqual(routed.routingContract?.skill, 'google-workspace', prompt);
    assert.ok(!routed.candidateSkills?.some(c => c.skill?.name === 'google-workspace'), prompt);
  }
  for (const prompt of ['มีเมลใหม่ไหม', 'เพิ่มงาน ส่งรายงานวันศุกร์', 'หาอีเมลจาก STeP เรื่องประชุม']) {
    const routed = await queryStepRouter(prompt, { team: 'ga', cluster: '' });
    assert.equal(routed.routingContract?.skill, 'google-workspace', prompt);
  }
});

test('native Workspace reference/checker covers the shipped operation catalog', async () => {
  assert.deepEqual(await checkContract(resolve('.')), {
    status: 'checked-offline', operations: 26, liveGoogleVerified: false,
  });
});

test('offline contract checker rejects a reference that promises an unsupported operation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-google-contract-'));
  try {
    const folder = 'skills/common/google-workspace/references';
    await Promise.all([mkdir(join(root, folder), { recursive: true }), mkdir(join(root, 'desktop/electron'), { recursive: true })]);
    const files = ['desktop/electron/google-operations.ts', `${folder}/tool-contract.md`, `${folder}/tool-contract.json`];
    for (const file of files) await writeFile(join(root, file), await readFile(file));
    const path = join(root, folder, 'tool-contract.md');
    await writeFile(path, (await readFile(path, 'utf8')) + '\n| `drive.share` | fileId | email | unsupported |\n');
    await assert.rejects(checkContract(root), /Reference operations differ/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
