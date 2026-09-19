import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getAvailableRoles, resolveRoleFiles, getAvailableTeams, resolveTeamFiles } from '../src/modules/role-resolver.js';
import { inspectWorkspace, readManifest } from '../src/modules/manifest.js';
import { createSnapshot, listSnapshots, restoreSnapshot } from '../src/modules/recovery.js';
import { installForCodex } from '../src/modules/adapter-codex.js';
import { calculateFileSha256 } from '../src/utils/checksum.js';
import { pathExists } from '../src/utils/file-ops.js';

const TEST_DIR = resolve('./tmp/unit-test-workspace');

test('CLI & Core Modules Test Suite', async (t) => {
  // Clean test workspace before running
  await rm(TEST_DIR, { recursive: true, force: true });

  await t.test('Role Resolver loads roles and files correctly', async () => {
    const roles = await getAvailableRoles();
    assert.ok(roles.length >= 4, 'Should have at least 4 roles');

    const roleIds = roles.map((r) => r.id);
    assert.ok(roleIds.includes('pm'), 'Should include pm role');
    assert.ok(roleIds.includes('developer'), 'Should include developer role');
    assert.ok(roleIds.includes('creative'), 'Should include creative role');
    assert.ok(roleIds.includes('ai-admin'), 'Should include ai-admin role');
    assert.ok(roleIds.includes('all'), 'Should include all role');
    assert.ok(roleIds.includes('staff'), 'Should include staff role');

    const allFiles = await resolveRoleFiles('all');
    assert.equal(allFiles.role.id, 'all');
    const allSkillPaths = allFiles.files.filter((f) => f.type === 'skill' && f.relativePath.endsWith('SKILL.md'));
    assert.equal(allSkillPaths.length, 45, 'Universal role should resolve all 45 skills');
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/creative/creative-art-director/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/step-skill-authoring/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/evidence-before-approval/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/learning-designer/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/pm/assumption-challenger/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/pm/decision-memo/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/pm/industry-problem-discovery/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/market-signal-radar/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/voice-of-customer/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/lab-result-review/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/iso9001-audit-readiness/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/audit-evidence-matrix/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/document-record-control/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/audit-interview-coach/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/ncr-capa/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/qms-risk-opportunity-review/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/quality-objective-kpi-review/SKILL.md'));
    assert.ok(allSkillPaths.some((f) => f.relativePath === 'skills/common/management-review-prep/SKILL.md'));

    const pmFiles = await resolveRoleFiles('pm');
    assert.equal(pmFiles.role.id, 'pm');
    assert.ok(pmFiles.files.length > 0, 'PM should have associated files');

    const skillPaths = pmFiles.files.map((f) => f.relativePath);
    assert.ok(skillPaths.includes('skills/pm/tor-review/SKILL.md'));
    assert.ok(skillPaths.includes('skills/pm/assumption-challenger/SKILL.md'));
    assert.ok(skillPaths.includes('skills/pm/decision-memo/SKILL.md'));
    assert.ok(skillPaths.includes('skills/pm/industry-problem-discovery/SKILL.md'));
    assert.ok(skillPaths.includes('rules/human-approval.md'));
    assert.ok(skillPaths.includes('rules/output-management.md'));
    assert.ok(skillPaths.includes('docs/step-context.md'));

    // Verify staff-abbreviations is NOT included
    assert.ok(!skillPaths.includes('docs/staff-abbreviations.md'));
  });

  await t.test('Codex Adapter installs files and generates instructions', async () => {
    const { role, files } = await resolveRoleFiles('pm');
    const result = await installForCodex({
      workspaceDir: TEST_DIR,
      role,
      files,
      dryRun: false,
    });

    assert.ok(result.installedFiles.length > 0);
    assert.ok(await pathExists(join(TEST_DIR, 'CODEX_INSTRUCTIONS.md')));
    assert.ok(await pathExists(join(TEST_DIR, 'AGENTS.md')));
    assert.ok(await pathExists(join(TEST_DIR, 'skills/pm/tor-review/SKILL.md')));

    const instructionsContent = await readFile(join(TEST_DIR, 'CODEX_INSTRUCTIONS.md'), 'utf-8');
    assert.ok(instructionsContent.includes('**Role:** PM'));
    assert.ok(instructionsContent.includes('Compact Bootstrap'));
    assert.ok(instructionsContent.includes('Installed ≠ Loaded'));
  });

  await t.test('Manifest tracks file integrity correctly', async () => {
    const { role, files } = await resolveRoleFiles('pm');
    const { installedFiles } = await installForCodex({
      workspaceDir: TEST_DIR,
      role,
      files,
      dryRun: false,
    });

    const manifestFiles = {};
    for (const item of installedFiles) {
      manifestFiles[item.relativePath] = {
        sha256: item.sha256,
        size: item.size,
      };
    }

    const { writeManifest } = await import('../src/modules/manifest.js');
    await writeManifest(TEST_DIR, {
      package: '@step-cmu/ai-harness',
      version: '0.1.0',
      role: 'pm',
      tool: 'codex',
      files: manifestFiles,
    });

    const manifest = await readManifest(TEST_DIR);
    assert.equal(manifest.role, 'pm');

    let inspection = await inspectWorkspace(TEST_DIR);
    assert.equal(inspection.clean.length, Object.keys(manifestFiles).length);
    assert.equal(inspection.modified.length, 0);

    // Modify a file
    const targetFile = join(TEST_DIR, 'rules/naming.md');
    const originalContent = await readFile(targetFile, 'utf-8');
    await (await import('node:fs/promises')).writeFile(targetFile, originalContent + '\n# Modified');

    inspection = await inspectWorkspace(TEST_DIR);
    assert.equal(inspection.modified.length, 1);
    assert.equal(inspection.modified[0], 'rules/naming.md');
  });

  await t.test('Recovery snapshots and restores files', async () => {
    const snapId = await createSnapshot(TEST_DIR, 'test-snapshot');
    assert.ok(snapId, 'Should return snapshot ID');

    const snapshots = await listSnapshots(TEST_DIR);
    assert.ok(snapshots.length >= 1);
    assert.equal(snapshots[0].snapshotId, snapId);

    const rollbackResult = await restoreSnapshot(TEST_DIR, snapId);
    assert.equal(rollbackResult.snapshotId, snapId);
    assert.ok(rollbackResult.restoredFiles.length > 0);
  });

  await t.test('Claude Adapter installs files and generates CLAUDE.md', async () => {
    const claudeDir = resolve('./tmp/unit-test-claude');
    await rm(claudeDir, { recursive: true, force: true });

    const { getAdapter } = await import('../src/modules/adapters/index.js');
    const claudeAdapter = getAdapter('claude');
    const { role, files } = await resolveRoleFiles('developer');

    const result = await claudeAdapter.install({
      workspaceDir: claudeDir,
      role,
      files,
      dryRun: false,
    });

    assert.ok(result.installedFiles.length > 0);
    assert.ok(await pathExists(join(claudeDir, 'CLAUDE.md')));
    assert.ok(await pathExists(join(claudeDir, 'AGENTS.md')));
    assert.ok(await pathExists(join(claudeDir, 'skills/dev/coding-git-workflow/SKILL.md')));

    const claudeContent = await readFile(join(claudeDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(claudeContent.includes('Active Role: **DEVELOPER**'));
    assert.ok(claudeContent.includes('Core Principles & Safety Boundaries'));

    await rm(claudeDir, { recursive: true, force: true });
  });

  await t.test('Cursor Adapter installs files and generates .cursorrules', async () => {
    const cursorDir = resolve('./tmp/unit-test-cursor');
    await rm(cursorDir, { recursive: true, force: true });

    const { getAdapter } = await import('../src/modules/adapters/index.js');
    const cursorAdapter = getAdapter('cursor');
    const { role, files } = await resolveRoleFiles('creative');

    const result = await cursorAdapter.install({
      workspaceDir: cursorDir,
      role,
      files,
      dryRun: false,
    });

    assert.ok(result.installedFiles.length > 0);
    assert.ok(await pathExists(join(cursorDir, '.cursorrules')));
    assert.ok(await pathExists(join(cursorDir, 'skills/creative/designer-brief/SKILL.md')));
    assert.ok(await pathExists(join(cursorDir, 'skills/creative/creative-art-director/SKILL.md')));

    const cursorContent = await readFile(join(cursorDir, '.cursorrules'), 'utf-8');
    assert.ok(cursorContent.includes('Role: creative'));

    await rm(cursorDir, { recursive: true, force: true });
  });

  await t.test('Multi-Agent Adapter installs all agent instruction files', async () => {
    const multiDir = resolve('./tmp/unit-test-multi');
    await rm(multiDir, { recursive: true, force: true });

    const { getAdapter } = await import('../src/modules/adapters/index.js');
    const multiAdapter = getAdapter('all');
    const { role, files } = await resolveRoleFiles('ai-admin');

    const result = await multiAdapter.install({
      workspaceDir: multiDir,
      role,
      files,
      dryRun: false,
    });

    assert.ok(await pathExists(join(multiDir, 'CLAUDE.md')));
    assert.ok(await pathExists(join(multiDir, '.cursorrules')));
    assert.ok(await pathExists(join(multiDir, '.windsurfrules')));
    assert.ok(await pathExists(join(multiDir, 'HERMES.md')));
    assert.ok(await pathExists(join(multiDir, 'OPENCODE.md')));
    assert.ok(await pathExists(join(multiDir, 'GEMINI.md')));
    assert.ok(await pathExists(join(multiDir, 'CHATGPT.md')));
    assert.ok(await pathExists(join(multiDir, 'CODEX_INSTRUCTIONS.md')));
    assert.ok(await pathExists(join(multiDir, 'AGENTS.md')));

    await rm(multiDir, { recursive: true, force: true });
  });

  await t.test('Role Resolver loads all 22 STeP teams correctly', async () => {
    const teams = await getAvailableTeams();
    assert.equal(teams.length, 22, 'Should have exactly 22 teams defined in teams.yaml');

    const teamIds = teams.map((t) => t.id);
    const expectedTeams = [
      'ga', 'afp', 'iasa', 'qs', 'nmco', 'hd',
      'piti', 'isi', 'eic', 'imo', 'sit',
      'tech-spin', 'tech-up', 'linc', 'pubsec',
      'cc', 'mi', 'crm',
      'ifu', 'iqi', 'les', 'foodfabr',
    ];

    for (const expected of expectedTeams) {
      assert.ok(teamIds.includes(expected), `Missing team: ${expected}`);
    }
  });

  await t.test('Team Resolver resolves specific team skills and router files', async () => {
    const qsResolved = await resolveTeamFiles('qs');
    assert.equal(qsResolved.team.id, 'qs');
    assert.equal(qsResolved.team.clusterId, 'governance-operations');

    const qsFilePaths = qsResolved.files.map((f) => f.relativePath);
    assert.ok(qsFilePaths.includes('skills/common/step-router/SKILL.md'), 'Must include step-router');
    assert.ok(qsFilePaths.includes('skills/pm/tor-review/SKILL.md'), 'QS includes tor-review');
    assert.ok(qsFilePaths.includes('skills/common/sop-authoring/SKILL.md'), 'QS includes sop-authoring');
    assert.ok(qsFilePaths.includes('skills/common/evidence-before-approval/SKILL.md'));
    assert.ok(qsFilePaths.includes('skills/common/lab-result-review/SKILL.md'));
    assert.ok(qsFilePaths.includes('skills/common/iso9001-audit-readiness/SKILL.md'));
    assert.ok(qsFilePaths.includes('skills/common/audit-evidence-matrix/SKILL.md'));
    assert.ok(qsFilePaths.includes('skills/common/document-record-control/SKILL.md'));
    assert.ok(qsFilePaths.includes('skills/common/audit-interview-coach/SKILL.md'));
    assert.ok(qsFilePaths.includes('skills/common/ncr-capa/SKILL.md'));
    assert.ok(qsFilePaths.includes('skills/common/qms-risk-opportunity-review/SKILL.md'));
    assert.ok(qsFilePaths.includes('skills/common/quality-objective-kpi-review/SKILL.md'));
    assert.ok(qsFilePaths.includes('skills/common/management-review-prep/SKILL.md'));
    assert.ok(qsFilePaths.includes('rules/output-management.md'), 'All teams must receive output-management rule');
    assert.ok(qsFilePaths.includes('docs/teams.md'), 'Must include teams.md');
    assert.ok(qsFilePaths.includes('docs/step-router.md'), 'Must include step-router.md');

    // Test Creative & Communication (CC) team
    const ccResolved = await resolveTeamFiles('cc');
    const ccFilePaths = ccResolved.files.map((f) => f.relativePath);
    assert.ok(ccFilePaths.includes('skills/creative/designer-brief/SKILL.md'));
    assert.ok(ccFilePaths.includes('skills/creative/event-concept/SKILL.md'));
    assert.ok(ccFilePaths.includes('skills/creative/step-image-prompt/SKILL.md'));
    assert.ok(ccFilePaths.includes('skills/creative/creative-art-director/SKILL.md'));
    assert.ok(ccFilePaths.includes('skills/common/step-brand/SKILL.md'));
    assert.ok(ccFilePaths.includes('skills/common/market-signal-radar/SKILL.md'));

    // Test Market Innovation (MI) team
    const miResolved = await resolveTeamFiles('mi');
    assert.equal(miResolved.team.clusterId, 'market-creative');
    assert.ok(miResolved.team.skills.includes('creative'));
    assert.ok(miResolved.team.skills.includes('pm'));
    const miPaths = miResolved.files.map((f) => f.relativePath);
    assert.ok(miPaths.includes('skills/common/market-signal-radar/SKILL.md'));
    assert.ok(miPaths.includes('skills/common/voice-of-customer/SKILL.md'));
    assert.ok(miPaths.includes('skills/pm/assumption-challenger/SKILL.md'));
  });

  // Cleanup after test
  await rm(TEST_DIR, { recursive: true, force: true });
});
