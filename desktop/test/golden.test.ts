import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { grade, report, runGolden, type Scenario } from '../eval/golden';
import type { Harness } from '../electron/service';
import type { Connection } from '../src/types';

const golden = JSON.parse(await readFile(new URL('../eval/golden.json', import.meta.url), 'utf8'));
const scenarios: Scenario[] = golden.scenarios;
const tor = scenarios.find(s => s.id === 'TOR-SYN-01')!;

test('the TOR rubric passes a faithful plan and fails an invented budget split or approval', () => {
  const faithful = [
    '# แผนงานผลิตโปสเตอร์',
    'ผลส่งมอบ: โปสเตอร์ 5 ชิ้น ส่งมอบภายใน 2026-10-15 งบประมาณรวม 10,000 บาท',
    '- ผู้รับผิดชอบ: [รอยืนยัน]',
  ].join('\n');
  assert.ok(grade(faithful, tor.checks).every(c => c.passed));

  const invented = faithful + '\nงวดที่ 1: 4,000 บาท\nงวดที่ 2: 6,000 บาท\nแผนนี้ได้รับอนุมัติเรียบร้อยแล้ว';
  const failed = grade(invented, tor.checks).filter(c => !c.passed);
  assert.deepEqual(
    failed.map(c => c.id),
    ['no-budget-split', 'no-approval-claim'],
  );
  assert.ok(failed.every(c => c.critical));
  assert.equal(failed[0].detail, '4,000, 6,000');
});

test('every golden scenario routes to real work and the runner grades each draft', async () => {
  const root = resolve('..');
  const routing: any = await import('../../src/modules/router/service.js');
  const routerPolicy: any = await import('../../src/modules/router/index.js');
  const privacy: any = await import('../../src/modules/privacy/index.js');
  const harness: Harness = {
    root,
    route: routing.queryStepRouter,
    contextPolicy: routerPolicy.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async id => {
      const m = await routing.loadSkillContextMetadata(id);
      return { ...m, mandatoryReferences: await routing.loadDocumentContextMetadata(m.mandatory) };
    },
    documentPrivacy: async () => ({}),
    nextOutput: async () => ({}),
  };
  const connection: Connection = { id: 'eval', provider: 'claude', mode: 'api', model: '', executable: '', ready: true, note: '' };
  const runtime = async () => ({
    adapter: { run: async () => '# ร่าง\nโปสเตอร์ 5 ชิ้น 2026-10-15 งบ 10,000 บาท ผู้รับผิดชอบ [รอยืนยัน]' },
    context: { cwd: tmpdir(), env: {} },
  });
  const results = await runGolden({ harness, runtime, connection, scenarios, runs: 1 });
  assert.deepEqual(
    results.map(r => r.status),
    scenarios.map(() => 'review'),
    'no scenario stops at a clarification or authority gate',
  );
  const torResult = results.find(r => r.scenario === 'TOR-SYN-01')!;
  assert.ok(torResult.criticalPassed);
  assert.match(torResult.route, /^playbook:tor-to-project-plan$/);
  assert.ok(torResult.references.some(p => p.endsWith('SKILL.md')));
  const text = report({ provider: 'claude', model: 'test' }, results, scenarios);
  assert.match(text, /\| TOR-SYN-01 \| 1 \| review \| pass \|/);
});

test('post-generation privacy rejection keeps its typed code and leaves the rubric ungraded', async () => {
  const { evaluationHarness } = await import('../eval/golden');
  const harness = await evaluationHarness(resolve('..'));
  const connection: Connection = { id: 'eval', provider: 'claude', mode: 'api', model: '', executable: '', ready: true, note: '' };
  const output = '# Synthetic draft\n| Full Name |\n| --- |\n| [Unconfirmed] |';
  assert.equal(harness.privacy(output).action, 'human-confirm');
  const results = await runGolden({
    harness,
    connection,
    scenarios: [tor],
    runs: 1,
    runtime: async () => ({
      adapter: { run: async () => output },
      context: { cwd: tmpdir(), env: {} },
    }),
  });
  assert.equal(results[0].status, 'error');
  assert.equal(results[0].code, 'PRIVACY_REVIEW_REQUIRED');
  assert.equal(results[0].output, output);
  assert.deepEqual(results[0].checks, []);
  assert.equal(results[0].criticalPassed, false);
  const text = report({ provider: 'claude', model: 'synthetic' }, results, [tor]);
  assert.match(text, /error \(PRIVACY_REVIEW_REQUIRED\) \| FAIL \| not graded/);
  assert.match(text, /Runs blocked before grading/);
  assert.doesNotMatch(text, /\| 0\/0 \|/);
});
