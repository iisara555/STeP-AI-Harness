// Installers carry the local Thai OCR ready to use: a relocatable CPython (python-build-standalone,
// pinned by checksum), PaddlePaddle CPU and the OCR requirements installed into it, and the two
// PaddleOCR models the engine uses. Output: desktop/ocr-runtime/{python,models}, packed as a resource.
// Usage: node scripts/bundle-ocr.mjs [x64|arm64] [--optional]   (defaults to this machine's architecture)
// --optional: on failure, ship without the OCR runtime; the app then offers its own OCR install.
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEASE = '20260924',
  VERSION = '3.12.14';
// [python-build-standalone triple, archive sha256, PaddlePaddle CPU wheel from PyPI]
// PaddlePaddle stopped publishing Intel Mac wheels after 3.0.0.
const BUILDS = {
  'win32-x64': ['x86_64-pc-windows-msvc', 'c5303174bc29f5205decf6721ac549d4eb41c448f9b8c46cbc562d00348865bb', 'paddlepaddle==3.3.0'],
  'darwin-arm64': ['aarch64-apple-darwin', '9763f43db2481a6af36af82ec40302aab7a73632f880129d07a6e81aec846277', 'paddlepaddle==3.3.0'],
  'darwin-x64': ['x86_64-apple-darwin', '0d6a4a299908123f00bc844df737603f047ff9eba14fda6cad83f3cf3cb3a2af', 'paddlepaddle==3.0.0'],
};
const MODELS = ['PP-OCRv5_mobile_det', 'th_PP-OCRv5_mobile_rec'];

const desktop = fileURLToPath(new URL('..', import.meta.url));
const ocrApp = join(desktop, '..', 'experiments', 'local-thai-ocr');
const out = join(desktop, 'ocr-runtime');
const args = process.argv.slice(2),
  optional = args.includes('--optional');
const arch = args.find(a => !a.startsWith('--')) || process.arch,
  key = `${process.platform}-${arch}`;
if (!BUILDS[key]) throw new Error(`No bundled Python for ${key}`);
const [triple, sha256, PADDLE] = BUILDS[key];

try {
  await bundle();
} catch (error) {
  if (!optional) throw error;
  await rm(out, { recursive: true, force: true });
  console.warn(`OCR runtime for ${key} not bundled (${error.message}); the app will offer its own OCR install`);
}

async function bundle() {
  // Skip the slow rebuild when the same Python, architecture and requirements are already bundled.
  const stamp = createHash('sha256')
    .update(JSON.stringify([RELEASE, VERSION, key, PADDLE, MODELS, await readFile(join(ocrApp, 'requirements-core.txt'), 'utf8')]))
    .digest('hex');
  if (existsSync(join(out, 'stamp')) && (await readFile(join(out, 'stamp'), 'utf8')) === stamp) {
    console.log(`OCR runtime for ${key} is up to date`);
    return;
  }
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const name = `cpython-${VERSION}+${RELEASE}-${triple}-install_only.tar.gz`;
  const response = await fetch(
    `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}/${encodeURIComponent(name)}`,
  );
  if (!response.ok) throw new Error(`Python download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('Python checksum mismatch');
  const work = await mkdtemp(join(tmpdir(), 'step-ocr-')),
    archive = join(work, 'python.tar.gz');
  await writeFile(archive, bytes);
  // Windows: use the system bsdtar, which understands drive-letter paths.
  execFileSync(
    process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\Windows', 'System32', 'tar.exe') : 'tar',
    ['-xzf', archive, '-C', out],
    { stdio: 'inherit' },
  ); // unpacks to out/python
  console.log(`Python ${VERSION} (${triple}) verified`);

  const python = process.platform === 'win32' ? join(out, 'python', 'python.exe') : join(out, 'python', 'bin', 'python3');
  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
    PIP_NO_CACHE_DIR: '1',
    PADDLE_PDX_CACHE_HOME: join(work, 'paddlex'),
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
  };
  const py = (...args) => execFileSync(python, args, { stdio: 'inherit', env, cwd: ocrApp });
  py('-m', 'pip', 'install', '--upgrade', 'pip');
  py('-m', 'pip', 'install', PADDLE);
  py('-m', 'pip', 'install', '-r', join(ocrApp, 'requirements-core.txt'));

  // Loading the engine once downloads exactly the models it uses; keep only those.
  py('-c', 'from ocr_engine import LocalThaiOCR; LocalThaiOCR()._get_ocr(); print("models ready")');
  for (const model of MODELS) await cp(join(work, 'paddlex', 'official_models', model), join(out, 'models', model), { recursive: true });
  // Precompile so the read-only app bundle never needs to write bytecode; a few stdlib test files do not compile.
  try {
    py('-m', 'compileall', '-q', '-j', '0', join(out, 'python'));
  } catch {
    console.log('compileall reported files it could not compile; continuing');
  }
  await writeFile(join(out, 'stamp'), stamp);
  await rm(work, { recursive: true, force: true });
  console.log(`OCR runtime for ${key} bundled in ${out}`);
}
