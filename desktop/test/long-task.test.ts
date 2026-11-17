import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolLoop, FINAL_TURN, type LoopHost } from '../electron/tool-loop';

// Long-task behaviour seen in real runs (synthetic data): a high-reasoning model re-reading the same Skill, paging through
// long references, a conversation that outgrows the context budget, and a step that runs out of time mid-read.
const request = (tool: string, input = '', args?: unknown) => '```step-tool\n' + JSON.stringify({ tool, input, args }) + '\n```';
const signal = () => new AbortController().signal;
const results = (prompt: string) => [...prompt.matchAll(/<tool_results>\n(.+)\n<\/tool_results>/g)].map(m => JSON.parse(m[1]));
function host(extra: Partial<LoopHost> = {}): LoopHost {
  return {
    enabled: () => true,
    check: async () => {},
    readOnly: () => true,
    execute: async r => `content of ${r.input}`,
    outgoing: async t => t,
    ...extra,
  };
}

test('reading the same Skill again points at the earlier result instead of running and repeating it', async () => {
  const executed: string[] = [],
    traces: { tool: string; repeat?: boolean }[] = [];
  const loop = new ToolLoop(
    host({ execute: async r => (executed.push(r.input), 'ข้อกำหนดขอบเขตของงาน '.repeat(40)), observe: t => traces.push(t) }),
  );
  let turn = 0,
    firstId = '';
  const answer = await loop.run(
    'ร่าง TOR',
    async prompt => {
      turn++;
      if (turn === 1) return request('skill', 'tor-government-writing');
      if (turn === 2) {
        firstId = results(prompt)[0][0].id;
        // Same Skill again, plus a different resource of it, which is a new read.
        return request('skill', 'tor-government-writing') + request('skill', 'tor-government-writing', { resource: 'references/a.md' });
      }
      if (turn === 3) {
        const [again, other] = results(prompt)[1];
        assert.equal(again.ok, true);
        assert.equal(again.repeat, true);
        assert.equal(again.id, firstId);
        assert.doesNotMatch(again.text, /ข้อกำหนด/, 'the text is not sent a second time');
        assert.match(again.text, /read_remaining/);
        assert.notEqual(other.repeat, true);
        // The earlier text is still one call away.
        return request('read_remaining', firstId, { offset: 0 });
      }
      assert.match(results(prompt)[2][0].text, /ข้อกำหนดขอบเขตของงาน/);
      return 'ร่าง TOR พร้อมตรวจ';
    },
    signal(),
  );
  assert.equal(answer, 'ร่าง TOR พร้อมตรวจ');
  assert.deepEqual(executed, ['tor-government-writing', 'tor-government-writing'], 'the Skill and its resource ran once each');
  assert.deepEqual(
    traces.map(t => [t.tool, t.repeat === true]),
    [
      ['skill', false],
      ['skill', true],
      ['skill', false],
      ['read_remaining', false],
    ],
  );
});

test('a read that failed or ran in another message is read again, not answered from the cache', async () => {
  let calls = 0;
  const loop = new ToolLoop(
    host({
      execute: async () => {
        if (++calls === 1) throw new Error('REFERENCE_UNAVAILABLE');
        return 'section text';
      },
    }),
  );
  let turn = 0;
  await loop.run(
    'q',
    async prompt => {
      if (++turn <= 2) return request('reference', 'qp-af-002');
      assert.equal(results(prompt)[1][0].ok, true);
      assert.notEqual(results(prompt)[1][0].repeat, true);
      return 'done';
    },
    signal(),
  );
  assert.equal(calls, 2);
  turn = 0;
  await loop.run('next message', async () => (++turn === 1 ? request('reference', 'qp-af-002') : 'done'), signal());
  assert.equal(calls, 3, 'the cache lasts one run only');
});

test('Skill and document reads page three times larger than other results', async () => {
  const text = 'x'.repeat(100);
  const loop = new ToolLoop(host({ execute: async () => text }), 8, 10);
  let turn = 0;
  await loop.run(
    'q',
    async prompt => {
      if (++turn === 1) return request('reference', 'doc') + request('files', 'a.txt');
      const [ref, file] = results(prompt)[0];
      assert.equal(ref.text.length, 30);
      assert.equal(ref.nextOffset, 30);
      assert.equal(file.text.length, 10);
      return 'done';
    },
    signal(),
  );
});

test('a large conversation folds earlier results once, keeps them readable and keeps each prompt a prefix of the next', async () => {
  const prompts: string[] = [];
  const loop = new ToolLoop(
    host({ execute: async r => `${r.input}:` + 'ก'.repeat(3000), tooLarge: text => text.length > 12_000 }),
    40,
    2000,
  );
  let turn = 0,
    firstId = '';
  await loop.run(
    'ร่าง TOR',
    async prompt => {
      prompts.push(prompt);
      turn++;
      if (turn === 1) return request('reference', 'doc-1');
      if (turn === 2) firstId = results(prompt)[0][0].id;
      if (turn <= 5) return request('reference', `doc-${turn}`);
      if (turn === 6) return request('read_remaining', firstId, { offset: 2900 });
      // The folded first result is whole again through its id.
      assert.match(results(prompt).at(-1)![0].text, /^ก+/);
      return 'done';
    },
    signal(),
  );
  const folds = prompts.slice(1).filter((p, i) => !p.startsWith(prompts[i]));
  assert.equal(folds.length, 1, 'only the turn that folded starts differently; the others only append');
  const folded = prompts.find(p => p.includes('"folded":true'))!;
  assert.match(folded, new RegExp(`read_remaining with id ${firstId}`));
  // The newest result stays whole when the fold happens.
  const last = results(folded).at(-1)![0];
  assert.equal(last.folded, undefined);
});

test('when the time is nearly spent the model answers from what it has read and no further tool runs', async () => {
  let late = false,
    executed = 0;
  const loop = new ToolLoop(host({ execute: async r => (executed++, `content of ${r.input}`), deadline: () => late }));
  let turn = 0;
  const answer = await loop.run(
    'ร่าง TOR',
    async prompt => {
      turn++;
      if (turn === 1) return request('skill', 'tor-government-writing');
      if (turn === 2) {
        late = true;
        return request('reference', 'qp-af-002');
      }
      if (turn === 3) {
        assert.ok(prompt.endsWith(FINAL_TURN) || prompt.includes(FINAL_TURN));
        // A model that still asks gets a refusal, not a run.
        return request('reference', 'qp-af-003');
      }
      assert.equal(results(prompt).at(-1)![0].code, 'TIME_BUDGET_SPENT');
      return 'ร่าง TOR จากข้อมูลที่อ่านแล้ว (ส่วนที่ยังไม่ได้ตรวจทำเครื่องหมายไว้)';
    },
    signal(),
  );
  assert.match(answer, /ร่าง TOR/);
  assert.equal(executed, 2, 'the request made as the deadline arrived still ran; nothing ran after the notice');
  assert.equal(turn, 4);
});

test('the native bridge refuses calls past the deadline and reports each answered call as progress', async () => {
  let late = false,
    progress = 0;
  const loop = new ToolLoop(host({ deadline: () => late, progress: () => progress++ }));
  await loop.run(
    'q',
    async () => {
      const first = await loop.bridge({ tool: 'reference', input: 'doc' }, signal());
      assert.equal(first.ok, true);
      late = true;
      const second = await loop.bridge({ tool: 'reference', input: 'doc-2' }, signal());
      assert.equal(second.ok, false);
      assert.equal(second.code, 'TIME_BUDGET_SPENT');
      assert.match(second.hint!, /write the complete answer now/);
      return 'done';
    },
    signal(),
  );
  assert.equal(progress, 1);
});

test('a model that only re-reads what it already has is asked to write the answer after two such turns', async () => {
  let executed = 0;
  const loop = new ToolLoop(host({ execute: async r => (executed++, `content of ${r.input}`) }));
  let turn = 0;
  const answer = await loop.run(
    'ร่าง TOR',
    async prompt => {
      turn++;
      if (prompt.includes('already read in this message')) return 'ร่าง TOR';
      return turn === 1
        ? request('skill', 'tor-government-writing') + request('reference', 'qp-af-002')
        : request('skill', 'tor-government-writing');
    },
    signal(),
  );
  assert.equal(answer, 'ร่าง TOR');
  assert.equal(executed, 2);
  assert.equal(turn, 4, 'one reading turn, two re-reading turns, then the answer');
});

test('a stopped task gets its reads back on the next attempt without model turns, through the normal gates', async () => {
  const executed: string[] = [],
    checked: string[] = [];
  let reported: unknown[] = [];
  const first = new ToolLoop(
    host({
      execute: async r => (executed.push(r.input), `content of ${r.input}`),
      reads: requests => (reported = requests),
    }),
  );
  let turn = 0;
  // The first attempt reads a Skill, a resource and a file, then the provider fails.
  await assert.rejects(
    first.run(
      'ร่าง TOR',
      async () => {
        if (++turn === 1)
          return (
            request('skill', 'tor-government-writing') +
            request('skill', 'tor-government-writing', { resource: 'references/tor-drafting-guide.md' }) +
            request('files', 'notes.txt')
          );
        throw new Error('PROVIDER_NETWORK');
      },
      signal(),
    ),
    /PROVIDER_NETWORK/,
  );
  // Only static reads are reported, as requests (no text); a workspace file may change, so it is read again if needed.
  assert.deepEqual(reported, [
    { tool: 'skill', input: 'tor-government-writing' },
    { tool: 'skill', input: 'tor-government-writing', args: { resource: 'references/tor-drafting-guide.md' } },
  ]);
  assert.doesNotMatch(JSON.stringify(reported), /content of/);
  executed.length = 0;
  const second = new ToolLoop(
    host({
      check: async () => void checked.push('check'),
      execute: async r => (executed.push(r.input), `content of ${r.input}`),
      outgoing: async t => (checked.push('outgoing'), t),
    }),
  );
  const prompts: string[] = [];
  const answer = await second.run(
    'ร่าง TOR',
    async prompt => {
      prompts.push(prompt);
      return 'ร่าง TOR';
    },
    signal(),
    [...(reported as any[]), { tool: 'files', input: 'x' }, ...(reported as any[])],
  );
  assert.equal(answer, 'ร่าง TOR');
  assert.equal(prompts.length, 1, 'the reads cost no model turn');
  assert.match(prompts[0], /previous attempt/);
  assert.match(prompts[0], /content of tor-government-writing/);
  assert.deepEqual(executed, ['tor-government-writing', 'tor-government-writing'], 'duplicates and non-static seeds are dropped');
  assert.ok(checked.includes('check') && checked.filter(c => c === 'outgoing').length === 2, 'seeds pass the host check and outgoing scan');
  assert.equal(second.stats.seeded, 2);
  // A seeded read counts as read: asking again is a repeat.
});

test('the loop reports why the model was asked to write now, and its stats go to the trace', async () => {
  const reasons: string[] = [];
  let late = false;
  const loop = new ToolLoop(host({ deadline: () => late, finalTurn: reason => reasons.push(reason) }));
  let turn = 0;
  await loop.run(
    'q',
    async () => {
      if (++turn === 1) return request('skill', 'a');
      if (turn === 2) return request('skill', 'a');
      late = true;
      return turn === 3 ? request('skill', 'b') : 'done';
    },
    signal(),
  );
  assert.deepEqual(reasons, ['deadline']);
  assert.deepEqual(loop.stats, { folds: 0, repeats: 1, seeded: 0, final: 'deadline' });
});

test('a seeded read that the gates now refuse is left out, not given back', async () => {
  const loop = new ToolLoop(
    host({
      execute: async r => {
        if (r.input === 'withdrawn') throw new Error('TOOL_DENIED');
        return `content of ${r.input}`;
      },
    }),
  );
  let prompt = '';
  await loop.run('q', async p => ((prompt = p), 'done'), signal(), [
    { tool: 'reference', input: 'withdrawn' },
    { tool: 'reference', input: 'qp-af-002' },
  ]);
  assert.match(prompt, /content of qp-af-002/);
  assert.doesNotMatch(prompt, /withdrawn/);
  assert.equal(loop.stats.seeded, 1);
});

test('a model that keeps asking after the final-turn notice is not given more turns', async () => {
  const run = async (prefix: string) => {
    let turns = 0;
    const loop = new ToolLoop(host({ deadline: () => true }));
    try {
      return { answer: await loop.run('q', async () => (turns++, prefix + request('reference', `doc-${turns}`)), signal()), turns };
    } catch (error) {
      return { error: (error as Error).message, turns };
    }
  };
  // Its own words are kept as the answer; with none, the tool-turn limit stands. Two turns either way, not forty.
  assert.deepEqual(await run('สรุปจากที่อ่านแล้ว\n'), { answer: 'สรุปจากที่อ่านแล้ว', turns: 2 });
  assert.deepEqual(await run(''), { error: 'TOOL_TURN_LIMIT', turns: 2 });
});
