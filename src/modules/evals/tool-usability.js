import { isDeepStrictEqual } from 'node:util';
const fail = code => { throw new Error(code); };
export function buildTrialPlan(taskIds, seed = 42) {
  if (!Array.isArray(taskIds) || !taskIds.length || new Set(taskIds).size !== taskIds.length) fail('INVALID_TASKS');
  let state = seed >>> 0;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  const tasks = [...taskIds];
  for (let i = tasks.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [tasks[i], tasks[j]] = [tasks[j], tasks[i]]; }
  return tasks.flatMap((taskId, i) => (i % 2 ? ['without-tools', 'with-tools'] : ['with-tools', 'without-tools']).map(arm => ({ taskId, arm, sessionId: `${seed}-${i}-${arm}` })));
}
const at = (value, path) => path.split('.').reduce((v, key) => v?.[key], value);
/** Score evidence captured by the host, never the model's assertion that it finished. */
export function scoreUsability(tasks, trials, kind) {
  if (!['controlled-contract', 'recorded-model-run'].includes(kind)) fail('INVALID_EVIDENCE_KIND');
  if (!Array.isArray(tasks) || !tasks.length || !Array.isArray(trials) || trials.length !== tasks.length * 2) fail('UNPAIRED_TRIALS');
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  if (taskMap.size !== tasks.length) fail('INVALID_TASKS');
  const seen = new Set(), sessions = new Set();
  const arms = Object.fromEntries(['with-tools', 'without-tools'].map(arm => [arm, { trials: 0, successes: 0, discovered: 0, wrongSelection: 0, parameterErrors: 0, recovered: 0 }]));
  const rows = [];
  for (const trial of trials) {
    if (!trial || !Object.hasOwn(arms, trial.arm)) fail('INVALID_TRIAL');
    const task = taskMap.get(trial.taskId), arm = arms[trial.arm];
    if (!task || !arm || !Array.isArray(trial.calls) || !task.expected?.path || !task.tools?.length) fail('INVALID_TRIAL');
    if (!trial.sessionId || sessions.has(trial.sessionId)) fail('SESSION_REUSED');
    sessions.add(trial.sessionId);
    const key = `${task.id}/${trial.arm}`; if (seen.has(key)) fail('DUPLICATE_TRIAL'); seen.add(key);
    if (trial.arm === 'without-tools' && trial.calls.length) fail('BASELINE_TOOL_LEAK');
    const calls = trial.calls;
    if (calls.some(c => !c || typeof c.tool !== 'string')) fail('INVALID_TRIAL');
    const selected = calls.filter(c => task.tools.includes(c.tool));
    // A no-tool baseline can still solve a content task: host verification goes in verifiedResult, not answer text.
    const expected = result => isDeepStrictEqual(at(result, task.expected.path), task.expected.equals);
    const success = selected.some(c => !c.error && expected(c.result)) || (trial.verifiedResult !== undefined && expected(trial.verifiedResult));
    const failureIndex = calls.findIndex(c => c.error);
    const recovered = failureIndex >= 0 && calls.slice(failureIndex + 1).some(c => !c.error && task.tools.includes(c.tool) && expected(c.result));
    arm.trials++; arm.successes += Number(success); arm.discovered += Number(selected.length > 0);
    arm.wrongSelection += Number(calls.some(c => !task.tools.includes(c.tool)));
    arm.parameterErrors += Number(calls.some(c => ['INVALID_INPUT', 'SHEET_RANGE_LIMIT', 'SHEET_NOT_FOUND'].includes(c.error)));
    arm.recovered += Number(recovered);
    rows.push({ taskId: task.id, arm: trial.arm, success, discovered: selected.length > 0, recovered });
  }
  return { schemaVersion: 1, evidenceKind: kind, pairedTasks: tasks.length, arms, rows,
    observedDifference: arms['with-tools'].successes / tasks.length - arms['without-tools'].successes / tasks.length,
    modelBenefitEstablished: false, limitation: kind === 'controlled-contract' ? 'Scripted tool contracts; no model performance measured.' : 'Recorded observations; sample size and run isolation require human review before claiming benefit.' };
}
