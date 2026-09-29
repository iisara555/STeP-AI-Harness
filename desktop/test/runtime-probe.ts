import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRpc, initialize } from '../electron/providers';
import type { Connection } from '../src/types';
const require = createRequire(import.meta.url);
const home = await mkdtemp(join(tmpdir(), 'step-runtime-probe-'));
await mkdir(join(home, '.gemini'), { recursive: true });
await writeFile(join(home, '.gemini/settings.json'), JSON.stringify({ tools: { core: [] }, telemetry: { enabled: false } }));
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, HOME: home, USERPROFILE: home, CODEX_HOME: home, GEMINI_CLI_HOME: home, APPDATA: home, LOCALAPPDATA: home, TEMP: process.env.TEMP };
const results: unknown[] = [];
for (const provider of ['openai', 'gemini'] as const) {
  const executable = require.resolve(provider === 'openai' ? '@openai/codex/bin/codex.js' : '@google/gemini-cli/bundle/gemini.js');
  const connection: Connection = { id: 'probe', provider, mode: 'subscription', executable, model: '', ready: false, note: '' };
  const rpc = createRpc(connection, { cwd: home, env });
  try { await initialize(rpc, provider); results.push({ provider, protocolInitialization: 'passed', authenticated: false }); }
  catch (e) { results.push({ provider, protocolInitialization: 'failed', error: String(e), authenticated: false }); process.exitCode = 1; }
  finally { rpc.close(); }
}
await mkdir('release/qa', { recursive: true });
await writeFile('release/qa/runtime-probe.json', JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
