import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadRouterIndex, queryStepRouter } from '../src/modules/router/service.js';

// Staff-style routing benchmark: how often the Router picks the right Skill when employees phrase requests their own
// way. The limits record the current level; a routing change may only tighten them.
const suite = JSON.parse(await readFile('manifest/routing-staff-benchmark.json', 'utf-8'));

/** What Desktop offers as a Skill suggestion and autoRouting selects. */
const confidentPick = (result) =>
  result.routingConfidence?.tier === 'HIGH' ? result.bestMatch?.skill || null : null;
/** The top candidate backed by a trigger keyword or path, never by an intent word such as "ตรวจ" alone. */
const evidencePick = (result) => {
  const first = result.ranked?.find((candidate) => candidate.breakdown?.keyword > 0 || candidate.breakdown?.path > 0);
  return first && first.score > 0 ? first.skill : null;
};

const routed = new Map();
const route = async (request) => {
  if (!routed.has(request)) routed.set(request, await queryStepRouter(request, { autoRoute: false }));
  return routed.get(request);
};

test('every routed Skill has at least four staff-style requests', async () => {
  const index = await loadRouterIndex();
  const missing = index.map((skill) => skill.name).filter((name) => (suite.skills[name]?.length || 0) < 4);
  assert.deepEqual(missing, [], 'add four requests for each new Skill to manifest/routing-staff-benchmark.json');
  const unknown = Object.keys(suite.skills).filter((name) => !index.some((skill) => skill.name === name));
  assert.deepEqual(unknown, []);
});

for (const [view, pick] of [
  ['confident', confidentPick],
  ['evidence', evidencePick],
]) {
  test(`staff-style requests reach the right Skill (${view} pick) at or above the recorded level`, async () => {
    let correct = 0;
    const wrong = [];
    for (const [skill, requests] of Object.entries(suite.skills))
      for (const request of requests) {
        const chosen = pick(await route(request));
        if (chosen === skill) correct++;
        else if (chosen) wrong.push(`${request} => ${chosen} (expected ${skill})`);
      }
    const total = Object.values(suite.skills).flat().length;
    const limits = suite.limits[view];
    const report = `${view}: ${correct}/${total} correct, ${wrong.length} wrong Skill`;
    assert.ok(correct >= limits.minCorrect, `${report}; minCorrect is ${limits.minCorrect}`);
    assert.ok(wrong.length <= limits.maxWrongSkill, `${report}; maxWrongSkill is ${limits.maxWrongSkill}\n${wrong.join('\n')}`);
  });
}

test('general requests stay out of Skills and authority requests stay held', async () => {
  const matched = [];
  for (const request of suite.general) {
    const result = await route(request);
    const chosen = confidentPick(result) || evidencePick(result);
    if (chosen) matched.push(`${request} => ${chosen}`);
  }
  assert.ok(
    matched.length <= suite.limits.maxGeneralMatched,
    `maxGeneralMatched is ${suite.limits.maxGeneralMatched}:\n${matched.join('\n')}`,
  );
  let held = 0;
  for (const request of suite.authority) {
    const result = await queryStepRouter(request, { autoRoute: true, authorityChecks: true });
    if (['BLOCK', 'ESCALATE'].includes(result.authorityPreflight?.status)) held++;
  }
  assert.ok(held >= suite.limits.minAuthorityHeld, `${held}/${suite.authority.length} held`);
});
