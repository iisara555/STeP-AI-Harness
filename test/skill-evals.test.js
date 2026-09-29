import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { queryStepRouter } from '../src/cli/commands/ask.js';
import { PACKAGE_ROOT } from '../src/modules/role-resolver.js';

// Per-Skill evals: the four dimensions the authoring standard requires before a
// Skill enters Pilot. Routing expectations run here; outputAssertions describe
// what a good answer contains and are graded on model output, not in CI.

const EVAL_DIR = join(PACKAGE_ROOT, 'evals', 'skills');
const DIMENSIONS = ['positive', 'antiTrigger', 'collision', 'missingSource'];
const WORKSPACE = 'tmp/__skill-evals__';

const registry = await readFile(join(PACKAGE_ROOT, 'manifest', 'skills.yaml'), 'utf8');
const registered = new Set([...registry.matchAll(/^  ([a-z0-9-]+):\s*$/gm)].map((m) => m[1]));
const policy = JSON.parse(await readFile(join(PACKAGE_ROOT, 'manifest', 'skill-evals.json'), 'utf8'));
const legacy = new Set(policy.legacyWithoutEvals || []);
const exempt = new Set(Object.keys(policy.evalExemptions || {}));
const evalFiles = (await readdir(EVAL_DIR)).filter((name) => name.endsWith('.json'));
const evals = await Promise.all(evalFiles.map(async (name) => JSON.parse(await readFile(join(EVAL_DIR, name), 'utf8'))));

function skillDir(name) {
  const match = registry.match(new RegExp(`^  ${name}:\\s*$[\\s\\S]*?^    path:\\s*(\\S+)`, 'm'));
  return match ? join(PACKAGE_ROOT, dirname(match[1])) : null;
}

test('every registered Skill has evals and a worked example, or is recorded as debt', () => {
  const withEvals = new Set(evals.map((item) => item.skill));
  for (const name of registered) {
    if (exempt.has(name)) continue;
    if (legacy.has(name)) {
      // The debt list only shrinks: a Skill that gains evals must leave it.
      assert.ok(!withEvals.has(name), `${name} has evals now; remove it from legacyWithoutEvals`);
      continue;
    }
    assert.ok(withEvals.has(name), `${name} needs evals/skills/${name}.json (new Skills cannot join legacyWithoutEvals)`);
    const dir = skillDir(name);
    assert.ok(dir && existsSync(join(dir, 'examples')), `${name} needs an examples/ folder with a worked good output`);
  }
  for (const name of legacy) assert.ok(registered.has(name), `legacyWithoutEvals lists unknown Skill ${name}`);
});

test('legacyWithoutEvals is a closed list that cannot grow', () => {
  // Frozen at the size recorded when the ratchet was introduced.
  assert.ok(legacy.size <= policy.legacyCeiling, `legacyWithoutEvals grew past ${policy.legacyCeiling}`);
});

for (const spec of evals) {
  test(`evals: ${spec.skill}`, async (t) => {
    await t.test('covers all four dimensions with provenance', () => {
      assert.ok(registered.has(spec.skill), `unknown Skill ${spec.skill}`);
      assert.ok(spec.source, 'eval file needs a source');
      assert.ok(spec.baseline?.withoutSkillTypicallyMisses, 'record what a no-Skill answer misses');
      for (const dimension of DIMENSIONS) {
        assert.ok(spec.cases.some((item) => item.dimension === dimension), `missing ${dimension} case`);
      }
      for (const item of spec.cases) {
        if (['positive', 'missingSource'].includes(item.dimension)) {
          assert.ok(item.outputAssertions?.length, `${item.id} needs outputAssertions`);
        }
        if (['antiTrigger', 'collision'].includes(item.dimension)) {
          assert.ok(item.expect.notSkill === spec.skill || item.expect.mode === 'PLAYBOOK', `${item.id} must say which Skill it keeps out`);
        }
      }
    });

    for (const item of spec.cases) {
      await t.test(`${item.dimension}: ${item.id}`, async () => {
        const result = await queryStepRouter(item.prompt, { team: item.team || undefined, workspaceDir: WORKSPACE });
        const contract = result.routingContract;
        if (item.expect.mode) assert.equal(result.routingMode, item.expect.mode, 'mode');
        if (item.expect.skill) assert.equal(contract.skill, item.expect.skill, 'skill');
        if (item.expect.playbook) assert.equal(contract.playbook, item.expect.playbook, 'playbook');
        if (item.expect.tier) assert.equal(result.routingConfidence.tier, item.expect.tier, 'tier');
        if (item.expect.notSkill && item.expect.mode !== 'PLAYBOOK') {
          assert.notEqual(contract.skill, item.expect.notSkill, 'routed into the Skill it should stay out of');
        }
      });
    }
  });
}

test('workspaces ship every doc that a Skill, example or reference links to', async () => {
  // Team workspaces copy docs from a fixed allowlist. A Skill that links to a
  // doc outside it resolves in the repo and breaks on the machines that run it.
  const resolver = await readFile(join(PACKAGE_ROOT, 'src', 'modules', 'role-resolver.js'), 'utf8');
  const lists = [...resolver.matchAll(/const safeDocs = \[([\s\S]*?)\];/g)].map((m) => new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])));
  assert.ok(lists.length >= 2, 'expected the role and team safeDocs allowlists');

  const walk = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((entry) => (
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  )))).flat();
  const linked = new Set();
  for (const file of (await walk(join(PACKAGE_ROOT, 'skills'))).filter((name) => name.endsWith('.md'))) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(/\]\((?:\.\.\/)+docs\/([^)#\s]+\.md)/g)) linked.add(match[1]);
  }
  assert.ok(linked.size > 0);
  for (const doc of linked) {
    for (const list of lists) assert.ok(list.has(doc), `docs/${doc} is linked from a Skill but not shipped to workspaces`);
  }
});
