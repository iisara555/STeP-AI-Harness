import { spawnSync } from 'node:child_process';

// Do not inherit automatic semantic backends or query logging preferences.
const env = { ...process.env, GRAPHIFY_QUERY_LOG_DISABLE: '1' };
const args = process.argv.slice(2);
const allowed = new Set(['query', 'explain', 'path', 'affected', 'god-nodes']);
function run(command) {
  const result = spawnSync('graphify', command, { env, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
if (args[0] === 'build') {
  run(['extract', '.', '--code-only', '--no-cluster', '--force', '--max-workers', '2']);
  run(['cluster-only', '.', '--no-label']);
} else if (allowed.has(args[0])) run(args);
else throw new Error('Use build, query, explain, path, affected, or god-nodes.');
