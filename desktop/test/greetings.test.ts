import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../electron/store';
import { Greetings, greetingInput, parseGreetings, type GreetingContext } from '../electron/greetings';
import type { MemoryEntry } from '../src/types';

const lines = [
  'เริ่มจากไอเดียไหนดี',
  'วันนี้อยากลองอะไรใหม่',
  'มาช่วยกันคิดให้ชัดขึ้น',
  'อยากให้ช่วยจัดเรื่องไหนก่อน',
  'มีอะไรอยากเล่าให้ฟัง',
];
const reply = JSON.stringify({ headlines: lines });
const context = (scope = 'work-one', fingerprint = 'source-one'): GreetingContext => ({
  scope,
  fingerprint,
  language: 'th',
  input: 'Confirmed preferences',
  names: ['ชื่อทดสอบ'],
  connection: {
    id: 'fixture',
    provider: 'openai',
    mode: 'subscription',
    model: 'chosen-model',
    ready: true,
    executable: '',
    note: 'Synthetic',
  },
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
const memory = (id: string, patch: Partial<MemoryEntry> = {}): MemoryEntry => ({
  schema_version: 1,
  id,
  name: id,
  text: id,
  type: 'project',
  scope: 'private',
  importance: 0.9,
  ttl_days: 0,
  created_at: '2026-11-03',
  updated_at: '2026-11-03',
  source: 'user-confirmed',
  ...patch,
});

test('the greeting input uses established USER.md fields, excludes names, and selects five confirmed live memories with user preferences first', () => {
  const raw =
    '## User Profile\n- **ชื่อ / ชื่อเรียก (Name/Nickname)**: ชื่อทดสอบ\n- **บทบาทหน้าที่ (Role/Function)**: ช่วยสื่อสาร\n' +
    '## Working Preferences\n- ชอบตาราง\n## Active Projects\n- งานสร้างสรรค์\n';
  const input = greetingInput(
    raw,
    [
      ...Array.from({ length: 6 }, (_, i) => memory('project-' + i)),
      memory('preference', { type: 'user', importance: 0.1 }),
      memory('expired', { expired: true }),
      memory('unconfirmed', { source: 'pending' as any }),
    ],
    'th',
  );
  assert.ok(!input.includes('ชื่อทดสอบ'));
  assert.ok(input.includes('ช่วยสื่อสาร'));
  assert.ok(input.includes('งานสร้างสรรค์'));
  const data = JSON.parse(input);
  assert.equal(data.memories.length, 5);
  assert.equal(data.memories[0].text, 'preference');
  assert.ok(!input.includes('expired') && !input.includes('unconfirmed'));
});

test('untrusted output is bounded plain text: malformed JSON, names, links, markup and privacy findings are withheld', () => {
  assert.deepEqual(
    parseGreetings('not JSON', [], () => true),
    [],
  );
  assert.deepEqual(
    parseGreetings(
      JSON.stringify({ headlines: [lines[0], lines[0], 'Hello ชื่อทดสอบ', '# Heading', 'https://example.com', 'a'.repeat(81)] }),
      ['ชื่อทดสอบ'],
      () => true,
    ),
    [lines[0]],
  );
  assert.deepEqual(
    parseGreetings(reply, [], () => true, 'en'),
    [],
  );
  assert.deepEqual(
    parseGreetings(JSON.stringify({ headlines: ['Where shall we start?'] }), [], () => true, 'th'),
    [],
  );
  for (const text of ['line\nbreak', '<script>bad</script>', 'private detail'])
    assert.deepEqual(
      parseGreetings(JSON.stringify({ headlines: [text] }), [], line => !line.includes('private')),
      [],
    );
});

test('a visit returns immediately while the provider is slow; a batch is used only on later visits without creating sessions', async () => {
  const store = new Store(':memory:');
  const generated = deferred<string>();
  let calls = 0;
  const service = new Greetings(
    store,
    async () => {
      calls++;
      return generated.promise;
    },
    () => true,
  );
  const load = async () => context();
  assert.deepEqual(await service.visit(load, 'th'), { headline: 'เริ่มจากเรื่องไหนดี' });
  assert.deepEqual(await service.visit(load, 'th'), { headline: 'เริ่มจากเรื่องไหนดี' });
  generated.resolve(reply);
  await service.settled();
  const seen: string[] = [];
  for (let i = 0; i < 7; i++) seen.push((await service.visit(load, 'th')).headline);
  assert.deepEqual(seen.slice(0, 5), lines);
  assert.ok(seen.every((line, i) => !i || line !== seen[i - 1]));
  assert.equal(calls, 1);
  assert.equal(store.list('session').length, 0);
  await service.close();
  store.close();
});

test('concurrent visits share one generation attempt and failed generations do not retry on every render', async () => {
  const store = new Store(':memory:');
  let calls = 0;
  const service = new Greetings(
    store,
    async () => {
      calls++;
      throw new Error('CONNECTION_OFFLINE');
    },
    () => true,
  );
  const load = async () => context();
  await Promise.all(Array.from({ length: 8 }, () => service.visit(load, 'th')));
  await service.settled();
  await service.visit(load, 'th');
  await service.settled();
  assert.equal(calls, 1);
  await service.close();
  store.close();
});

test('an incomplete or duplicate batch is not cached as a repeatedly shown single headline', async () => {
  const store = new Store(':memory:');
  const service = new Greetings(
    store,
    async () => JSON.stringify({ headlines: Array(5).fill(lines[0]) }),
    () => true,
  );
  const load = async () => context();
  await service.visit(load, 'th');
  await service.settled();
  assert.equal((await service.visit(load, 'th')).headline, 'เริ่มจากเรื่องไหนดี');
  assert.equal(store.list<any>('greeting')[0].headlines.length, 0);
  await service.close();
  store.close();
});

test('the next local day refreshes once and preserves the last shown headline across regeneration', async () => {
  const store = new Store(':memory:');
  let date = new Date(2026, 10, 3, 23, 59),
    calls = 0;
  const service = new Greetings(
    store,
    async () => {
      calls++;
      return reply;
    },
    () => true,
    () => date,
  );
  const load = async () => context();
  await service.visit(load, 'th');
  await service.settled();
  for (let i = 0; i < 5; i++) await service.visit(load, 'th');
  date = new Date(2026, 10, 4, 0, 1);
  const before = (await service.visit(load, 'th')).headline;
  await service.settled();
  const after = (await service.visit(load, 'th')).headline;
  assert.notEqual(after, before);
  assert.equal(calls, 2);
  await service.close();
  store.close();
});

test('a memory/profile change during generation discards its result even without another UI visit', async () => {
  const store = new Store(':memory:');
  const first = deferred<string>();
  let current = context(),
    calls = 0;
  const service = new Greetings(
    store,
    async () => (++calls === 1 ? first.promise : reply),
    () => true,
  );
  const load = async () => current;
  await service.visit(load, 'th');
  current = context('work-one', 'updated-memory');
  first.resolve(reply);
  await service.settled();
  assert.equal(store.list<any>('greeting')[0].headlines.length, 0);
  assert.equal((await service.visit(load, 'th')).headline, 'เริ่มจากเรื่องไหนดี');
  await service.settled();
  assert.equal((await service.visit(load, 'th')).headline, lines[0]);
  assert.equal(calls, 2);
  await service.close();
  store.close();
});

test('switching workspace/model cancels obsolete generation, keeps batches separate and sends the chosen model', async () => {
  const store = new Store(':memory:');
  const delayed = deferred<string>();
  const models: string[] = [],
    signals: AbortSignal[] = [];
  const service = new Greetings(
    store,
    async (c, signal) => {
      models.push(c.connection.model || '');
      signals.push(signal);
      return c.scope === 'work-one' ? delayed.promise : reply;
    },
    () => true,
  );
  await service.visit(async () => context(), 'th');
  const second = { ...context('work-two'), connection: { ...context().connection, model: 'other-chosen-model' } };
  await service.visit(async () => second, 'th');
  assert.equal(signals[0].aborted, true);
  delayed.resolve(JSON.stringify({ headlines: ['OLD WORKSPACE'] }));
  await service.settled();
  assert.equal((await service.visit(async () => second, 'th')).headline, lines[0]);
  assert.equal(
    store.list<any>('greeting').some(batch => batch.headlines.includes('OLD WORKSPACE')),
    false,
  );
  assert.deepEqual(models, ['chosen-model', 'other-chosen-model']);
  await service.close();
  store.close();
});

test('missing or denied context falls back; cached output is rechecked under the current privacy policy', async () => {
  const store = new Store(':memory:');
  let allowed = true;
  const service = new Greetings(
    store,
    async () => reply,
    () => allowed,
  );
  const load = async () => context();
  assert.equal(
    (
      await service.visit(async () => {
        throw new Error('PATH_RULE_DENIED');
      }, 'en')
    ).headline,
    'Where shall we start?',
  );
  await service.visit(load, 'th');
  await service.settled();
  allowed = false;
  assert.equal((await service.visit(load, 'th')).headline, 'เริ่มจากเรื่องไหนดี');
  assert.equal((await service.visit(async () => undefined, 'th')).headline, 'เริ่มจากเรื่องไหนดี');
  await service.close();
  store.close();
});

test('a restart retains the rotation and does not call the provider again for the same day and context', async () => {
  const store = new Store(':memory:');
  const load = async () => context();
  let calls = 0;
  const first = new Greetings(
    store,
    async () => {
      calls++;
      return reply;
    },
    () => true,
  );
  await first.visit(load, 'th');
  await first.settled();
  const before = (await first.visit(load, 'th')).headline;
  await first.close();
  const next = new Greetings(
    store,
    async () => {
      calls++;
      return reply;
    },
    () => true,
  );
  assert.notEqual((await next.visit(load, 'th')).headline, before);
  assert.equal(calls, 1);
  await next.close();
  store.close();
});

test('shutdown cancels the provider and waits before the store closes', async () => {
  const store = new Store(':memory:');
  let stopped = false;
  const service = new Greetings(
    store,
    async (_c, signal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            stopped = true;
            reject(new Error('CANCELLED'));
          },
          { once: true },
        );
      }),
    () => true,
  );
  await service.visit(async () => context(), 'th');
  await service.close();
  assert.equal(stopped, true);
  store.close();
});

test('leaving home cancels a pending context approval and permits a later visit to retry it', async () => {
  const store = new Store(':memory:');
  let calls = 0;
  const service = new Greetings(
    store,
    async (_context, signal) => {
      if (++calls > 1) return reply;
      return new Promise<string>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('CANCELLED')), { once: true }),
      );
    },
    () => true,
  );
  const load = async () => context();
  await service.visit(load, 'th', 'first');
  service.leave('first');
  await service.visit(load, 'th', 'second');
  await service.settled();
  assert.equal((await service.visit(load, 'th', 'third')).headline, lines[0]);
  assert.equal(calls, 2);
  await service.close();
  store.close();
});

test('leaving before local context loads sends nothing; an approved generation can finish after leaving home', async () => {
  const store = new Store(':memory:');
  const loaded = deferred<GreetingContext>();
  const generated = deferred<string>();
  let calls = 0;
  const service = new Greetings(
    store,
    async (_context, _signal, approved) => {
      calls++;
      approved();
      return generated.promise;
    },
    () => true,
  );
  const early = service.visit(() => loaded.promise, 'th', 'early');
  service.leave('early');
  loaded.resolve(context());
  await early;
  assert.equal(calls, 0);
  await service.visit(async () => context(), 'th', 'approved');
  service.leave('old-unmounted-view'); // A stale cleanup cannot cancel the current visit.
  service.leave('approved');
  generated.resolve(reply);
  await service.settled();
  assert.equal((await service.visit(async () => context(), 'th', 'return')).headline, lines[0]);
  assert.equal(calls, 1);
  await service.close();
  store.close();
});
