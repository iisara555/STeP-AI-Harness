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
    assert.equal(integrity.summary.skillsCount, 46);
    assert.equal(integrity.summary.routerSkillsCount, 45);
    assert.equal(integrity.summary.playbooksCount, 4);
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

  await t.test('image prompt skill uses syntax-family capability gate and Spec-first rendering', async () => {
    const imageSkill = await readFile('skills/creative/step-image-prompt/SKILL.md', 'utf-8');
    const promptSpec = await readFile('skills/creative/step-image-prompt/references/prompt-spec.md', 'utf-8');
    const brandVisualContext = await readFile('skills/creative/step-image-prompt/references/brand-visual-context.md', 'utf-8');

    assert.ok(imageSkill.includes('Capability Gate'));
    assert.ok(imageSkill.includes('references/prompt-spec.md'));
    assert.ok(imageSkill.includes('Build Prompt Spec → Confirm Family → Render'));
    assert.ok(imageSkill.includes('Prompt Spec เป็น source of truth'));
    assert.ok(imageSkill.includes('Family B'));
    assert.ok(imageSkill.includes('ratio handoff'));
    assert.ok(imageSkill.includes('Family D — Edit / inpaint'));
    assert.ok(imageSkill.includes('ห้ามใช้ Reference-Led mode เสมือนว่าโมเดลเห็นภาพ'));
    assert.ok(!imageSkill.includes('GPT-Image-2-class'));
    assert.ok(!imageSkill.includes('GPT-Image-2.5-class'));

    for (const family of [
      'Family A — Natural-language',
      'Family B — Tag + weight',
      'Family C — Parameter-flag',
      'Family D — Edit / inpaint',
    ]) {
      assert.ok(promptSpec.includes(family), `prompt-spec missing ${family}`);
    }

    for (const field of [
      'SUBJECT:',
      'ACTION:',
      'SETTING:',
      'SHOT:',
      'PLACEMENT:',
      'TEXT_SPACE:',
      'RATIO:',
      'LIGHT:',
      'MEDIUM:',
      'STYLE:',
      'PALETTE:',
      'MUST_KEEP:',
      'CHANGE_ONLY:',
      'EXCLUDE:',
    ]) {
      assert.ok(promptSpec.includes(field), `prompt-spec missing ${field}`);
    }

    assert.ok(promptSpec.includes('text, letters, typography, captions, signage lettering'));
    assert.ok(promptSpec.includes('logos, watermarks, brand marks'));
    assert.ok(promptSpec.includes('distorted hands, extra fingers, extra limbs'));
    assert.ok(promptSpec.includes('Ratio handoff'));
    assert.ok(promptSpec.includes('1344 × 768'));
    assert.ok(promptSpec.includes('แก้ Prompt Spec'));
    assert.ok(promptSpec.includes('เปลี่ยนเครื่องมือ'));
    assert.ok(!promptSpec.includes('GPT-Image-'));

    assert.ok(brandVisualContext.includes('Status:** NO-CONTROLLED-SOURCE'));
    assert.ok(brandVisualContext.includes('ไม่มี Controlled CI Guideline'));
    assert.ok(brandVisualContext.includes('ห้ามแต่งค่า hex'));
    assert.ok(imageSkill.includes('references/brand-visual-context.md'));
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
