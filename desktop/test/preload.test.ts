import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

test('the renderer can check Anthropic CLI availability while unknown operations remain denied', async () => {
  let bridge: { call: (method: string, input?: unknown) => Promise<unknown> };
  const calls: unknown[][] = [];
  const source = readFileSync(new URL('../electron/preload.ts', import.meta.url), 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs' });
  runInNewContext(code, {
    require: (name: string) => {
      assert.equal(name, 'electron');
      return {
        contextBridge: {
          exposeInMainWorld: (name: string, value: typeof bridge) => {
            assert.equal(name, 'step');
            bridge = value;
          },
        },
        ipcRenderer: {
          invoke: async (...args: unknown[]) => {
            calls.push(args);
            return { installed: false };
          },
        },
      };
    },
  });
  assert.deepEqual(await bridge!.call('anthropicCli'), { installed: false });
  assert.deepEqual(calls, [['step:call', 'anthropicCli', undefined]]);
  assert.throws(() => bridge!.call('readCredentials'), /UNKNOWN_OPERATION/);
  assert.equal(calls.length, 1);
});
