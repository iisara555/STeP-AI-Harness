import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename } from 'node:path';
import type { Connection } from '../src/types';

const requireModule = createRequire(__filename);

// The Codex or Gemini CLI that ships with the app, or the one the user picked while it still exists.
export function resolveRuntime(connection: Connection) {
  if (connection.provider === 'claude') return '';
  if (connection.customRuntime && connection.executable && existsSync(connection.executable)) return connection.executable;
  try { return requireModule.resolve(connection.provider === 'openai' ? '@openai/codex/bin/codex.js' : '@google/gemini-cli/bundle/gemini.js'); }
  catch { throw new Error('RUNTIME_UNAVAILABLE'); }
}

// A picked runtime must look like the provider's CLI by name and report a version, so an unrelated
// program (for example an installer in Downloads) is never started as the AI runtime.
export async function checkRuntime(provider: string, file: string) {
  const name = basename(file).toLowerCase();
  const expected = provider === 'openai' ? /^codex(\.exe|\.js|\.mjs)?$/ : /^gemini(\.exe|\.js|\.mjs)?$/;
  if (!expected.test(name) && !(provider === 'gemini' && /[\/]@google[\/]gemini-cli[\/]/i.test(file))) throw new Error('RUNTIME_INVALID');
  const script = /\.[cm]?js$/i.test(file);
  const output = await new Promise<string>(resolveOutput => {
    execFile(script ? process.execPath : file, script ? [file, '--version'] : ['--version'], { timeout: 10_000, windowsHide: true, env: { ...process.env, ...(script ? { ELECTRON_RUN_AS_NODE: '1' } : {}) } }, (error, stdout) => resolveOutput(error ? '' : String(stdout)));
  });
  if (!(provider === 'openai' ? /codex/i.test(output) : /^\s*\d+\.\d+\.\d+/.test(output))) throw new Error('RUNTIME_INVALID');
}
