import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { queryStepRouter } from '../src/cli/commands/ask.js';
import {
  loadAndValidateManifests,
  validateManifestIntegrity,
} from '../src/modules/router/index.js';
import {
  extractOrganizationClusters,
  extractRouterSkills,
  validateOrganizationClusters,
} from '../src/modules/router/manifest-validator.js';

test('Pilot 1-Month Readiness & Hardening Suite', async (t) => {
  await t.test('manifest graph is complete and all user-facing skills are routable', async () => {
    const integrity = await loadAndValidateManifests(resolve('manifest'));
    assert.equal(integrity.valid, true, integrity.errors.join('\n'));
    assert.equal(integrity.summary.teamsCount, 22);
    assert.equal(integrity.summary.skillsCount, 46);
    assert.equal(integrity.summary.routerSkillsCount, 45);
    assert.equal(integrity.summary.clustersCount, 5);
    assert.equal(integrity.summary.playbooksCount, 4);
  });

  await t.test('every router entry sits in a cluster teams.yaml declares', async () => {
    const [teamsText, routerText] = await Promise.all([
      readFile('manifest/teams.yaml', 'utf-8'),
      readFile('manifest/router-index.yaml', 'utf-8'),
    ]);
    const clusters = new Set(
      [...teamsText.matchAll(/^ {2}- id:\s*([a-z0-9_-]+)/gm)].map((m) => m[1])
    );
    const routerSkills = extractRouterSkills(routerText);

    assert.equal(routerSkills.length, 45);
    for (const skill of routerSkills) {
      assert.ok(skill.cluster, `${skill.name} has no cluster`);
      assert.ok(
        clusters.has(skill.cluster),
        `${skill.name} uses undeclared cluster '${skill.cluster}'`
      );
    }
  });

  await t.test('organization.yaml describes the same clusters teams.yaml routes with', async () => {
    const [orgText, teamsText] = await Promise.all([
      readFile('manifest/organization.yaml', 'utf-8'),
      readFile('manifest/teams.yaml', 'utf-8'),
    ]);

    const teamClusters = {};
    let current = '';
    for (const line of teamsText.split(/\r?\n/)) {
      const clusterMatch = line.match(/^ {2}- id:\s*([a-z0-9_-]+)/);
      if (clusterMatch) {
        current = clusterMatch[1];
        teamClusters[current] = [];
        continue;
      }
      const teamMatch = line.match(/^ {6}- id:\s*([a-z0-9_-]+)/);
      if (teamMatch && current) teamClusters[current].push(teamMatch[1]);
    }

    const result = validateOrganizationClusters(extractOrganizationClusters(orgText), teamClusters);
    assert.equal(result.valid, true, result.errors.join('\n'));
  });

  await t.test('organization cluster parser reads only the clusters block', () => {
    const clusters = extractOrganizationClusters(
      [
        'organization:',
        '  id: step-cmu',
        'publicProfile:',
        '  establishment:',
        '    foundingFaculties:',
        '      - "คณะวิศวกรรมศาสตร์"',
        '  contact:',
        '    phone: "0 5394 8678"',
        'clusters:',
        '  governance-operations:',
        '    teams: [ga, qs]',
        'internalSystems:',
        '  step-mis:',
        '    access: login-required',
      ].join('\n')
    );
    assert.deepEqual(Object.keys(clusters), ['governance-operations']);
    assert.deepEqual(clusters['governance-operations'], ['ga', 'qs']);
  });

  await t.test('organization validator catches a renamed or re-membered cluster', () => {
    const teamClusters = {
      'governance-operations': ['ga', 'qs'],
      'facilities-labs': ['ifu', 'les'],
    };

    const renamed = validateOrganizationClusters(
      { 'governance-operations': ['ga', 'qs'], 'infrastructure-labs': ['ifu', 'les'] },
      teamClusters
    );
    assert.equal(renamed.valid, false);
    assert.ok(renamed.errors.some((e) => e.includes("cluster 'infrastructure-labs' is not declared")));
    assert.ok(renamed.errors.some((e) => e.includes("cluster 'facilities-labs' from teams.yaml is missing")));

    const moved = validateOrganizationClusters(
      { 'governance-operations': ['ga'], 'facilities-labs': ['ifu', 'les', 'qs'] },
      teamClusters
    );
    assert.equal(moved.valid, false);
    assert.ok(moved.errors.some((e) => e.includes('do not match teams.yaml')));
  });

  await t.test('manifest validator catches an undeclared router cluster', () => {
    const result = validateManifestIntegrity({
      teamCodes: new Set(['ga']),
      clusterIds: new Set(['governance-operations']),
      skills: {
        'known-skill': { owner: 'ga', process: ['p1'], references: { mandatory: [] } },
      },
      processes: { p1: {} },
      documents: {},
      authorities: {},
      routerSkills: [
        {
          name: 'known-skill',
          cluster: 'governance-quality',
          processId: 'p1',
          primaryTeams: ['ga'],
          consumerTeams: [],
          authorities: [],
          escalationTargets: [],
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("unknown cluster 'governance-quality'")));
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
    assert.ok(imageSkill.includes('Reference-Led / Edit'));
    assert.ok(imageSkill.includes('เครื่องมือปลายทางรับ image input ได้จริง'));
    assert.ok(imageSkill.includes('ห้ามทำเหมือนระบบเห็นภาพที่ไม่ได้รับมา'));
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

    // Supplied CI evidence replaces the missing-source placeholder, while
    // scoped colour confirmation must not certify the entire controlled edition.
    const ciReference = await readFile('skills/common/step-brand/references/ci-manual-digest.md', 'utf-8');
    assert.ok(brandVisualContext.includes('SOURCE-BACKED DIGEST'));
    assert.ok(brandVisualContext.includes('step-brand-ci-guideline'));
    assert.ok(brandVisualContext.includes('ci-manual-digest.md'));
    assert.ok(brandVisualContext.includes('ห้ามสร้างหรือเดาจากความจำ'));
    assert.ok(brandVisualContext.includes('AI ไม่สร้าง ไม่วาด และไม่เลียนแบบโลโก้'));
    assert.ok(imageSkill.includes('references/brand-visual-context.md'));
    assert.ok(ciReference.includes('height of 8 mm'));
    assert.ok(ciReference.includes('y = X × 10'));
    assert.ok(ciReference.includes('255, 199, 199'), 'retain the inconsistent printed RGB as source evidence');
    assert.ok(ciReference.includes('CMYK as a source transcription only'));

    const documents = await readFile('manifest/documents.yaml', 'utf-8');
    const ciEntry = documents.split(/^  (?=[a-z0-9-]+:\s*$)/m).find((block) => block.startsWith('step-brand-ci-guideline:'));
    assert.ok(ciEntry, 'the supplied digest must stay registered');
    assert.match(ciEntry, /status:\s*provided-unverified/);
    assert.match(ciEntry, /verification:\s*pending-cc-confirmation/);
    assert.match(ciEntry, /digitalPaletteVerification:\s*user-confirmed/);

    // Pattern library must stay a STeP-owned, offline reference.
    const patterns = await readFile('skills/creative/step-image-prompt/references/prompt-patterns.md', 'utf-8');
    assert.ok(patterns.includes('ไม่ใช่ prompt สำเร็จรูปให้คัดลอกทั้งก้อน'));
    assert.ok(patterns.includes('ไม่ดึงข้อมูลหรือภาพตัวอย่างจากบริการภายนอกตอนใช้งาน'));
    assert.ok(patterns.includes('ห้ามให้โมเดลสร้างตัวเลข กราฟ หรือเปอร์เซ็นต์'));
    assert.ok(imageSkill.includes('references/prompt-patterns.md'));

    // Model names are a hint table, never the capability gate.
    const modelFamilies = await readFile('skills/creative/step-image-prompt/references/model-families.md', 'utf-8');
    assert.ok(modelFamilies.includes('ไม่ใช่ Capability Gate'));
    assert.ok(modelFamilies.includes('ห้าม hard-code ชื่อรุ่นเป็นเงื่อนไขในการทำงาน'));
    assert.ok(imageSkill.includes('ห้าม hard-code ชื่อรุ่นโมเดลเป็น Capability Gate'));
  });

  await t.test('step-image-prompt follows Standard v2 structure and meeting summary stays QMS-independent', async () => {
    const imageSkill = await readFile('skills/creative/step-image-prompt/SKILL.md', 'utf-8');
    const skillsManifest = await readFile('manifest/skills.yaml', 'utf-8');
    const routerIndex = await readFile('manifest/router-index.yaml', 'utf-8');

    assert.ok(imageSkill.includes('standardVersion: 2'));
    for (const heading of [
      '## Purpose',
      '## เมื่อควรใช้',
      '## Inputs',
      '## Source',
      '## Workflow',
      '## Output',
      '## Authority',
      '## Handoff',
      '## Guardrails',
    ]) {
      assert.ok(imageSkill.includes(heading), `step-image-prompt missing ${heading}`);
    }
    assert.ok(imageSkill.includes('references/visual-direction-vocabulary.md'));

    const imageRouterBlock = routerIndex.slice(
      routerIndex.indexOf('  - name: step-image-prompt'),
      routerIndex.indexOf('\n  - name: receipt-audit')
    );
    assert.ok(imageRouterBlock.includes('สร้าง Prompt Spec'));
    assert.ok(!imageRouterBlock.includes('#F9AE3B'));
    assert.ok(!imageRouterBlock.includes('Brand Strength แบบ STRONG / BALANCED / LIGHT'));

    const meetingBlock = skillsManifest.slice(
      skillsManifest.indexOf('  meeting-summary:'),
      skillsManifest.indexOf('\n  browser-form-assistant:')
    );
    assert.ok(meetingBlock.includes('mandatory: [human-approval-rule]'));
    assert.ok(meetingBlock.includes('optional: []'));
    assert.ok(!meetingBlock.includes('qms-quality-manual'));
    assert.ok(!meetingBlock.includes('qms-management-review'));
    assert.ok(!meetingBlock.includes('step-quality-policy-v2'));
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
