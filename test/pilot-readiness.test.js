import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { queryStepRouter } from '../src/cli/commands/ask.js';
import {
  loadAndValidateManifests,
  validateManifestIntegrity,
} from '../src/modules/router/index.js';

test('Pilot 1-Month Readiness & Hardening Suite', async (t) => {
  await t.test('manifest graph is complete and all user-facing skills are routable', async () => {
    const integrity = await loadAndValidateManifests(resolve('manifest'));
    assert.equal(integrity.valid, true, integrity.errors.join('\n'));
    assert.equal(integrity.summary.teamsCount, 22);
    assert.equal(integrity.summary.skillsCount, 44);
    assert.equal(integrity.summary.routerSkillsCount, 43);
    assert.equal(integrity.summary.playbooksCount, 3);
  });

  await t.test('manifest validator catches unknown router skill and escalation target', () => {
    const result = validateManifestIntegrity({
      teamCodes: new Set(['ga', 'qs']),
      skills: {
        'known-skill': { owner: 'ga', process: ['p1'], references: { mandatory: [] } },
      },
      processes: { p1: {} },
      documents: {},
      authorities: { approval: {} },
      routerSkills: [
        {
          name: 'unknown-router-skill',
          processId: 'p1',
          primaryTeams: ['ga'],
          consumerTeams: ['qs'],
          authorities: [],
          escalationTargets: ['missing-skill'],
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('not registered')));
    assert.ok(result.errors.some((e) => e.includes('unknown Skill')));
  });

  await t.test('browser form assistant supports remembered login without plaintext secrets', async () => {
    const browserSkill = await readFile('skills/common/browser-form-assistant/SKILL.md', 'utf-8');
    const browserRule = await readFile('rules/browser-credential-safety.md', 'utf-8');
    const envExample = await readFile('.env.example', 'utf-8');
    const gitignore = await readFile('.gitignore', 'utf-8');

    assert.ok(browserSkill.includes('STEP_BROWSER_CREDENTIAL_REF'));
    assert.ok(browserSkill.includes('ผู้ใช้กรอก username/password เอง'));
    assert.ok(browserSkill.includes('Human Confirmation Gate'));
    assert.ok(browserRule.includes('Never store a plaintext password'));
    assert.ok(browserRule.includes('credential store'));
    assert.ok(browserRule.includes('operating system/browser'));
    assert.ok(envExample.includes('STEP_BROWSER_CREDENTIAL_REF='));
    assert.ok(!/^\s*STEP_BROWSER_PASSWORD\s*=/mi.test(envExample));
    assert.ok(!/^\s*PASSWORD\s*=/mi.test(envExample));
    assert.ok(gitignore.includes('.env'));
    assert.ok(gitignore.includes('.step-ai/'));
  });

  await t.test('remembered browser login never removes submit confirmation gate', async () => {
    const draft = await queryStepRouter('ช่วยกรอกแบบฟอร์มขอใช้ห้องประชุม ถ้ามี login session เดิมให้ใช้ต่อได้', { team: 'ga' });
    assert.equal(draft.selectedSkill?.name, 'browser-form-assistant');
    assert.equal(draft.scopeResult.status, 'ALLOW');

    const submit = await queryStepRouter('ใช้ login session เดิมแล้วกดส่งแบบฟอร์มจองห้องประชุมให้เลย', { team: 'ga' });
    assert.equal(submit.selectedSkill?.name, 'browser-form-assistant');
    assert.equal(submit.scopeResult.status, 'ESCALATE');
    assert.equal(submit.scopeResult.inScope, false);
  });

  await t.test('image prompt skill enforces a capability floor for context and references', async () => {
    const imageSkill = await readFile('skills/creative/step-image-prompt/SKILL.md', 'utf-8');
    assert.ok(imageSkill.includes('GPT-Image-2-class หรือเทียบเท่า'));
    assert.ok(imageSkill.includes('GPT-Image-2.5-class'));
    assert.ok(imageSkill.includes('reference image'));
    assert.ok(imageSkill.includes('Capability Gate'));
    assert.ok(imageSkill.includes('ห้ามใช้ Reference-Led mode เสมือนว่าโมเดลเห็นภาพ'));
  });

  await t.test('image generation routing remains stable after capability hardening', async () => {
    const result = await queryStepRouter('ขอ prompt สร้างภาพจาก reference นี้ ให้รักษา composition แล้วปรับเป็น STeP brand', { team: 'cc' });
    assert.equal(result.selectedSkill?.name, 'step-image-prompt');
    assert.equal(result.scopeResult.status, 'ALLOW');
  });

  await t.test('brand usage is allowed but explicit CI change is blocked', async () => {
    const normal = await queryStepRouter('ขอ prompt สร้างภาพจาก reference นี้ ให้ใช้ STeP brand และรักษา composition', { team: 'cc' });
    assert.equal(normal.selectedSkill?.name, 'step-image-prompt');
    assert.equal(normal.scopeResult.status, 'ALLOW');

    const change = await queryStepRouter('ช่วยทำ prompt แล้วเปลี่ยนโลโก้ STeP กับแก้ CI ใหม่ให้เลย', { team: 'cc' });
    assert.equal(change.selectedSkill?.name, 'step-image-prompt');
    assert.equal(change.scopeResult.status, 'BLOCK');
    assert.equal(change.scopeResult.authority, 'brand-alteration');
  });

  await t.test('TOR vendor selection is a procurement human authority, not a dangling skill', async () => {
    const result = await queryStepRouter('ตรวจ TOR นี้แล้วช่วยเลือกบริษัทผู้ชนะและให้คะแนนผู้ยื่นข้อเสนอให้เลย', { team: 'afp' });
    assert.equal(result.selectedSkill?.name, 'tor-review');
    assert.equal(result.scopeResult.status, 'BLOCK');
    assert.equal(result.scopeResult.targetRole, 'procurement-committee');
    assert.equal(result.scopeResult.authority, 'procurement-approval');
  });

  await t.test('Pilot package has a valid version and bundles required local-safety templates', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
    const buildScript = await readFile('scripts/build_pilot_bundle.py', 'utf-8');
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
    assert.ok(pkg.files.includes('.env.example'));
    assert.ok(pkg.files.includes('MAC-START-HERE.txt'));
    assert.ok(buildScript.includes('".env.example"'));
    assert.ok(buildScript.includes('"MAC-START-HERE.txt"'));
  });
});
