import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const child = spawn(
  process.execPath,
  [
    '--import',
    new URL('../../node_modules/tsx/dist/loader.mjs', import.meta.url).href,
    fileURLToPath(new URL('./run.mjs', import.meta.url)),
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', windowsHide: true, shell: false },
);
child.on('error', () => {
  process.exitCode = 1;
});
child.on('close', code => {
  process.exitCode = code ?? 1;
});
