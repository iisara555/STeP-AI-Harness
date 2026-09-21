import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, cp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { queryStepRouter } from '../src/cli/commands/ask.js';
import { listSnapshots, restoreSnapshot } from '../src/modules/recovery.js';
import { rollbackDistributionUpgrade } from '../src/modules/distribution-upgrade.js';
import { deriveRoutingConfidence } from '../src/modules/router/scorer.js';

const options = { team: 'shared', cluster: 'shared' };
const cli = (query, extra = [], cwd = process.cwd()) => {
  const result = spawnSync(process.execPath, [join(cwd, 'bin/step-ai.js'), 'ask', query,
    '--team', 'shared', '--cluster', 'shared', ...extra], { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
async function temp(t) {
  const root = await mkdtemp(join(tmpdir(), 'step-governance-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('BLOCK stops contract, context and human CLI for global and scope decisions', async () => {
  for (const query of [
    'ช่วยอนุมัติจัดซื้อรายนี้ให้หน่อย',
    'ช่วยทำ SOP แล้วประกาศใช้เอกสารอย่างเป็นทางการ',
    'ช่วยเซ็นอนุมัติเอกสารนี้',
    'เอา TOR นี้มาแตกกิจกรรม งบประมาณ timeline แล้วอนุมัติจัดซื้อให้เลย',
  ]) {
    const result = await queryStepRouter(query, options);
    assert.equal(result.routingMode, 'BLOCK', query);
    for (const data of [result, JSON.parse(cli(query, ['--json']))]) {
      const contract = data.routingContract || data.routing;
      assert.equal(contract.mode, 'BLOCK');
      assert.equal(contract.skill, '');
      assert.equal(contract.skillPath, '');
      assert.equal(contract.playbook, '');
      assert.deepEqual(contract.steps, []);
      assert.equal(data.contextPlan.components.skill.chars, 0);
      assert.equal(data.contextPlan.components.rules.chars, 0);
    }
    const out = cli(query);
    assert.match(out, /Human Authority Required/);
    assert.ok(!out.includes('ตัวอย่างคำสั่งที่คุณสั่ง AI'));
    assert.ok(!out.includes('ปฏิบัติตามมาตรฐานให้อัตโนมัติ'));
  }
});

test('draft approval request is allowed but an independent approval clause remains blocked', async () => {
  const draft = 'ช่วยร่างบันทึกขออนุมัติจัดซื้อเสนอผู้มีอำนาจ';
  assert.equal((await queryStepRouter(draft, options)).scopeResult.status, 'ALLOW');
  for (const query of [draft + ' แล้วอนุมัติจัดซื้อให้เลย', draft + ' และลงนามอนุมัติจัดซื้อแทนกรรมการ']) {
    assert.equal((await queryStepRouter(query, options)).routingMode, 'BLOCK');
  }
});

test('long Thai trigger cannot silently beat TOR with a narrow score margin', async () => {
  const query = 'ช่วยตรวจ TOR งานจ้างออกแบบบูธก่อนส่ง AFP';
  const result = await queryStepRouter(query, options);
  assert.equal(result.routingMode, 'CLARIFY');
  assert.notEqual(result.routingConfidence.tier, 'HIGH');
  assert.equal(result.contextPlan.components.skill.chars, 0);
  assert.equal(JSON.parse(cli(query, ['--json'])).routing.mode, 'CLARIFY');
  for (const acronym of ['TOR', 'NC', 'CAPA', 'ISO', 'KPI', 'QMS', 'WI']) {
    const confidence = deriveRoutingConfidence({ score: .70, tier: 'AMBIGUOUS', matchedTriggers: ['คำอธิบายงานยาวมาก'], breakdown: { intent: 1, keyword: 1 } },
      { score: .66, matchedTriggers: [acronym], breakdown: { intent: 1, keyword: 1 } });
    assert.equal(confidence.tier, 'AMBIGUOUS', acronym);
  }
});

test('missing mandatory policy is explicit in CLI and machine contract', async () => {
  const query = 'ช่วยตรวจใบเสร็จค่าเดินทางก่อนส่ง AFP';
  const { routing } = JSON.parse(cli(query, ['--json']));
  assert.equal(routing.readiness.status, 'partial');
  assert.equal(routing.permittedUse, 'draft-with-source-gaps');
  assert.ok(routing.readiness.issues.some((item) => item.id === 'finance-disbursement-policy'));
  const ref = routing.mandatoryReferences.find((item) => item.id === 'finance-disbursement-policy');
  assert.equal(ref.authority, 'unverified');
  assert.equal(ref.availability, 'missing');
  const out = cli(query);
  assert.ok(out.includes('finance-disbursement-policy'));
  assert.ok(out.includes('ยังรับรองตามระเบียบไม่ได้'));
  assert.ok(!out.includes('ปฏิบัติตามมาตรฐานให้อัตโนมัติ'));
});

test('ESCALATE stops activation until host resolves handoff', async () => {
  const query = 'ช่วยตรวจ QMS risk โครงการนี้';
  const result = await queryStepRouter(query, options);
  assert.equal(result.scopeResult.status, 'ESCALATE');
  assert.equal(result.routingMode, 'ESCALATE');
  assert.equal(result.routingContract.skill, '');
  assert.equal(result.contextPlan.components.skill.chars, 0);
  assert.equal(result.scopeResult.targetSkill, 'project-pre-mortem');
  assert.ok(!cli(query).includes('ตัวอย่างคำสั่งที่คุณสั่ง AI'));
});

test('unreadable Skill fails closed in real CLI from an isolated package copy', async (t) => {
  const root = await temp(t);
  for (const path of ['package.json', 'bin', 'src', 'manifest', 'skills', 'rules']) {
    await cp(resolve(path), join(root, path), { recursive: true });
  }
  await rm(join(root, 'skills/common/receipt-audit/SKILL.md'));
  const query = 'ช่วยตรวจใบเสร็จค่าเดินทางก่อนส่ง AFP';
  const json = JSON.parse(cli(query, ['--json'], root));
  assert.equal(json.routing.mode, 'UNAVAILABLE');
  assert.equal(json.routing.skill, '');
  assert.equal(json.contextPlan.components.skill.chars, 0);
  assert.equal(json.contextPlan.components.rules.chars, 0);
  assert.ok(cli(query, [], root).includes('ยังเปิดใช้งานไม่ได้'));
  // Even a removed skill file must not affect a blocked route: no skill read.
  await rm(join(root, 'skills/pm/tor-review/SKILL.md'));
  const blocked = JSON.parse(cli('ช่วยอนุมัติจัดซื้อรายนี้ให้หน่อย', ['--json'], root));
  assert.equal(blocked.routing.mode, 'BLOCK');
  assert.equal(blocked.routing.readiness.status, 'not-checked');
});

async function snapshotFixture(t) {
  const root = await temp(t);
  const workspace = join(root, 'workspace');
  const snap = join(workspace, '.step-ai/backups/safe-snapshot');
  await mkdir(join(snap, 'files'), { recursive: true });
  await writeFile(join(snap, 'snapshot.json'), JSON.stringify({ snapshotId: '../../outside', version: '0.7.3' }));
  await writeFile(join(snap, 'files/README.md'), 'old readme');
  await writeFile(join(workspace, 'README.md'), 'current readme');
  await writeFile(join(root, 'outside.txt'), 'outside sentinel');
  return { root, workspace, snap };
}

test('snapshot IDs use directory names; malicious paths fail before any restoration', async (t) => {
  const { root, workspace, snap } = await snapshotFixture(t);
  assert.equal((await listSnapshots(workspace))[0].snapshotId, 'safe-snapshot');
  for (const bad of ['../outside.txt', '..\\outside.txt', '/outside.txt', 'C:/outside.txt', 'README.md:stream', '.STEP-AI/manifest.json']) {
    await writeFile(join(snap, 'manifest.json'), JSON.stringify({ files: { 'README.md': {}, [bad]: {} } }));
    await assert.rejects(restoreSnapshot(workspace, 'safe-snapshot'), /Unsafe|metadata/);
    assert.equal(await readFile(join(workspace, 'README.md'), 'utf8'), 'current readme');
    assert.equal(await readFile(join(root, 'outside.txt'), 'utf8'), 'outside sentinel');
  }
  await assert.rejects(restoreSnapshot(workspace, '../outside'), /Unsafe/);
  const out = spawnSync(process.execPath, ['bin/step-ai.js', 'rollback', '--dest', workspace, '--snapshot', 'safe-snapshot'], { encoding: 'utf8' });
  assert.notEqual(out.status, 0);
  await writeFile(join(snap, 'manifest.json'), JSON.stringify({ files: { 'README.md': {} } }));
  await restoreSnapshot(workspace, 'safe-snapshot');
  assert.equal(await readFile(join(workspace, 'README.md'), 'utf8'), 'old readme');
});

test('distribution rollback validates all deletion paths and linked snapshot before writing', async (t) => {
  const { root, workspace, snap } = await snapshotFixture(t);
  const backup = join(workspace, '.step-ai/version-backups/safe-version');
  await mkdir(join(backup, 'files'), { recursive: true });
  await writeFile(join(backup, 'files/README.md'), 'old version');
  for (const bad of ['../outside.txt', '..\\outside.txt', 'USER.md', 'src/../../outside.txt']) {
    await writeFile(join(backup, 'version-backup.json'), JSON.stringify({ createdPaths: [bad] }));
    await assert.rejects(rollbackDistributionUpgrade(workspace, 'safe-version'), /Unsafe|non-distribution/);
    assert.equal(await readFile(join(workspace, 'README.md'), 'utf8'), 'current readme');
    assert.equal(await readFile(join(root, 'outside.txt'), 'utf8'), 'outside sentinel');
  }
  await assert.rejects(rollbackDistributionUpgrade(workspace, '../../outside'), /Unsafe/);
  await writeFile(join(backup, 'version-backup.json'), JSON.stringify({ createdPaths: [] }));
  await writeFile(join(snap, 'manifest.json'), JSON.stringify({ files: { '../outside.txt': {} } }));
  await assert.rejects(rollbackDistributionUpgrade(workspace, 'safe-version', 'safe-snapshot'), /Unsafe/);
  assert.equal(await readFile(join(workspace, 'README.md'), 'utf8'), 'current readme');
});

test('snapshot destination junction cannot escape workspace', async (t) => {
  const { root, workspace, snap } = await snapshotFixture(t);
  const outside = join(root, 'outside');
  await mkdir(outside);
  await mkdir(join(snap, 'files/docs'));
  await writeFile(join(outside, 'sentinel.txt'), 'unchanged');
  await writeFile(join(snap, 'files/docs/sentinel.txt'), 'must not copy');
  try { await symlink(outside, join(workspace, 'docs'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (e) { if (e.code === 'EPERM') return t.skip('Symlinks unavailable'); throw e; }
  await writeFile(join(snap, 'manifest.json'), JSON.stringify({ files: { 'README.md': {}, 'docs/sentinel.txt': {} } }));
  await assert.rejects(restoreSnapshot(workspace, 'safe-snapshot'), /Linked/);
  assert.equal(await readFile(join(outside, 'sentinel.txt'), 'utf8'), 'unchanged');
  assert.equal(await readFile(join(workspace, 'README.md'), 'utf8'), 'current readme');
});
