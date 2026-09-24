import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getAvailableTeams,
  resolveTeamFiles,
  resolveTeamSkillPaths,
} from '../src/modules/role-resolver.js';

test('team Skill scoping follows Router eligibility rather than namespace folders', async (t) => {
  const teams = await getAvailableTeams();
  const registry = await readFile('manifest/skills.yaml', 'utf-8');
  const organizationSkills = (registry.match(/^    path:\s*skills\/[^\n]+\/SKILL\.md\s*$/gm) || []).length;

  const counts = [];
  for (const team of teams) {
    const resolved = await resolveTeamFiles(team.id);
    const count = new Set(
      resolved.files
        .filter((file) => file.type === 'skill' && file.relativePath.endsWith('/SKILL.md'))
        .map((file) => file.relativePath)
    ).size;
    counts.push({ team: team.id, count });

    assert.ok(count < organizationSkills, `${team.id} should not receive the full organization Skill library`);
  }

  const sorted = counts.map((row) => row.count).sort((a, b) => a - b);
  const median = (sorted[10] + sorted[11]) / 2;
  const max = sorted[sorted.length - 1];

  assert.ok(
    median / organizationSkills <= 0.45,
    `median team scope should stay <=45% of organization library; got ${median}/${organizationSkills}`
  );
  assert.ok(
    max / organizationSkills <= 0.60,
    `largest team scope should stay <=60% of organization library; got ${max}/${organizationSkills}`
  );

  await t.test('specialist Skills follow Router primary/consumer metadata', async () => {
    const cc = await resolveTeamSkillPaths('cc');
    assert.ok(cc.includes('skills/common/document-review/SKILL.md'));
    assert.ok(cc.includes('skills/creative/presentation-design/SKILL.md'));
    assert.ok(cc.includes('skills/common/step-router/SKILL.md'));
    assert.ok(!cc.includes('skills/common/lab-result-review/SKILL.md'));
    assert.ok(!cc.includes('skills/common/iso9001-audit-readiness/SKILL.md'));
    assert.ok(!cc.includes('skills/common/ncr-capa/SKILL.md'));
    assert.ok(!cc.includes('skills/common/step-skill-authoring/SKILL.md'));
    assert.ok(cc.includes('skills/common/receipt-audit/SKILL.md'));

    const qs = await resolveTeamSkillPaths('qs');
    assert.ok(qs.includes('skills/common/iso9001-audit-readiness/SKILL.md'));
    assert.ok(qs.includes('skills/common/ncr-capa/SKILL.md'));

    const les = await resolveTeamSkillPaths('les');
    assert.ok(les.includes('skills/common/lab-result-review/SKILL.md'));
    assert.ok(!les.includes('skills/creative/creative-art-director/SKILL.md'));
  });

  await t.test('organization-wide wildcard consumers require explicit justification', async () => {
    const router = await readFile('manifest/router-index.yaml', 'utf-8');
    const blocks = router.split(/\n(?=  - name: )/).filter((block) => block.startsWith('  - name: '));
    const wildcardBlocks = blocks.filter((block) => block.includes('consumers: ["*"]'));

    assert.ok(wildcardBlocks.length > 0);
    for (const block of wildcardBlocks) {
      const name = block.match(/^  - name:\s*([a-z0-9-]+)/m)?.[1] || 'unknown';
      assert.match(block, /^    wildcardReason:\s*.+$/m, `${name} wildcard needs wildcardReason`);
    }
    assert.ok(wildcardBlocks.length <= 11, `wildcard consumers should remain exceptional; got ${wildcardBlocks.length}`);
  });
});
