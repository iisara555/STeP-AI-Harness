import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayScenarios } from '../eval/long-task-replay';

// The replay of a real TOR run's reading pattern (eval/long-task-replay.ts) on the real Skill and STeP documents.
// Before the long-task changes, scenarios 2–4 ended in RUN_TIMEOUT, scenario 5 started over with nothing delivered and scenario 1 processed
// ~1.6M input tokens in 18 turns. Limits only tighten.
test('long TOR replays deliver a draft within the step time and without resending the whole prompt each turn', async () => {
  const rows = await replayScenarios();
  assert.equal(rows.length, 5);
  for (const r of rows) {
    assert.equal(r.outcome, 'draft', r.scenario);
    assert.ok(r.seconds < 30 * 60, `${r.scenario}: ${r.seconds} s`);
    assert.ok(r.fullResends <= 3, `${r.scenario}: ${r.fullResends} whole-prompt resends`);
  }
  const [reread, endless, wide, , resumed] = rows;
  assert.ok(reread.turns <= 10, `scenario 1 turns ${reread.turns}`);
  assert.ok(reread.inputTokens <= 500_000, `scenario 1 input ${reread.inputTokens}`);
  assert.ok(endless.turns <= 10, `scenario 2 turns ${endless.turns}`);
  assert.ok(wide.inputTokens <= 1_000_000, `scenario 3 input ${wide.inputTokens}`);
  // "ลองอีกครั้ง" after a stop gets the earlier reads back: fewer turns than starting over (10 on main).
  assert.ok(resumed.turns <= 7, `scenario 5 turns ${resumed.turns}`);
});
