import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { checkAntigravity } from './antigravity';
import type { Connection } from '../src/types';

// The Codex or Gemini CLI that ships with the app, or the one the user picked while it still exists.
export function resolveRuntime(connection: Connection) {
  if (connection.provider === 'claude') return '';
  if (connection.customRuntime && connection.executable && existsSync(connection.executable)) return connection.executable;
  if (connection.provider === 'antigravity') {
    const binary = process.platform === 'win32' ? 'agy.exe' : 'agy';
    const candidates = [
      ...(process.env.PATH || '')
        .split(process.platform === 'win32' ? ';' : ':')
        .filter(isAbsolute)
        .map(dir => join(dir, binary)),
      join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'agy', 'bin', binary),
      join(homedir(), '.local', 'bin', binary),
      '/opt/homebrew/bin/agy',
      '/usr/local/bin/agy',
    ];
    const found = candidates.find(file => isAbsolute(file) && existsSync(file));
    if (!found) throw new Error('ANTIGRAVITY_RUNTIME_REQUIRED');
    return found;
  }
  try {
    const requireModule = createRequire(__filename);
    return requireModule.resolve(connection.provider === 'openai' ? '@openai/codex/bin/codex.js' : '@google/gemini-cli/bundle/gemini.js');
  } catch {
    throw new Error('RUNTIME_UNAVAILABLE');
  }
}

// A picked runtime must look like the provider's CLI by name and report a version, so an unrelated
// program (for example an installer in Downloads) is never started as the AI runtime.
export async function checkRuntime(provider: string, file: string) {
  const name = basename(file).toLowerCase();
  const expected =
    provider === 'openai'
      ? /^codex(\.exe|\.js|\.mjs)?$/
      : provider === 'antigravity'
        ? /^agy(\.exe|\.js|\.mjs)?$/
        : /^gemini(\.exe|\.js|\.mjs)?$/;
  if (!expected.test(name) && !(provider === 'gemini' && /[\/]@google[\/]gemini-cli[\/]/i.test(file))) throw new Error('RUNTIME_INVALID');
  if (provider === 'antigravity') {
    await checkAntigravity(file, {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, AGY_CLI_DISABLE_AUTO_UPDATE: '1' },
    });
    return;
  }
  const script = /\.[cm]?js$/i.test(file);
  const output = await new Promise<string>(resolveOutput => {
    execFile(
      script ? process.execPath : file,
      script ? [file, '--version'] : ['--version'],
      { timeout: 10_000, windowsHide: true, env: { ...process.env, ...(script ? { ELECTRON_RUN_AS_NODE: '1' } : {}) } },
      (error, stdout) => resolveOutput(error ? '' : String(stdout)),
    );
  });
  if (!(provider === 'openai' ? /codex/i.test(output) : /^\s*\d+\.\d+\.\d+/.test(output))) throw new Error('RUNTIME_INVALID');
}
