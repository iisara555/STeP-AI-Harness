import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSkillCatalog, createSkillCatalog } from '../src/modules/skills/catalog.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { queryStepRouter } from '../src/modules/router/service.js';
import { manifestEntry } from '../scripts/skill-intake/admin.mjs';

test('skill catalog tags every SKILL.md by registry and router state', async () => {
  const catalog = await loadSkillCatalog();
  const names = catalog.map((skill) => skill.name);
  assert.equal(new Set(names).size, names.length, 'one entry per skill');
  const receipt = catalog.find((skill) => skill.name === 'receipt-audit');
  assert.equal(receipt.status, 'routed'); assert.equal(receipt.owner, 'afp'); assert.ok(receipt.inRegistry && receipt.inRouter);
  // The router Skill is governed infrastructure, not something the router routes to.
  const router = catalog.find((skill) => skill.name === 'step-router');
  assert.equal(router.status, 'registered'); assert.equal(router.inRouter, false);
  for (const skill of catalog) assert.ok(['routed', 'registered', 'unregistered', 'missing-file'].includes(skill.status), skill.name);
});

test('an explicitly invoked skill skips scoring but never authority checks', async () => {
  const direct = await queryStepRouter('ช่วยหน่อย', { team: 'cc', skill: 'designer-brief' });
  assert.equal(direct.routingContract.mode, 'SKILL'); assert.equal(direct.routingContract.skill, 'designer-brief');
  const blocked = await queryStepRouter('อนุมัติเบิกจ่ายงบประมาณ', { team: 'cc', skill: 'receipt-audit' });
  assert.equal(blocked.routingContract.authority.status, 'BLOCK');
  const unknown = await queryStepRouter('ช่วยหน่อย', { team: 'cc', skill: 'no-such-skill' });
  assert.notEqual(unknown.routingContract.skill, 'no-such-skill');
});

test('cached catalog observes file additions, edits, removals and registry revocation without sharing mutable results', async t => {
  const root = await mkdtemp(join(tmpdir(), 'step-catalog-cache-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'skills', 'fixture'), { recursive: true });
  await mkdir(join(root, 'manifest'));
  await writeFile(join(root, 'manifest', 'skills.yaml'), 'skills:\n  fixture:\n    path: skills/fixture/SKILL.md\n    description: First revision\n');
  await writeFile(join(root, 'skills', 'fixture', 'SKILL.md'), '---\nname: fixture\ndescription: First revision\n---\n# First title\n');
  const catalog = createSkillCatalog(root);
  const first = await catalog();
  assert.equal(first.find(s => s.name === 'fixture').status, 'registered');
  first.find(s => s.name === 'fixture').title = 'Mutation by caller';
  assert.equal((await catalog()).find(s => s.name === 'fixture').title, 'First title');
  await writeFile(join(root, 'skills', 'fixture', 'SKILL.md'), '---\nname: fixture\ndescription: Second revision\n---\n# Second title\n');
  assert.equal((await catalog()).find(s => s.name === 'fixture').title, 'Second title');
  await writeFile(join(root, 'manifest', 'skills.yaml'), 'skills:\n');
  assert.equal((await catalog()).find(s => s.name === 'fixture').status, 'unregistered');
  await mkdir(join(root, 'skills', 'new'));
  await writeFile(join(root, 'skills', 'new', 'SKILL.md'), '---\nname: new-fixture\n---\n# New title\n');
  assert.ok((await catalog()).some(s => s.name === 'new-fixture'));
  await rm(join(root, 'skills', 'new'), { recursive: true });
  assert.ok(!(await catalog()).some(s => s.name === 'new-fixture'));
});

test('catalog carries the contributors the intake script credits, and nothing for Skills without them', async t => {
  const root = await mkdtemp(join(tmpdir(), 'step-catalog-credit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'skills', 'staff', 'leave-letter'), { recursive: true });
  await mkdir(join(root, 'skills', 'staff', 'plain'), { recursive: true });
  await mkdir(join(root, 'manifest'));
  const entry = (name, contributors) =>
    manifestEntry({ name, owner: 'cc', version: '1.0.0', path: `skills/staff/${name}/SKILL.md`, description: 'Fixture', contributors, date: '2026-10-18' });
  await writeFile(
    join(root, 'manifest', 'skills.yaml'),
    ['skills:', entry('leave-letter', [{ name: 'สมหญิง ใจดี', team: 'cc', date: '2026-10-18' }, { name: 'Somchai', date: '2026-10-19' }]), entry('plain', [])].join('\n') + '\n',
  );
  for (const name of ['leave-letter', 'plain'])
    await writeFile(join(root, 'skills', 'staff', name, 'SKILL.md'), `---\nname: ${name}\ndescription: Fixture\n---\n# ${name}\n`);
  const catalog = await loadSkillCatalog(root);
  assert.deepEqual(catalog.find(s => s.name === 'leave-letter').contributors, [
    { name: 'สมหญิง ใจดี', team: 'cc', date: '2026-10-18' },
    { name: 'Somchai', date: '2026-10-19' },
  ]);
  assert.equal('contributors' in catalog.find(s => s.name === 'plain'), false);
});
