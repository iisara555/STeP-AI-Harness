import test from 'node:test';
import assert from 'node:assert/strict';
import { StatefulReplManager, StatefulReplSession } from '../electron/stateful-repl';

test('StatefulReplSession preserves variables and functions across multiple evaluation turns', () => {
  const session = new StatefulReplSession('test-session-1');

  // Turn 1: define variables and function
  const turn1 = session.eval(`
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
  const turn2 = session.eval(`
    base = 20;
    compute(5);
  `);
  assert.equal(turn2.error, undefined);
  assert.equal(turn2.result, '75'); // (5 + 20) * 3
});

test('StatefulReplSession captures console logs and errors', () => {
  const session = new StatefulReplSession('test-session-2');
  const turn = session.eval(`
    console.log("Processing item", 101);
    console.warn("Notice: demo value");
    "finished";
  `);
  assert.equal(turn.error, undefined);
  assert.equal(turn.result, 'finished');
  assert.ok(turn.output.includes('Processing item 101'));
  assert.ok(turn.output.includes('[WARN] Notice: demo value'));
});

test('StatefulReplSession catches errors gracefully without terminating session', () => {
  const session = new StatefulReplSession('test-session-3');
  session.eval('const x = 100;');

  const failingTurn = session.eval('unknownFunction();');
  assert.ok(failingTurn.error?.includes('unknownFunction is not defined'));

  // Session remains intact and x is still accessible
  const nextTurn = session.eval('x + 5;');
  assert.equal(nextTurn.error, undefined);
  assert.equal(nextTurn.result, '105');
});

test('StatefulReplSession reset clears state', () => {
  const session = new StatefulReplSession('test-session-4');
  session.eval('const secret = 42;');
  session.reset();

  const turn = session.eval('typeof secret;');
  assert.equal(turn.result, 'undefined');
});

test('StatefulReplManager maintains isolated sessions by sessionId', () => {
  const manager = new StatefulReplManager();
  const sessionA = manager.session('session-A');
  const sessionB = manager.session('session-B');

  sessionA.eval('const token = "AAA";');
  sessionB.eval('const token = "BBB";');

  assert.equal(sessionA.eval('token').result, 'AAA');
  assert.equal(sessionB.eval('token').result, 'BBB');
});
