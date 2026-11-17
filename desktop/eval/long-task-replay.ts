/**
 * Long-task replay: a scripted model drives the real ToolLoop and compact() through the reading pattern of a real TOR
 * run (Gemini 4 Hydrogen xhigh on Antigravity, 2026-11-17: 22 turns, 116 tool calls, mostly skill/reference/
 * read_remaining, stopped at 600 s; late turns resent 115k–165k characters at 44–78 s to first token). The documents
 * are this repository's real TOR Skill and STeP references. No AI is called and nothing leaves the computer.
 *
 * What it measures, per scenario: model turns, tool calls run, repeated reads, prompts sent whole instead of only the new
 * part (a kept Antigravity/Codex/Claude conversation sends only the new part while the prompt keeps its start), total
 * characters sent, estimated input tokens processed, estimated time and how the task ended. Time is an estimate from a
 * model fitted to the owner's diagnostics.jsonl (see `turnSeconds`), not a measurement.
 *
 *   npm run eval:long-task            # prints the table
 *   npm run eval:long-task -- --json  # machine-readable
 *
 * The script only uses ToolLoop's public run() and the host hooks; on a checkout without the long-task changes the
 * hooks are ignored, so the same script measures the old behaviour for a before/after comparison.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ToolLoop, type LoopHost } from '../electron/tool-loop';
import { compact, contextBudget, tokens } from '../electron/compact';
import type { LoopRequest } from '../src/tools';

const root = fileURLToPath(new URL('../../', import.meta.url));
const skillDir = join(root, 'skills', 'pm', 'tor-government-writing');
// Windows checkouts may turn line ends into CRLF; the replay measures the same text on every platform.
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

type Doc = { name: string; request: LoopRequest; text: string; maxPages: number };
const skill = (name: string, resource?: string): Doc => ({
  name,
  request: { tool: 'skill', input: 'tor-government-writing', ...(resource ? { args: { resource } } : {}) },
  text: read(join(skillDir, resource || 'SKILL.md')),
  maxPages: 99,
});
const reference = (id: string, maxPages = 99): Doc => ({
  name: id,
  request: { tool: 'reference', input: id },
  text: read(join(root, 'docs', 'knowledge', `${id}.md`)),
  maxPages,
});
const DOCS: Record<string, Doc> = Object.fromEntries(
  [
    skill('SKILL'),
    skill('guide', 'references/tor-drafting-guide.md'),
    skill('by-type', 'references/tor-content-by-type.md'),
    skill('source-map', 'references/procurement-source-map.md'),
    skill('adaptations', 'examples/task-adaptations.md'),
    skill('template', 'templates/tor-16-sections-template.md'),
    reference('qp-af-001'),
    reference('qp-af-002'),
    reference('afp-regulation-hierarchy'),
    reference('afp-operational-circulars'),
    reference('qm-qm-001', 6),
    // A wide reader (scenario 3) also opens the largest STeP documents and reads them to the end.
    { ...reference('qm-qm-001'), name: 'qm-qm-001-whole' },
    reference('mis-iso-document-register'),
    reference('qp-dc-001'),
    reference('hr-personnel-welfare-index'),
    reference('qp-qs-002'),
  ].map(d => [d.name, d]),
);
/** First read of everything, then the checks a high reasoning level made before writing (re-reading the same Skill). */
const FIRST = ['SKILL', 'guide', 'by-type', 'source-map', 'adaptations', 'template', 'qp-af-001', 'qp-af-002'];
const FIRST_MORE = ['afp-regulation-hierarchy', 'afp-operational-circulars', 'qm-qm-001'];
const CHECKS = [
  ['SKILL', 'by-type', 'qp-af-002', 'guide'],
  ['SKILL', 'qp-af-002', 'by-type'],
];
const WIDE = ['qm-qm-001-whole', 'mis-iso-document-register', 'qp-dc-001', 'hr-personnel-welfare-index', 'qp-qs-002'];
const PER_TURN = 5;
// From the owner's log: system ~40k characters; answer turns of a TOR draft ~20k characters.
const SYSTEM = 'Governance, routing contract, registry and tool rules for the STeP Desktop answer. '.repeat(480);
const DRAFT = 'ข้อกำหนดขอบเขตของงาน (TOR) ฉบับร่าง: รายละเอียดคุณลักษณะเฉพาะ เงื่อนไขการส่งมอบ และการตรวจรับ\n'.repeat(220);
const STEP_BUDGET_S = 600;
const STEP_CAP_S = 3 * STEP_BUDGET_S;

/**
 * Seconds for one provider turn, fitted to the owner's diagnostics.jsonl: a whole-prompt turn waits about 0.35 s per
 * 1k characters sent (15k → ~11 s, 115k–165k → 44–78 s in the TOR run); a kept conversation about 3 s plus a little per
 * 1k characters of context (30k → 3.3–4 s). An xhigh model thinks ~20 s per turn on top (600 s / 22 turns); output at
 * ~150 characters per second.
 */
function turnSeconds(full: boolean, sentChars: number, contextChars: number, outputChars: number, think = 20) {
  const ttft = full ? 3 + (0.35 * sentChars) / 1000 : 3 + (0.015 * contextChars) / 1000;
  return ttft + think + outputChars / 150;
}

type Outcome = 'draft' | 'progress-report' | 'RUN_TIMEOUT' | string;
type Result = {
  scenario: string;
  outcome: Outcome;
  turns: number;
  requests: number;
  executed: number;
  repeats: number;
  fullResends: number;
  sentChars: number;
  inputTokens: number;
  seconds: number;
};

type Options = { endless?: boolean; think?: number; failAt?: number; seed?: LoopRequest[] };
async function scenario(
  name: string,
  passes: string[][],
  { endless = false, think = 20, failAt, seed = [] }: Options = {},
): Promise<Result & { reads: LoopRequest[] }> {
  let reads: LoopRequest[] = [];
  let now = 0,
    turns = 0,
    requests = 0,
    executed = 0,
    repeats = 0,
    fullResends = 0,
    sentChars = 0,
    inputTokens = 0,
    sent = '';
  const budget = contextBudget({ provider: 'antigravity', model: 'gemini-4-hydrogen-xhigh' });
  const controller = new AbortController();
  const host: LoopHost & Record<string, unknown> = {
    enabled: () => true,
    check: async () => {},
    readOnly: () => true,
    outgoing: async text => text,
    execute: async r => {
      executed++;
      const doc = Object.values(DOCS).find(d => JSON.stringify(d.request) === JSON.stringify({ ...r }));
      if (!doc) throw new Error('INVALID_INPUT');
      return doc.text;
    },
    observe: t => {
      if ((t as { repeat?: boolean }).repeat) repeats++;
    },
    // The same hooks service.ts wires (ignored by a ToolLoop without them).
    deadline: () => now >= STEP_CAP_S - STEP_BUDGET_S,
    tooLarge: (text: string) => tokens(SYSTEM + text) > budget * 0.6,
    reads: (requests: LoopRequest[]) => (reads = requests),
  };
  const loop = new ToolLoop(host);

  // The scripted model: works through PASSES, paging every document to its end (or maxPages), PER_TURN requests a turn.
  type Task = { doc: Doc; id?: string; offset?: number; pages: number; done: boolean };
  let pass = 0;
  let tasks: Task[] = passes[0].map(n => ({ doc: DOCS[n], pages: 0, done: false }));
  let inFlight: Task[] = [];
  const nextPass = () => {
    pass++;
    const names = endless ? passes[1 + (pass % (passes.length - 1))] : passes[pass];
    if (!names) return false;
    tasks = names.map(n => ({ doc: DOCS[n], pages: 0, done: false }));
    return true;
  };
  let resumed = false;
  const model = (prompt: string): { reply: string; output: number } => {
    // A resumed attempt starts with the earlier reads given back: those documents continue from where they are.
    if (!resumed && prompt.includes('previous attempt')) {
      resumed = true;
      const requests = JSON.parse(prompt.match(/<tool_history>\n(.+)\n<\/tool_history>/)![1]).requests;
      const rows = JSON.parse(prompt.match(/<tool_results>\n(.+)\n<\/tool_results>/)![1]);
      requests.forEach((r: LoopRequest, i: number) => {
        const task = tasks.find(t => JSON.stringify(t.doc.request) === JSON.stringify(r));
        if (!task || !rows[i]?.ok) return;
        task.id = rows[i].id;
        task.pages = 1;
        if (rows[i].nextOffset === undefined || task.doc.maxPages <= 1) task.done = true;
        else task.offset = rows[i].nextOffset;
      });
    }
    if (/<tool_limit>/.test(prompt.slice(-4000)) || prompt.includes('No tools ran. Write the complete answer now.')) {
      const finalTurn = prompt.includes('time for this message is nearly used up');
      return finalTurn || !/No more tool turns/.test(prompt.slice(-4000))
        ? { reply: DRAFT, output: DRAFT.length }
        : { reply: 'PROGRESS_REPORT', output: 1500 };
    }
    const blocks = [...prompt.matchAll(/<tool_results>\n(.+)\n<\/tool_results>/g)];
    if (inFlight.length && blocks.length) {
      const rows = JSON.parse(blocks.at(-1)![1]);
      inFlight.forEach((task, i) => {
        const row = rows[i];
        if (!row?.ok || row.repeat) return void (task.done = true);
        task.id = row.id;
        task.pages++;
        if (row.nextOffset === undefined || task.pages >= task.doc.maxPages) task.done = true;
        else task.offset = row.nextOffset;
      });
    }
    let open = tasks.filter(t => !t.done);
    while (!open.length) {
      if (!nextPass()) return { reply: DRAFT, output: DRAFT.length };
      open = tasks.filter(t => !t.done);
    }
    inFlight = open.slice(0, PER_TURN);
    requests += inFlight.length;
    return {
      reply: inFlight
        .map(t => {
          const r = t.id ? { tool: 'read_remaining', input: t.id, args: { offset: t.offset } } : t.doc.request;
          return '```step-tool\n' + JSON.stringify(r) + '\n```';
        })
        .join('\n'),
      output: 300,
    };
  };

  const provider = async (next: string) => {
    // As service.ts callProvider: compact against the model's budget before every call.
    const prompt = (
      await compact(next, {
        system: SYSTEM,
        budget,
        state: 'route: GENERAL',
        signal: controller.signal,
        summarize: async () => 'summary',
        privacy: text => text,
      })
    ).prompt;
    const full = !(sent && prompt.startsWith(sent));
    const chars = full ? SYSTEM.length + prompt.length : prompt.length - sent.length;
    if (full && sent) fullResends++;
    sent = prompt;
    sentChars += chars;
    inputTokens += tokens(SYSTEM + prompt);
    turns++;
    if (turns === failAt) throw new Error('PROVIDER_QUOTA');
    const { reply, output } = model(prompt);
    const seconds = turnSeconds(full, chars, SYSTEM.length + prompt.length, output, think);
    // service.ts: each completed turn re-arms a 600 s budget, up to 1800 s for the step.
    if (seconds > STEP_BUDGET_S || now + seconds > STEP_CAP_S) {
      now = Math.min(now + seconds, STEP_CAP_S);
      controller.abort();
      throw new Error('RUN_TIMEOUT');
    }
    now += seconds;
    return reply;
  };
  let outcome: Outcome;
  try {
    const answer = await loop.run(
      '<current_message>\nผมขอ TOR อีกฉบับ จัดซื้อครุภัณฑ์คอมพิวเตอร์\n</current_message>',
      provider,
      controller.signal,
      seed,
    );
    outcome = answer === DRAFT ? 'draft' : answer === 'PROGRESS_REPORT' ? 'progress-report' : answer.slice(0, 40);
  } catch (error) {
    outcome = (error as Error).message;
  }
  return {
    scenario: name,
    outcome,
    turns,
    requests,
    executed,
    repeats,
    fullResends,
    sentChars,
    inputTokens,
    seconds: Math.round(now),
    reads,
  };
}

export async function replayScenarios(): Promise<Result[]> {
  // 5: the first attempt stops at turn 6 (quota), the person presses "ลองอีกครั้ง"; the row is the second attempt.
  const stopped = await scenario('5 first attempt', [[...FIRST, ...FIRST_MORE], ...CHECKS], { failAt: 6 });
  const rows = [
    await scenario('1 TOR: read, re-check twice, write', [[...FIRST, ...FIRST_MORE], ...CHECKS]),
    await scenario('2 TOR: keeps re-checking (never satisfied)', [[...FIRST, ...FIRST_MORE], ...CHECKS], { endless: true }),
    await scenario('3 TOR: reads every large STeP document', [[...FIRST, ...FIRST_MORE, ...WIDE], ...CHECKS]),
    // The same wide reading on a slower turn (an xhigh model thinking a minute and a half per turn).
    await scenario('4 TOR: wide reading, 90 s thinking per turn', [[...FIRST, ...FIRST_MORE, ...WIDE], ...CHECKS], { think: 90 }),
    await scenario('5 TOR: "ลองอีกครั้ง" after a stop at turn 6', [[...FIRST, ...FIRST_MORE], ...CHECKS], { seed: stopped.reads }),
  ];
  return rows.map(({ reads: _reads, ...row }) => row);
}
async function main() {
  const rows = await replayScenarios();
  if (process.argv.includes('--json')) return console.log(JSON.stringify(rows, null, 2));
  for (const r of rows)
    console.log(
      [
        r.scenario.padEnd(44),
        `outcome=${r.outcome}`,
        `turns=${r.turns}`,
        `requests=${r.requests}`,
        `run=${r.executed}`,
        `repeats=${r.repeats}`,
        `fullResends=${r.fullResends}`,
        `sent=${(r.sentChars / 1000).toFixed(0)}k chars`,
        `input≈${(r.inputTokens / 1000).toFixed(0)}k tokens`,
        `time≈${Math.floor(r.seconds / 60)}m${String(r.seconds % 60).padStart(2, '0')}s`,
      ].join('  '),
    );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
