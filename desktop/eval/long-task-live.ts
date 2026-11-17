/**
 * Live long-task check: long requests staff really send (a TOR "ผมขอ TOR อีกฉบับ …", a procurement walk-through that
 * needs several STeP documents) through the real WorkService chat, a real model and the host's `skill` / `reference`
 * tools, as eval:knowledge does. It reports, per request, how the task ended, AI rounds, seconds, tool calls, repeated
 * reads, whole-prompt resends and the long-task loop events, so the same run on two builds compares them.
 *
 *   STEP_EVAL_APPROVE_LIVE=1 STEP_EVAL_PROVIDER=antigravity STEP_EVAL_ANTIGRAVITY_EXECUTABLE=<pinned agy.exe> \
 *   STEP_EVAL_MODEL=gemini-3.8-flash-medium npm run eval:long-task:live
 *
 * Runtimes as eval:knowledge (eval/skill-selection-live.ts). Requests are synthetic; nothing is sent anywhere else.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runKnowledge, type Case } from './knowledge-live';
import { liveRuntime } from './skill-selection-live';

export const LONG_TASKS: Case[] = [
  { q: 'ผมขอ TOR อีกฉบับ จัดซื้อเครื่องคอมพิวเตอร์โน้ตบุ๊ก 10 เครื่องสำหรับห้องอบรม งบประมาณ 350,000 บาท', doc: 'none' },
  {
    q: 'สรุปขั้นตอนจัดซื้อจัดจ้างของ STeP ตั้งแต่ขออนุมัติจนตรวจรับ บอกแบบฟอร์มที่ต้องใช้ในแต่ละขั้น และอ้างเอกสารของ STeP ให้ครบทุกขั้น',
    doc: ['qp-af-001', 'qp-af-002'],
  },
];

async function main(env = process.env) {
  const here = dirname(fileURLToPath(import.meta.url)),
    root = resolve(here, '../..');
  const live = await liveRuntime(env);
  const connection = { ...live.connection, model: env.STEP_EVAL_MODEL || live.connection.model };
  const started = Date.now();
  let outcomes;
  try {
    outcomes = await runKnowledge({
      root,
      cases: LONG_TASKS,
      live: { ...live, connection },
      onProgress: line => console.log(line),
    });
  } finally {
    await live.close();
  }
  const git = (args: string[]) => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  };
  const meta = {
    provider: connection.provider,
    model: connection.model || '(provider default)',
    date: new Date().toISOString(),
    harness: git(['rev-parse', '--short', 'HEAD']) + (git(['status', '--porcelain']) ? '-dirty' : ''),
    minutes: ((Date.now() - started) / 60000).toFixed(1),
  };
  const rows = outcomes.map(o => ({
    request: o.q.slice(0, 40),
    outcome: o.code || 'answered',
    rounds: o.rounds,
    seconds: Math.round(o.ms / 1000),
    tools: o.tools,
    repeats: o.repeats,
    resends: o.resends,
    loop: o.loop,
    answerChars: o.answer.length,
  }));
  const folder = join(here, '..', 'eval-results', `${meta.date.replace(/[:.]/g, '-')}-long-task`);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'results.json'), JSON.stringify({ meta, rows, outcomes }, null, 2));
  console.log(JSON.stringify({ meta, rows }, null, 2));
  console.log(`Results: ${join(folder, 'results.json')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
