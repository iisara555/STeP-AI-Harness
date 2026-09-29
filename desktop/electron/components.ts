import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ocrPython } from './ocr';

// Optional components the desktop can set up for the employee, with the same steps as the
// experiment's own Install-OCR scripts. Only Python packages are installed; Python itself is not.
const PADDLE = ['paddlepaddle==3.3.0', '-i', 'https://www.paddlepaddle.org.cn/packages/stable/cpu/'];
const CANDIDATES: [string, string[]][] = process.platform === 'win32'
  ? [['py', ['-3.12']], ['py', ['-3.13']], ['py', ['-3.11']], ['py', ['-3.10']], ['python', []]]
  // Apps opened from Finder get a minimal PATH, so also try the python.org and Homebrew locations.
  : ['3.12', '3.11', '3.10'].flatMap(v => [`/Library/Frameworks/Python.framework/Versions/${v}/bin/python3`, `/opt/homebrew/bin/python${v}`, `/usr/local/bin/python${v}`, `python${v}`])
    .map(command => [command, []] as [string, string[]]).concat([['python3', []]]);
const SUPPORTED = process.platform === 'win32' ? '(3,10) <= sys.version_info[:2] <= (3,13)' : '(3,10) <= sys.version_info[:2] <= (3,12)';

type Log = (line: string) => void;
function run(command: string, args: string[], log: Log, cwd?: string) {
  return new Promise<number>(resolve => {
    const child = spawn(command, args, { cwd, windowsHide: true, shell: false, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PIP_DISABLE_PIP_VERSION_CHECK: '1' } });
    const forward = (chunk: Buffer) => { for (const line of chunk.toString('utf8').split(/\r?\n/)) if (line.trim()) log(line.slice(0, 300)); };
    child.stdout.on('data', forward); child.stderr.on('data', forward);
    child.on('error', () => resolve(-1)); child.on('close', code => resolve(code ?? -1));
  });
}

export async function findPython(): Promise<{ command: string; args: string[] } | null> {
  for (const [command, args] of CANDIDATES) {
    if (await run(command, [...args, '-c', `import sys; raise SystemExit(0 if ${SUPPORTED} and sys.maxsize > 2**32 else 1)`], () => {}) === 0) return { command, args };
  }
  return null;
}

/** venvDir is private to this user (app data), so an installed app needs no write access to its own folder. */
export async function installOcr(appFolder: string, venvDir: string, log: Log, crosscheck = false, bundledPython?: string) {
  if (!existsSync(join(appFolder, 'requirements-core.txt'))) throw new Error('OCR_FOLDER_INVALID');
  // The Python bundled with the installer can seed the venv, so no separate Python install is needed.
  const python = bundledPython && existsSync(bundledPython) ? { command: bundledPython, args: [] } : await findPython();
  if (!python) throw new Error('PYTHON_REQUIRED');
  const venvPython = ocrPython(venvDir.replace(/[\\/]\.venv$/, ''));
  const steps: [string, string, string[]][] = [
    ...(existsSync(venvPython) ? [] : [['สร้างพื้นที่ติดตั้งแยก (venv)', python.command, [...python.args, '-m', 'venv', venvDir]] as [string, string, string[]]]),
    ['อัปเดต pip', venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']],
    ['ติดตั้ง PaddlePaddle (CPU)', venvPython, ['-m', 'pip', 'install', ...PADDLE]],
    ['ติดตั้ง OCR ภาษาไทย', venvPython, ['-m', 'pip', 'install', '-r', join(appFolder, 'requirements-core.txt')]],
    ...(crosscheck ? [['ติดตั้ง OCR ตัวที่สอง (EasyOCR)', venvPython, ['-m', 'pip', 'install', '-r', join(appFolder, 'requirements-crosscheck.txt')]] as [string, string, string[]]] : []),
  ];
  for (const [index, [label, command, args]] of steps.entries()) {
    log(`STEP ${index + 1}/${steps.length} ${label}`);
    if (await run(command, args, log, appFolder) !== 0) throw new Error('OCR_INSTALL_FAILED');
  }
  log('DONE');
}
