import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { StatefulReplManager, StatefulReplSession, persistentScript } from '../electron/stateful-repl';

const worker = resolve('electron/repl-worker.cjs');
const opened: { stop(): void }[] = [];
const open = (id: string) => {
  const session = new StatefulReplSession(id, worker);
  opened.push(session);
  return session;
};
test.after(() => opened.forEach(session => session.stop()));

test('StatefulReplSession preserves variables and functions across multiple evaluation turns', async () => {
  const session = open('test-session-1');

  // Turn 1: define variables and function
  const turn1 = await session.eval(`
    const multiplier = 3;
    let base = 10;
    function compute(val) {
      return (val + base) * multiplier;
    }
    compute(5);
  `);
  assert.equal(turn1.error, undefined);
  assert.equal(turn1.result, '45'); // (5 + 10) * 3

  // Turn 2: mutate variable and invoke function again
  const turn2 = await session.eval(`
    base = 20;
    compute(5);
  `);
  assert.equal(turn2.error, undefined);
  assert.equal(turn2.result, '75'); // (5 + 20) * 3
});

test('StatefulReplSession captures console logs and errors', async () => {
  const session = open('test-session-2');
  const turn = await session.eval(`
    console.log("Processing item", 101);
    console.warn("Notice: demo value");
    "finished";
  `);
  assert.equal(turn.error, undefined);
  assert.equal(turn.result, 'finished');
  assert.ok(turn.output.includes('Processing item 101'));
  assert.ok(turn.output.includes('[WARN] Notice: demo value'));
});

test('StatefulReplSession catches errors gracefully without terminating session', async () => {
  const session = open('test-session-3');
  await session.eval('const x = 100;');

  const failingTurn = await session.eval('unknownFunction();');
  assert.ok(failingTurn.error?.includes('unknownFunction is not defined'));

  // Session remains intact and x is still accessible
  const nextTurn = await session.eval('x + 5;');
  assert.equal(nextTurn.error, undefined);
  assert.equal(nextTurn.result, '105');
});

test('StatefulReplSession reset clears state', async () => {
  const session = open('test-session-4');
  await session.eval('const secret = 42;');
  session.reset();

  const turn = await session.eval('typeof secret;');
  assert.equal(turn.result, 'undefined');
});

test('StatefulReplManager maintains isolated sessions by sessionId', async () => {
  const manager = new StatefulReplManager();
  opened.push({ stop: () => manager.close() });
  const sessionA = manager.session('session-A', worker);
  const sessionB = manager.session('session-B', worker);

  await sessionA.eval('const token = "AAA";');
  await sessionB.eval('const token = "BBB";');

  assert.equal((await sessionA.eval('token')).result, 'AAA');
  assert.equal((await sessionB.eval('token')).result, 'BBB');
});

test('the REPL context holds no host objects, so the usual vm escapes reach no Node process', async () => {
  const session = open('test-escape');
  for (const code of [
    'typeof process + typeof require + typeof Buffer + typeof module + typeof setTimeout',
    'this.constructor.constructor("return typeof process")()',
    'console.log.constructor("return typeof process")()',
    'parseInt.constructor("return typeof process")()',
    'JSON.stringify.constructor("return typeof process")()',
    'Object.getPrototypeOf(console.log).constructor("return typeof process")()',
  ]) {
    const turn = await session.eval(code);
    assert.equal(turn.error, undefined, code);
    assert.match(turn.result || '', /^(?:undefined)+$/, code);
  }
  const frames = await session.eval(`
    Error.prepareStackTrace = (_e, sites) => sites.map(site => {
      try { return site.getThis()?.constructor?.constructor('return typeof process')(); } catch { return 'blocked'; }
    }).join(',');
    new Error('probe').stack;
  `);
  assert.doesNotMatch(frames.result || '', /object/);
  assert.match(
    (await session.eval('new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); 1')).error || '',
    /disallowed|not allowed|WebAssembly/i,
  );
});

test('the time limit covers result formatting, thrown values and promise callbacks, not only the script', async () => {
  const session = open('test-timeout');
  for (const code of [
    'while (true) {}',
    '({ toJSON() { while (true) {} } })',
    '({ toJSON: undefined, get a() { while (true) {} } })',
    'new Proxy({}, { ownKeys() { while (true) {} }, get() { while (true) {} } })',
    'throw { get message() { while (true) {} } }',
    'throw new Proxy({}, { has() { while (true) {} } })',
    'console.log({ toJSON() { while (true) {} } }); 1',
    'Promise.resolve().then(() => { while (true) {} }); 1',
  ]) {
    const started = Date.now();
    const turn = await session.eval(code, 500);
    assert.match(turn.error || '', /timed out after 500ms/, code);
    assert.ok(Date.now() - started < 3000, code);
  }
  // The session stays usable after a timeout.
  assert.equal((await session.eval('1 + 1')).result, '2');
});

test('tampering with built-ins inside the REPL cannot hand the host an unreadable value', async () => {
  const session = open('test-tamper');
  const turn = await session.eval(
    'JSON.stringify = () => { throw new Proxy({}, {}); }; Array.prototype.join = () => 1; String = null; console.log("ok"); 5',
  );
  assert.equal(turn.result, '5');
  assert.equal(turn.output, 'ok');
  assert.equal((await session.eval('throw new Proxy({}, {})')).error, '{}');
});

test('only top-level let, const and class declarations are rewritten, never blocks or text', async () => {
  assert.equal(persistentScript('const a = 1;\nlet b = 2, c = 3;'), 'var a = 1;\nvar b = 2, c = 3;');
  assert.equal(persistentScript('class K {}'), 'var K = class K {};');
  for (const unchanged of [
    'function f() { const d = 4; return d; }',
    '{ let inner = 1; }',
    'if (true) { const inner = 1; }',
    'for (let i = 0; i < 2; i++) { const j = i; }',
    'const_value = 1;',
    'x = "line one\\nconst y = 2";',
    'x = `first\nconst y = 2\n  let z = 3`;',
    '/* \nconst y = 1 */ 1',
  ])
    assert.equal(persistentScript(unchanged), unchanged, unchanged);

  const session = open('test-scope');
  const turn = await session.eval(`
    const total = 10;
    { let total = 1; }
    for (let i = 0; i < 3; i++) { const total = i; }
    const note = \`header
const total = 99\`;
    total;
  `);
  assert.equal(turn.result, '10');
  assert.equal((await session.eval('note.split("\\n")[1]')).result, 'const total = 99');
  assert.equal((await session.eval('typeof i')).result, 'undefined');
  // A later turn may declare the same name again.
  assert.equal((await session.eval('const total = 11; total')).result, '11');
});

test('a crash, an unhandled rejection or running out of memory ends only the REPL thread', async () => {
  const session = open('test-crash');
  try {
    const rejected = await session.eval('const kept = 1; Promise.reject(new Error("ignored")); (async () => { throw 1; })(); 2');
    assert.equal(rejected.result, '2');
    assert.equal((await session.eval('kept')).result, '1', 'an unhandled rejection does not end the session');

    const memory = await session.eval('const grow = []; while (true) grow.push(new Array(1e6).fill(1));', 10000);
    assert.match(memory.error || '', /out of memory|crashed|timed out/);
    // The next run starts a fresh session in a new thread.
    assert.equal((await session.eval('typeof kept')).result, 'undefined');
  } finally {
    session.stop();
  }
});
