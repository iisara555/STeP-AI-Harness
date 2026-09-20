import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

export function runValidator(run = spawnSync) {
  // Probe first: a failed validation must never fall through to another runtime.
  for (const [command, prefix] of [['python', []], ['python3', []], ['py', ['-3']]]) {
    const probe = run(command, [...prefix, '-c', 'import sys; sys.exit(sys.version_info < (3, 10))'], {
      stdio: 'ignore', windowsHide: true,
    });
    if (probe.error || probe.status !== 0) continue;

    const result = run(command, [...prefix, 'scripts/validate_repo.py'], {
      cwd: root, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1' },
    });
    if (result.error) console.error(`Could not run repository validator: ${result.error.message}`);
    return result.status ?? 1;
  }

  console.error('Python 3.10+ is required. Install Python and make python, python3, or py -3 available, then run npm run validate again.');
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runValidator();
}
