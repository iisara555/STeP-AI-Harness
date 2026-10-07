import { readFile } from 'node:fs/promises';
import { buildTrialPlan, scoreUsability } from '../src/modules/evals/tool-usability.js';
const args = process.argv.slice(2);
const tasks = JSON.parse(await readFile(new URL('../evals/tool-usability/office.json', import.meta.url), 'utf8'));
if (!args.length || args[0] === '--plan') {
  const seed = args.length > 1 ? Number(args[1]) : 42;
  if (!Number.isInteger(seed)) throw new Error('INVALID_SEED');
  console.log(JSON.stringify({ suite: tasks.id, synthetic: true, seed, plan: buildTrialPlan(tasks.tasks.map(t => t.id), seed) }, null, 2));
} else if (args[0] === '--recordings' && args.length === 2) {
  const input = await readFile(args[1]);
  if (input.length > 2000000) throw new Error('RECORDING_LIMIT');
  const recording = JSON.parse(input.toString());
  if (recording.synthetic !== true || recording.suite !== tasks.id) throw new Error('SYNTHETIC_SUITE_REQUIRED');
  if (recording.kind === 'recorded-model-run' && (!recording.model || !recording.provider || !recording.recordedAt || !Number.isInteger(recording.seed))) throw new Error('RUN_METADATA_REQUIRED');
  console.log(JSON.stringify(scoreUsability(tasks.tasks, recording.trials, recording.kind), null, 2));
} else throw new Error('USAGE: --plan [seed] | --recordings <synthetic-host-recording.json>');
