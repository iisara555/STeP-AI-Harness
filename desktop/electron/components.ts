import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ocrPython } from './ocr';

const PYTHON_RELEASE = '20260924';
const PYTHON_VERSION = '3.12.14';
const PYTHON_BUILDS: Record<string, { triple: string; sha256: string; paddle: string }> = {
  'win32-x64': {
    triple: 'x86_64-pc-windows-msvc',
    sha256: 'c5303174bc29f5205decf6721ac549d4eb41c448f9b8c46cbc562d00348865bb',
    paddle: 'paddlepaddle==3.3.0',
  },
  'darwin-arm64': {
    triple: 'aarch64-apple-darwin',
    sha256: '9763f43db2481a6af36af82ec40302aab7a73632f880129d07a6e81aec846277',
    paddle: 'paddlepaddle==3.3.0',
  },
  'darwin-x64': {
    triple: 'x86_64-apple-darwin',
    sha256: '0d6a4a299908123f00bc844df737603f047ff9eba14fda6cad83f3cf3cb3a2af',
    paddle: 'paddlepaddle==3.0.0',
  },
};

type Log = (line: string) => void;

function run(command: string, args: string[], log: Log, cwd?: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return new Promise<number>(resolve => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PIP_DISABLE_PIP_VERSION_CHECK: '1',
        PIP_NO_CACHE_DIR: '1',
        ...extraEnv,
      },
    });
    const forward = (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) if (line.trim()) log(line.slice(0, 300));
    };
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('error', () => resolve(-1));
    child.on('close', code => resolve(code ?? -1));
  });
}

export function ocrComponentSpec(platform = process.platform, arch = process.arch) {
  return PYTHON_BUILDS[`${platform}-${arch}`] || null;
}

export function portableOcrPython(runtimeDir: string) {
  return process.platform === 'win32' ? join(runtimeDir, 'python', 'python.exe') : join(runtimeDir, 'python', 'bin', 'python3');
}

async function coreFingerprint(appFolder: string) {
  const spec = ocrComponentSpec();
  if (!spec) return '';
  const files = await Promise.all(
    ['requirements-core.txt', 'ocr_engine.py'].map(async name => {
      try {
        return await readFile(join(appFolder, name), 'utf8');
      } catch {
        return '';
      }
    }),
  );
  return createHash('sha256')
    .update(JSON.stringify([PYTHON_RELEASE, PYTHON_VERSION, process.platform, process.arch, spec.paddle, ...files]))
    .digest('hex');
}

export async function ocrComponentCurrent(appFolder: string, componentDir: string) {
  try {
    const saved = JSON.parse(await readFile(join(componentDir, 'stamp.json'), 'utf8'));
    return Boolean(saved?.core) && saved.core === (await coreFingerprint(appFolder));
  } catch {
    return false;
  }
}

async function installPortablePython(runtimeDir: string, log: Log) {
  const spec = ocrComponentSpec();
  if (!spec) throw new Error('OCR_COMPONENT_UNSUPPORTED');
  const existing = portableOcrPython(runtimeDir);
  if (existsSync(existing)) return existing;

  const name = `cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-${spec.triple}-install_only.tar.gz`;
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/${encodeURIComponent(name)}`;
  const work = await mkdtemp(join(tmpdir(), 'step-ocr-component-'));
  const archive = join(work, 'python.tar.gz');
  try {
    log('STEP ดาวน์โหลด Python สำหรับ OCR');
    const response = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
    if (!response.ok) throw new Error('OCR_COMPONENT_DOWNLOAD_FAILED');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== spec.sha256) throw new Error('OCR_COMPONENT_CHECKSUM_FAILED');
    await writeFile(archive, bytes);

    await rm(runtimeDir, { recursive: true, force: true });
    await mkdir(runtimeDir, { recursive: true });
    log('STEP ตรวจสอบและแตกไฟล์ Python');
    const tar =
      process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    if ((await run(tar, ['-xzf', archive, '-C', runtimeDir], log)) !== 0 || !existsSync(portableOcrPython(runtimeDir)))
      throw new Error('OCR_COMPONENT_INSTALL_FAILED');
    return portableOcrPython(runtimeDir);
  } catch (error) {
    await rm(runtimeDir, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Installs the optional OCR component after STeP Desktop itself is installed.
 * The main installer carries only the small OCR application code; Python, Paddle and models
 * are downloaded into this user's app-data folder only when the employee chooses to use OCR.
 */
export async function installOcr(appFolder: string, componentDir: string, log: Log, crosscheck = false) {
  if (!existsSync(join(appFolder, 'requirements-core.txt'))) throw new Error('OCR_FOLDER_INVALID');
  const spec = ocrComponentSpec();
  if (!spec) throw new Error('OCR_COMPONENT_UNSUPPORTED');

  await mkdir(componentDir, { recursive: true });
  const runtimeDir = join(componentDir, 'runtime');
  const bootstrapPython = await installPortablePython(runtimeDir, log);
  const venvDir = join(componentDir, '.venv');
  const venvPython = ocrPython(componentDir);
  const cache = join(componentDir, 'paddlex');
  const env = {
    PYTHONDONTWRITEBYTECODE: '1',
    PADDLE_PDX_CACHE_HOME: cache,
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
  };

  const steps: [string, string, string[]][] = [
    ...(existsSync(venvPython)
      ? []
      : [['สร้างพื้นที่ OCR แยกจากระบบ', bootstrapPython, ['-m', 'venv', venvDir]] as [string, string, string[]]]),
    ['อัปเดตตัวติดตั้ง Python', venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']],
    ['ติดตั้ง PaddlePaddle (CPU)', venvPython, ['-m', 'pip', 'install', spec.paddle, '-i', 'https://www.paddlepaddle.org.cn/packages/stable/cpu/']],
    ['ติดตั้ง OCR ภาษาไทย', venvPython, ['-m', 'pip', 'install', '-r', join(appFolder, 'requirements-core.txt')]],
    ...(crosscheck
      ? [
          [
            'ติดตั้ง OCR ตัวที่สอง (EasyOCR)',
            venvPython,
            ['-m', 'pip', 'install', '-r', join(appFolder, 'requirements-crosscheck.txt')],
          ] as [string, string, string[]],
        ]
      : []),
    [
      'ดาวน์โหลดและเตรียมโมเดล OCR ภาษาไทย',
      venvPython,
      ['-c', 'from ocr_engine import LocalThaiOCR; LocalThaiOCR()._get_ocr(); print("models ready")'],
    ],
  ];

  try {
    for (const [index, [label, command, args]] of steps.entries()) {
      log(`STEP ${index + 1}/${steps.length} ${label}`);
      if ((await run(command, args, log, appFolder, env)) !== 0) throw new Error('OCR_INSTALL_FAILED');
    }
  } catch (error) {
    // A partial venv is more confusing than a clean retry. Keep the verified portable Python
    // so retrying does not need to download it again.
    await rm(venvDir, { recursive: true, force: true });
    throw error;
  }
  await writeFile(
    join(componentDir, 'stamp.json'),
    JSON.stringify({ core: await coreFingerprint(appFolder), crosscheck, installedAt: new Date().toISOString() }),
    'utf8',
  );
  log('DONE');
}
