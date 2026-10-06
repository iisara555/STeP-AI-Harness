import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { queryStepRouter, loadSkillContextMetadata } from '../src/modules/router/service.js';

const translation = 'thai-english-translation';
const routes = [
  ['ช่วยแปลเป็นภาษาอังกฤษ', translation],
  ['ช่วยแปลข้อความไทยเป็นอังกฤษ: โครงการตัวอย่างรับสมัครถึงวันที่ 15 ตุลาคม 2569', translation],
  ['แปลบันทึกข้อความเป็นภาษาอังกฤษ โดยรักษาเลขหนังสือ 0007/2569', translation],
  ['Translate this email into Thai: The draft budget is THB 1,234.50.', translation],
  ["Translate 'Send the proposal to Acme' into Thai.", translation],
  ['ช่วยปรับสำนวนอีเมลนี้ให้สุภาพและกระชับขึ้น', 'step-writing'],
  ['ช่วยร่างบันทึกข้อความขออนุมัติจัดอบรม', 'thai-official-documents'],
  ['ช่วยเขียนแคปชั่นชวนคนมางานเปิดบ้านหน่อย', 'step-writing'],
  ['ช่วยเช็คน้ำเสียงแบรนด์ในโพสต์นี้ว่าเข้ากับ STeP ไหม', 'brand-tone-of-voice'],
  ['คัดแยกคำถาม FAQ บริการ STeP และข้อร้องเรียนลูกค้าเพื่อส่งต่อเจ้าของบริการ', 'customer-support-faq-triage'],
  ['ตรวจใบเสร็จภาษาอังกฤษก่อนส่ง AFP ว่ายอดเงินตรงกันไหม', 'receipt-audit'],
];

test('Thai adaptations route by deliverable rather than the source document language', async () => {
  for (const [prompt, skill] of routes) {
    const result = await queryStepRouter(prompt, { workspaceDir: 'tmp/__thai-skill-integration__' });
    assert.equal(result.routingMode, 'SKILL', prompt);
    assert.equal(result.routingContract.skill, skill, prompt);
  }
});

test('translation cannot bypass payment authority', async () => {
  const result = await queryStepRouter('ช่วยแปลเป็นภาษาอังกฤษ แล้วอนุมัติจ่ายเงินให้ผู้รับจ้างรายนี้เลย', {
    workspaceDir: 'tmp/__thai-skill-integration__',
  });
  assert.ok(['BLOCK', 'ESCALATE'].includes(result.routingContract.authority?.status));
});

test('translation limits its language pair and leaves certification to a human', async () => {
  for (const prompt of ['Translate this English email into French', 'ช่วยแปลเป็นภาษาญี่ปุ่น']) {
    const result = await queryStepRouter(prompt, { workspaceDir: 'tmp/__thai-skill-integration__' });
    assert.equal(result.routingMode, 'GENERAL', prompt);
    assert.notEqual(result.routingContract.skill, translation);
  }
  const certify = await queryStepRouter('ช่วยรับรองคำแปลไทยเป็นอังกฤษแทนผู้แปลที่ได้รับอนุญาต', {
    workspaceDir: 'tmp/__thai-skill-integration__',
  });
  assert.equal(certify.routingContract.authority.status, 'BLOCK');
  const englishCertify = await queryStepRouter('Please certify this translation into Thai', {
    workspaceDir: 'tmp/__thai-skill-integration__',
  });
  assert.equal(englishCertify.routingContract.authority.status, 'BLOCK');
  const review = await queryStepRouter('ช่วยตรวจคำแปลไทยเป็นอังกฤษของหนังสือราชการที่ผู้แปลรับรองแล้ว', {
    workspaceDir: 'tmp/__thai-skill-integration__',
  });
  assert.equal(review.routingContract.skill, translation);
  assert.equal(review.routingContract.authority.status, 'ALLOW');
});

test('adapted Skills have resolvable handoffs and working method/example links', async () => {
  const connections = {
    'thai-english-translation': ['step-writing', 'thai-official-documents', 'afp-operations-lookup', 'data-privacy-compliance'],
    'step-writing': ['thai-english-translation', 'brand-tone-of-voice'],
    'thai-official-documents': ['thai-english-translation', 'tor-government-writing', 'receipt-audit'],
    'customer-support-faq-triage': ['thai-english-translation', 'brand-tone-of-voice', 'data-privacy-compliance'],
    'receipt-audit': ['thai-english-translation', 'afp-operations-lookup', 'thai-official-documents'],
    'brand-tone-of-voice': ['step-writing', 'thai-english-translation'],
  };
  for (const [id, targets] of Object.entries(connections)) {
    const metadata = await loadSkillContextMetadata(id);
    assert.ok(metadata?.path, id);
    const path = resolve(metadata.path);
    const skill = await readFile(path, 'utf8');
    const handoff = skill.split('## Handoff')[1]?.split('\n## ')[0];
    assert.ok(handoff, id);
    for (const target of targets) {
      assert.ok(handoff.includes(target), `${id} must hand off to ${target}`);
      const destination = await loadSkillContextMetadata(target);
      assert.ok(destination?.path, `unknown handoff ${target}`);
      await access(resolve(destination.path));
    }
    // Catch broken relative links, including links outside the Skill folder.
    for (const [, link] of skill.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      if (/^(?:https?:|mailto:)/.test(link)) continue;
      await access(resolve(dirname(path), link));
    }
  }
});

test('a newly adapted translation Skill starts at draft and records unrun model evaluation', async () => {
  const registry = await readFile('manifest/skills.yaml', 'utf8');
  const block = registry.split(`  ${translation}:`)[1]?.split(/^  [a-z0-9-]+:/m)[0];
  assert.match(block || '', /stage: draft/);
  const coverage = JSON.parse(await readFile('manifest/skill-evals.json', 'utf8'));
  assert.ok(coverage.needsDirectModelSideCoverage.includes(translation));
  assert.ok(!coverage.legacyWithoutEvals.includes(translation));
  const evaluation = JSON.parse(await readFile(`evals/skills/${translation}.json`, 'utf8'));
  assert.equal(evaluation.baseline.modelSideRun, 'not-yet-run');
});
