// One employee-approved JavaScript session for one task, in its own thread with its own memory limit, so a crash,
// an unhandled promise rejection or running out of memory ends this thread and never the app's main process.
// Model code runs only inside a vm context that holds no host object, function or module (no require, process,
// Buffer or host console). The prelude below defines console, the value formatter and the runner inside that context,
// so the script, getters, toJSON, toString, thrown values and promise callbacks all run under the one vm time limit.
// Node's vm module is not a security boundary on its own; that is why repl_eval asks before every run.
const { parentPort } = require('node:worker_threads');
const { types } = require('node:util');
const vm = require('node:vm');

process.on('unhandledRejection', () => {});

const PRELUDE = `(() => {
  'use strict';
  const evaluate = eval;
  const stringify = JSON.stringify;
  const toText = String;
  const map = Array.prototype.map;
  const join = Array.prototype.join;
  const logs = [];
  const format = value => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    const type = typeof value;
    if (type === 'string') return value;
    if (type === 'number' || type === 'boolean' || type === 'bigint' || type === 'symbol') return toText(value);
    if (type === 'function') return '[Function: ' + (value.name || 'anonymous') + ']';
    try {
      const text = stringify(value, null, 2);
      return text === undefined ? toText(value) : text;
    } catch {
      try {
        return toText(value);
      } catch {
        return '[unprintable value]';
      }
    }
  };
  const line = (prefix, args) => logs.push(prefix + join.call(map.call(args, format), ' '));
  globalThis.console = {
    log: (...args) => line('', args),
    info: (...args) => line('', args),
    warn: (...args) => line('[WARN] ', args),
    error: (...args) => line('[ERROR] ', args),
  };
  Object.defineProperty(globalThis, '__stepRun', {
    value: source => {
      logs.length = 0;
      let result, error;
      try {
        const value = evaluate(source);
        if (value !== undefined) result = format(value);
      } catch (thrown) {
        try {
          error = thrown !== null && typeof thrown === 'object' && 'message' in thrown ? toText(thrown.message) : format(thrown);
        } catch {
          error = 'The script threw a value that could not be read.';
        }
      }
      return stringify({ output: join.call(logs, '\\n'), result, error });
    },
  });
})();`;

let context;
const fresh = () => {
  context = vm.createContext(Object.create(null), { codeGeneration: { strings: true, wasm: false }, microtaskMode: 'afterEvaluate' });
  vm.runInContext(PRELUDE, context, { timeout: 1000 });
};
// Nothing thrown out of the context is inspected, except to recognize Node's own timeout error.
const timedOut = error => {
  if (typeof error !== 'object' || error === null || types.isProxy(error)) return false;
  const code = Object.getOwnPropertyDescriptor(error, 'code');
  return Boolean(code && 'value' in code && code.value === 'ERR_SCRIPT_EXECUTION_TIMEOUT');
};
const text = value => (typeof value === 'string' ? value : undefined);

fresh();
parentPort.on('message', ({ code, timeout }) => {
  let reply;
  try {
    const raw = vm.runInContext(`__stepRun(${JSON.stringify(code)})`, context, { timeout });
    reply = typeof raw === 'string' ? JSON.parse(raw) : { error: 'The script returned an unreadable result.' };
  } catch (error) {
    reply = { error: timedOut(error) ? `Script execution timed out after ${timeout}ms` : 'The script stopped with an unreadable error.' };
  }
  parentPort.postMessage({ output: text(reply.output), result: text(reply.result), error: text(reply.error) });
});
