import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tm } from './i18n';

// Typhoon OCR V2 0.8B (SCB 10X, Apache-2.0) run by llama.cpp's llama-server (MIT) on this computer.
// Every file is pinned by revision and checksum; the layout matches experiments/local-thai-ocr/typhoon_setup.py.
const MODEL_REPO = 'typhoon-ai/typhoon-ocr2-0.8b-GGUF';
const MODEL_REVISION = 'd4ef0407f699f9e318c95cc312cae69420fb7fb4';
export const TYPHOON_MODEL_FILES = [
  // Q8_0: the model card's pick, as accurate as f16 at about half its size.
  {
    name: 'typhoon-ocr2-0.8b-Q8_0.gguf',
    sha256: '10d111b1558a0d51aaa7350e0dc65d66fe28ae27e9a03ddc9215ecb9baed3a84',
    size: 811_842_464,
  },
  {
    name: 'mmproj-typhoon-ocr2-0.8b-f16.gguf',
    sha256: '23edf37c46101bb3931662c03d6375206b11a2b6a3dc0d61390ac9f020cd87a5',
    size: 204_986_688,
  },
];
// CPU builds: they run on every staff laptop. The OCR service pins the same llama.cpp build we benchmarked.
const LLAMA_RELEASE = 'b12464';
export const LLAMA_BUILDS: Record<string, { name: string; sha256: string; size: number }> = {
  'win32-x64': {
    name: 'llama-b12464-bin-win-cpu-x64.zip',
    sha256: '2bc4bfd76278c57cc528d150a7ffc598d2ba3c4ec0c6f2ec1963fc492217442d',
    size: 25_272_351,
  },
  'darwin-arm64': {
    name: 'llama-b12464-bin-macos-arm64.tar.gz',
    sha256: '95cb3cf68c5534bebe598c4f95576fcca28444627de2373293512759e3ffa925',
    size: 17_065_398,
  },
  'darwin-x64': {
    name: 'llama-b12464-bin-macos-x64.tar.gz',
    sha256: '7fea952a34e74a63f7ed6fbc5469be3f50374a8906e849d30459fc57ba01ca56',
    size: 12_823_345,
  },
  'linux-x64': {
    name: 'llama-b12464-bin-ubuntu-x64.tar.gz',
    sha256: '7dd1899af7f0ddda42920d383b7dcda7097c1e5e45fcef582b68ea66badb46de',
    size: 23_535_048,
  },
};

type Log = (line: string) => void;

export function typhoonBuild(platform = process.platform, arch = process.arch) {
  return LLAMA_BUILDS[`${platform}-${arch}`] || null;
}

function serverName() {
  return process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
}

async function findServer(folder: string, depth = 2): Promise<string | undefined> {
  if (existsSync(join(folder, serverName()))) return join(folder, serverName());
  if (!depth) return undefined;
  for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => []))
    if (entry.isDirectory()) {
      const found = await findServer(join(folder, entry.name), depth - 1);
      if (found) return found;
    }
  return undefined;
}

/** The same check the OCR service makes: server, model and image encoder all in place. */
export async function typhoonInstalled(dir: string) {
  return TYPHOON_MODEL_FILES.every(file => existsSync(join(dir, 'models', file.name))) && Boolean(await findServer(join(dir, 'llama')));
}

async function sha256File(path: string) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

/** Stream a large download to disk, checking size and checksum, reporting progress in 10% steps. */
async function download(url: string, target: string, sha256: string, size: number, label: string, log: Log) {
  if (existsSync(target) && (await stat(target)).size === size && (await sha256File(target)) === sha256) return;
  const response = await fetch(url, { signal: AbortSignal.timeout(60 * 60_000) });
  if (!response.ok || !response.body) throw new Error('OCR_COMPONENT_DOWNLOAD_FAILED');
  const hash = createHash('sha256');
  let received = 0,
    reported = -1;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      received += chunk.length;
      hash.update(chunk);
      const percent = size ? Math.min(99, Math.floor((received / size) * 10) * 10) : 0;
      if (percent !== reported) {
        reported = percent;
        log(`${label} ${percent}%`);
      }
      done(null, chunk);
    },
  });
  const partial = target + '.part';
  try {
    await pipeline(Readable.fromWeb(response.body as any), meter, createWriteStream(partial));
    if (received !== size || hash.digest('hex') !== sha256) throw new Error('OCR_COMPONENT_CHECKSUM_FAILED');
    await rename(partial, target);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

function extract(archive: string, folder: string, log: Log) {
  const zip = archive.endsWith('.zip');
  const [command, args] =
    process.platform === 'win32'
      ? [join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', archive, '-C', folder]]
      : process.platform === 'linux' && zip
        ? ['unzip', ['-q', '-o', archive, '-d', folder]]
        : ['tar', [zip ? '-xf' : '-xzf', archive, '-C', folder]];
  return new Promise<number>(resolve => {
    const child = spawn(command, args, { windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', (chunk: Buffer) => log(chunk.toString('utf8').slice(0, 300)));
    child.on('error', () => resolve(-1));
    child.on('close', code => resolve(code ?? -1));
  });
}

/**
 * Adds Typhoon OCR to an installed OCR component. Downloads go to `<dir>.partial` and verified files there are kept
 * for a retry; `<dir>` appears only once everything is in place, so the OCR service never sees half an install.
 */
export async function installTyphoon(dir: string, log: Log) {
  const build = typhoonBuild();
  if (!build) throw new Error('OCR_COMPONENT_UNSUPPORTED');
  const partial = dir + '.partial';
  const models = join(partial, 'models'),
    llama = join(partial, 'llama');
  await mkdir(models, { recursive: true });
  for (const [index, file] of TYPHOON_MODEL_FILES.entries()) {
    const label = `STEP ${index + 1}/3 ${index ? tm('ดาวน์โหลดตัวอ่านภาพของ Typhoon OCR') : tm('ดาวน์โหลดโมเดล Typhoon OCR')}`;
    log(label);
    await download(
      `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REVISION}/${encodeURIComponent(file.name)}`,
      join(models, file.name),
      file.sha256,
      file.size,
      label,
      log,
    );
  }
  const label = `STEP 3/3 ${tm('ดาวน์โหลดและตรวจสอบตัวรันโมเดล (llama.cpp)')}`;
  log(label);
  const archive = join(partial, build.name);
  await download(
    `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE}/${encodeURIComponent(build.name)}`,
    archive,
    build.sha256,
    build.size,
    label,
    log,
  );
  await rm(llama, { recursive: true, force: true });
  await mkdir(llama, { recursive: true });
  if ((await extract(archive, llama, log)) !== 0 || !(await findServer(llama))) {
    await rm(llama, { recursive: true, force: true });
    throw new Error('OCR_INSTALL_FAILED');
  }
  await rm(archive, { force: true });
  await rm(dir, { recursive: true, force: true });
  await rename(partial, dir);
  log('DONE');
}
