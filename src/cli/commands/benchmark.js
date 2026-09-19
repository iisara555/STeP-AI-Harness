import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { PACKAGE_ROOT } from '../../modules/role-resolver.js';
import { queryStepRouter } from './ask.js';

function asInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function mean(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values = [], p = 0.95) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function evaluateExpected(task, result) {
  const expected = task.expected || {};
  const checks = [];

  if (expected.mode) {
    checks.push({
      key: 'mode',
      expected: expected.mode,
      actual: result.routingMode,
      pass: result.routingMode === expected.mode,
    });
  }

  if (expected.skill) {
    const actual = result.selectedSkill?.name || '';
    checks.push({
      key: 'skill',
      expected: expected.skill,
      actual,
      pass: actual === expected.skill,
    });
  }

  if (expected.playbook) {
    const actual = result.selectedPlaybook?.id || '';
    checks.push({
      key: 'playbook',
      expected: expected.playbook,
      actual,
      pass: actual === expected.playbook,
    });
  }

  if (expected.team) {
    const actual = result.teamInfo?.id || '';
    checks.push({
      key: 'team',
      expected: expected.team,
      actual,
      pass: actual === expected.team,
    });
  }

  if (expected.scope) {
    const actual = result.scopeResult?.status || '';
    checks.push({
      key: 'scope',
      expected: expected.scope,
      actual,
      pass: actual === expected.scope,
    });
  }

  if (expected.authority) {
    const actual = result.scopeResult?.authority || '';
    checks.push({
      key: 'authority',
      expected: expected.authority,
      actual,
      pass: actual === expected.authority,
    });
  }

  return {
    pass: checks.every((item) => item.pass),
    checks,
  };
}

async function loadSuite() {
  const path = join(PACKAGE_ROOT, 'manifest', 'pilot-benchmark.json');
  return JSON.parse(await readFile(path, 'utf-8'));
}

export async function runBenchmark(args = {}) {
  const suite = await loadSuite();
  const limit = Math.min(asInt(args.limit, suite.tasks.length), suite.tasks.length);
  const group = args.group ? String(args.group) : '';
  const selected = suite.tasks
    .filter((task) => !group || task.group === group)
    .slice(0, limit);

  const rows = [];

  for (const task of selected) {
    const started = performance.now();
    let result;
    let error = null;

    try {
      result = await queryStepRouter(task.prompt, {
        team: task.inputTeam || '',
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const elapsedMs = performance.now() - started;

    if (error) {
      rows.push({
        id: task.id,
        group: task.group,
        prompt: task.prompt,
        pass: false,
        elapsedMs: Number(elapsedMs.toFixed(2)),
        error,
      });
      continue;
    }

    const evaluation = evaluateExpected(task, result);
    const components = result.contextPlan?.components || {};
    const overBudget = Object.entries(components)
      .filter(([, value]) => value?.overBudget)
      .map(([key]) => key);

    rows.push({
      id: task.id,
      group: task.group,
      prompt: task.prompt,
      pass: evaluation.pass,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      mode: result.routingMode,
      skill: result.selectedSkill?.name || '',
      playbook: result.selectedPlaybook?.id || '',
      team: result.teamInfo?.id || '',
      scope: result.scopeResult?.status || '',
      authority: result.scopeResult?.authority || '',
      routingEstimatedTokens: components.routing?.estimatedTokens ?? null,
      harnessEstimatedTokens: result.contextPlan?.estimatedHarnessTokens ?? null,
      overBudget,
      checks: evaluation.checks,
    });
  }

  const elapsed = rows.map((row) => row.elapsedMs);
  const harnessTokens = rows
    .map((row) => row.harnessEstimatedTokens)
    .filter((value) => Number.isFinite(value));
  const passed = rows.filter((row) => row.pass).length;
  const failed = rows.length - passed;
  const overBudgetRows = rows.filter((row) => (row.overBudget || []).length > 0);

  const byGroup = {};
  for (const row of rows) {
    byGroup[row.group] ||= { total: 0, passed: 0, failed: 0 };
    byGroup[row.group].total += 1;
    if (row.pass) byGroup[row.group].passed += 1;
    else byGroup[row.group].failed += 1;
  }

  const report = {
    suite: suite.id,
    generatedAt: new Date().toISOString(),
    mode: 'router-context-preflight',
    note: 'This benchmark does not call an LLM. Human Pilot is still required for answer quality and time-to-usable-output.',
    total: rows.length,
    passed,
    failed,
    passRate: rows.length ? Number(((passed / rows.length) * 100).toFixed(1)) : 0,
    timingMs: {
      average: Number(mean(elapsed).toFixed(2)),
      p95: Number(percentile(elapsed, 0.95).toFixed(2)),
      max: Number(Math.max(0, ...elapsed).toFixed(2)),
    },
    context: {
      averageEstimatedHarnessTokens: Number(mean(harnessTokens).toFixed(1)),
      p95EstimatedHarnessTokens: Number(percentile(harnessTokens, 0.95).toFixed(1)),
      maxEstimatedHarnessTokens: Math.max(0, ...harnessTokens),
      overBudgetTasks: overBudgetRows.map((row) => ({
        id: row.id,
        components: row.overBudget,
      })),
    },
    byGroup,
    rows,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  console.log('\nSTeP AI Pilot Benchmark — 30 Task Suite');
  console.log('=======================================');
  console.log(`Suite:      ${report.suite}`);
  console.log(`Tasks:      ${report.total}`);
  console.log(`Pass:       ${report.passed}`);
  console.log(`Fail:       ${report.failed}`);
  console.log(`Pass rate:  ${report.passRate}%`);
  console.log(`Route avg:  ${report.timingMs.average} ms`);
  console.log(`Route p95:  ${report.timingMs.p95} ms`);
  console.log(`Harness context estimate avg: ${report.context.averageEstimatedHarnessTokens} tokens`);
  console.log(`Harness context estimate p95: ${report.context.p95EstimatedHarnessTokens} tokens`);
  console.log(`Over-budget tasks: ${report.context.overBudgetTasks.length}`);
  console.log('');

  for (const row of rows) {
    const mark = row.pass ? '✓' : '✗';
    const route = row.playbook || row.skill || '-';
    const budget = (row.overBudget || []).length
      ? ` over-budget=${row.overBudget.join(',')}`
      : '';
    console.log(`${mark} ${row.id} [${row.group}] → ${route} / ${row.team || '-'} / ${row.scope || '-'} / ${row.elapsedMs}ms${budget}`);
    if (!row.pass) {
      for (const check of row.checks || []) {
        if (!check.pass) {
          console.log(`    ${check.key}: expected=${check.expected} actual=${check.actual}`);
        }
      }
      if (row.error) console.log(`    error: ${row.error}`);
    }
  }

  console.log('\nหมายเหตุ: รอบนี้ทดสอบ Router/Context/Authority preflight เท่านั้น');
  console.log('คุณภาพคำตอบจริง, source traceability และ time-to-usable-output ต้องเก็บจาก Human Pilot\n');

  return report;
}
