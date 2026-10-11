import test from 'node:test';
import assert from 'node:assert/strict';
import { runValidator, findPython } from '../scripts/validate-repo.js';

test('Python discovery is reusable by validator subprocess tests with Windows aliases', () => {
  const calls = [];
  const runtime = findPython((command, args) => {
    calls.push({ command, args });
    return { status: command === 'py' ? 0 : 9009 };
  });
  assert.deepEqual(runtime, { command: 'py', prefix: ['-3'] });
  assert.deepEqual(calls.map(c => c.command), ['python', 'python3', 'py']);
  assert.ok(calls.every(c => c.args.includes('-c')));
  assert.equal(findPython(() => ({ error: new Error('ENOENT') })), null);
});

test('validator finds python, python3, and the Windows py launcher', () => {
  for (const available of ['python', 'python3', 'py']) {
    const calls = [];
    const status = runValidator((command, args, options) => {
      calls.push({ command, args, options });
      return { status: command === available ? 0 : 1 };
    });
    assert.equal(status, 0);
    const last = calls.at(-1);
    assert.equal(last.command, available);
    assert.deepEqual(last.args, available === 'py' ? ['-3', 'scripts/validate_repo.py'] : ['scripts/validate_repo.py']);
    assert.equal(last.options.env.PYTHONUTF8, '1');
    assert.equal(calls.filter(c => c.args.includes('scripts/validate_repo.py')).length, 1);
  }
});

test('validation failure is propagated without trying another interpreter', () => {
  const calls = [];
  assert.equal(runValidator((command, args) => {
    calls.push(command);
    return { status: args.includes('-c') ? 0 : 7 };
  }), 7);
  assert.deepEqual(calls, ['python', 'python']);
});

test('missing runtimes fail with actionable guidance', (t) => {
  const messages = [];
  t.mock.method(console, 'error', message => messages.push(message));
  assert.equal(runValidator(() => ({ error: new Error('ENOENT'), status: null })), 1);
  assert.match(messages[0], /Python 3\.10\+/);
});

test('terminated validator fails instead of reporting success', () => {
  assert.equal(runValidator((_command, args) => ({ status: args.includes('-c') ? 0 : null })), 1);
});
