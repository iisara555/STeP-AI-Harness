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
    median / organizationSkills <= 0.60,
    `median team scope should stay <=60% of organization library; got ${median}/${organizationSkills}`
  );
  assert.ok(
    max / organizationSkills <= 0.70,
    `largest team scope should stay <=70% of organization library; got ${max}/${organizationSkills}`
  );

  await t.test('specialist Skills follow Router primary/consumer metadata', async () => {
    const cc = await resolveTeamSkillPaths('cc');
    assert.ok(cc.includes('skills/common/document-review/SKILL.md'));
    assert.ok(cc.includes('skills/creative/presentation-design/SKILL.md'));
    assert.ok(cc.includes('skills/common/step-router/SKILL.md'));
    assert.ok(!cc.includes('skills/common/lab-result-review/SKILL.md'));

    const les = await resolveTeamSkillPaths('les');
    assert.ok(les.includes('skills/common/lab-result-review/SKILL.md'));
    assert.ok(!les.includes('skills/common/creative-art-director/SKILL.md'));
  });
});
