import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSkillCatalog } from '../src/modules/skills/catalog.js';
import { queryStepRouter } from '../src/modules/router/service.js';

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
