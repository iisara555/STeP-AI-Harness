import { spawn } from 'node:child_process';
import { join } from 'node:path';
const root = process.env.STEP_EVAL_REPO;
if (!root) throw new Error('EVAL_REPO_REQUIRED');
const args = [
  join(root, 'desktop/node_modules/@openai/codex/bin/codex.js'),
  '-c',
  'web_search="disabled"',
  '-c',
  'features.shell_tool=false',
  '-c',
  'features.plugins=false',
  '-c',
  'features.remote_plugin=false',
  '-c',
  'features.plugin_sharing=false',
  '-c',
  'features.apps=false',
  '-c',
  'features.goals=false',
  '-c',
  'mcp_servers={}',
  ...process.argv.slice(2),
];
const child = spawn(process.execPath, args, { stdio: 'inherit', shell: false, env: process.env, windowsHide: true });
child.on('error', () => process.exit(1));
child.on('exit', code => process.exit(code ?? 1));
