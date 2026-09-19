import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function countMatches(text, regex) {
  return (text.match(regex) || []).length;
}

test('README and architecture stay aligned with current manifests', async (t) => {
  const [
    readme,
    architecture,
    packageText,
    teams,
    skills,
    playbooks,
    actions,
    provenance,
    documents,
  ] = await Promise.all([
    readFile('README.md', 'utf-8'),
    readFile('docs/architecture.md', 'utf-8'),
    readFile('package.json', 'utf-8'),
    readFile('manifest/teams.yaml', 'utf-8'),
    readFile('manifest/skills.yaml', 'utf-8'),
    readFile('manifest/playbooks.yaml', 'utf-8'),
    readFile('manifest/actions.yaml', 'utf-8'),
    readFile('manifest/provenance.yaml', 'utf-8'),
    readFile('manifest/documents.yaml', 'utf-8'),
  ]);

  const pkg = JSON.parse(packageText);
  const teamCount = countMatches(teams, /^      - id:/gm);
  const clusterCount = countMatches(teams, /^  - id:/gm);
  const skillCount = countMatches(skills, /^  [a-z0-9_-]+:\s*$/gm);
  const playbookCount = countMatches(playbooks, /^  - id:/gm);
  const actionCount = countMatches(actions, /^  [a-z0-9_-]+:\s*$/gm);
  const provenanceCount = countMatches(provenance, /^  - id:/gm);

  await t.test('README reports released package version and manifest counts', () => {
    assert.ok(readme.includes(`Released Pilot | **v${pkg.version}**`));
    assert.ok(readme.includes(`Teams | **${teamCount} ทีม**`));
    assert.ok(readme.includes(`AI routing clusters | **${clusterCount} clusters**`));
    assert.ok(readme.includes(`Skills | **${skillCount} Skills**`));
    assert.ok(readme.includes(`Playbooks | **${playbookCount} Playbooks**`));
    assert.ok(readme.includes(`Executable Actions | **${actionCount} Actions**`));
    assert.ok(readme.includes(`Provenance labels | **${provenanceCount} types**`));
  });

  await t.test('README distinguishes release from development foundation', () => {
    assert.ok(readme.includes('feat/context-efficiency'));
    assert.ok(readme.includes('ยังไม่ควรถูกตีความว่าเป็น Release'));
    assert.ok(readme.includes('AFP ยังอยู่ในสถานะ **Demo Source Pack / Foundation Preparation**'));
  });

  await t.test('architecture keeps 6D separate from safeguards and domain layers', () => {
    assert.ok(architecture.includes('Organization Model 6D'));
    assert.ok(architecture.includes('WHO / WHERE / WHAT / WHY / HOW / AUTHORITY'));
    assert.ok(architecture.includes('Cross-cutting Safeguards'));
    assert.ok(architecture.includes('Privacy Gate'));
    assert.ok(architecture.includes('Source & Provenance'));
    assert.ok(architecture.includes('Human Authority'));
  });

  await t.test('quality known gaps remain explicit', () => {
    assert.ok(documents.includes('qms-quality-manual:'));
    assert.ok(documents.includes('qms-master-document-list:'));
    assert.ok(architecture.includes('Quality Manual              ← missing source'));
    assert.ok(architecture.includes('Master Document List        ← missing source'));
    assert.ok(readme.includes('Quality Manual              ← MISSING'));
    assert.ok(readme.includes('Master Document List        ← MISSING'));
  });

  await t.test('README documents Privacy Gate and safe Run State behavior', () => {
    assert.ok(readme.includes('Quick Local Scan'));
    assert.ok(readme.includes('step-ai privacy --file sample.txt --redact'));
    assert.ok(readme.includes('Run State v3'));
    assert.ok(readme.includes('raw PII'));
  });

  await t.test('README and architecture document context efficiency without adding a new layer', () => {
    assert.ok(readme.includes('Context Efficiency & Token Budgeting'));
    assert.ok(readme.includes('Compact Routing Contract'));
    assert.ok(readme.includes('structured handoff'));
    assert.ok(architecture.includes('Context Budgeter ไม่ใช่ Layer ใหม่'));
    assert.ok(architecture.includes('src/modules/context-budget/'));
  });
});
