import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PACKAGE_ROOT, resolveTeamFiles } from '../src/modules/role-resolver.js';
import { readManifest } from '../src/modules/manifest.js';
import { loadUserMemory } from '../src/modules/user-memory.js';
import { pathExists } from '../src/utils/file-ops.js';

const execFileAsync = promisify(execFile);
const cli = join(PACKAGE_ROOT, 'bin', 'step-ai.js');

test('config team/tool changes reconcile the active managed workspace end to end', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'step-config-workspace-'));
  const fakeHome = await mkdtemp(join(tmpdir(), 'step-config-home-'));
  t.after(async () => {
    await rm(workspace, { recursive: true, force: true });
    await rm(fakeHome, { recursive: true, force: true });
  });
  const env = {
    ...process.env,
    HOME: fakeHome,
    USERPROFILE: fakeHome,
    CI: '1',
  };

  const qs = await resolveTeamFiles('qs');
  const cc = await resolveTeamFiles('cc');
  const ccPaths = new Set(cc.files.map(file => file.relativePath));
  const qsPaths = new Set(qs.files.map(file => file.relativePath));
  const qsOnly = qs.files.find(
    file => file.type === 'skill' && file.relativePath.endsWith('/SKILL.md') && !ccPaths.has(file.relativePath),
  );
  const ccOnly = cc.files.find(
    file => file.type === 'skill' && file.relativePath.endsWith('/SKILL.md') && !qsPaths.has(file.relativePath),
  );
  assert.ok(qsOnly, 'fixture needs a QS-only routed Skill');
  assert.ok(ccOnly, 'fixture needs a CC-only routed Skill');

  await execFileAsync(process.execPath, [cli, 'init', '--team', 'qs', '--tool', 'codex', '--dest', workspace], {
    cwd: workspace,
    env,
  });
  assert.equal((await readManifest(workspace)).team, 'qs');
  assert.equal(await pathExists(join(workspace, qsOnly.relativePath)), true);
  assert.equal(await pathExists(join(workspace, ccOnly.relativePath)), false);
  assert.equal(await pathExists(join(workspace, 'CODEX_INSTRUCTIONS.md')), true);

  // Simulate another workspace changing the global default to CC. This QS
  // workspace must still route from its own USER.md/manifest identity.
  await mkdir(join(fakeHome, '.step-ai'), { recursive: true });
  await writeFile(
    join(fakeHome, '.step-ai', 'config.json'),
    JSON.stringify({ team: 'cc', cluster: 'market-creative', tool: 'codex' }),
    'utf8',
  );
  const routed = await execFileAsync(
    process.execPath,
    [cli, 'ask', 'ช่วยเตรียมเอกสารสำหรับ audit ISO ปีนี้', '--json'],
    { cwd: workspace, env },
  );
  const route = JSON.parse(routed.stdout).routing;
  assert.equal(route.team, 'qs');
  assert.equal(route.skill, 'iso9001-audit-readiness');

  await execFileAsync(process.execPath, [cli, 'config', '--team', 'cc'], { cwd: workspace, env });
  const afterTeam = await readManifest(workspace);
  assert.equal(afterTeam.team, 'cc');
  assert.equal(afterTeam.targetType, 'team');
  assert.equal(await pathExists(join(workspace, qsOnly.relativePath)), false, 'old team Skill must leave active scope');
  assert.equal(await pathExists(join(workspace, ccOnly.relativePath)), true, 'new team Skill must be installed');
  const memory = await loadUserMemory(workspace);
  assert.equal(memory.profile.team, 'cc');
  assert.equal(memory.profile.cluster, cc.team.clusterId);

  await execFileAsync(process.execPath, [cli, 'config', '--tool', 'chatgpt'], { cwd: workspace, env });
  const afterTool = await readManifest(workspace);
  assert.equal(afterTool.team, 'cc');
  assert.equal(afterTool.tool, 'chatgpt');
  assert.equal(await pathExists(join(workspace, 'CHATGPT.md')), true);
  assert.equal(await pathExists(join(workspace, 'CODEX_INSTRUCTIONS.md')), false, 'stale adapter instruction must be removed');
  assert.ok(Object.hasOwn(afterTool.files, 'CHATGPT.md'));
  assert.equal(Object.hasOwn(afterTool.files, 'CODEX_INSTRUCTIONS.md'), false);

  const agent = await readFile(join(workspace, 'AGENTS.md'), 'utf8');
  assert.match(agent, /ChatGPT Desktop/);
});
