import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LLAMA_BUILDS, TYPHOON_MODEL_FILES, installTyphoon, typhoonBuild, typhoonInstalled } from '../electron/typhoon';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('Typhoon OCR downloads are pinned by revision, size and checksum for every released platform', async () => {
  for (const key of ['win32-x64', 'darwin-arm64']) {
    const build = LLAMA_BUILDS[key];
    assert.match(build.sha256, /^[0-9a-f]{64}$/);
    assert.ok(build.size > 1_000_000);
    assert.match(build.name, /^llama-b\d+-bin-/);
  }
  assert.deepEqual(
    TYPHOON_MODEL_FILES.map(file => file.name),
    ['typhoon-ocr2-0.8b-Q8_0.gguf', 'mmproj-typhoon-ocr2-0.8b-f16.gguf'],
  );
  assert.ok(TYPHOON_MODEL_FILES.every(file => /^[0-9a-f]{64}$/.test(file.sha256) && file.size > 100_000_000));
  // The OCR service looks for the same file names.
  const setup = await readFile(new URL('../../experiments/local-thai-ocr/typhoon_setup.py', import.meta.url), 'utf8');
  for (const file of TYPHOON_MODEL_FILES) assert.ok(setup.includes(`"${file.name}"`), file.name);
  const main = await readFile(new URL('../electron/main.ts', import.meta.url), 'utf8');
  assert.match(main, /STEP_TYPHOON_DIR: typhoonHome/);
  const receipt = await readFile(new URL('../src/receipt.tsx', import.meta.url), 'utf8');
  assert.match(receipt, /call\('ocrTyphoonInstall'/);
});

test('Typhoon OCR appears only once every file is verified, and a retry keeps verified downloads', async t => {
  if (process.platform === 'win32' || !typhoonBuild()) return t.skip('needs a tar.gz llama.cpp build for this platform');
  const work = await mkdtemp(join(tmpdir(), 'step-typhoon-test-'));
  const original = { files: TYPHOON_MODEL_FILES.map(file => ({ ...file })), build: { ...typhoonBuild()! } };
  const realFetch = globalThis.fetch;
  t.after(async () => {
    globalThis.fetch = realFetch;
    TYPHOON_MODEL_FILES.forEach((file, index) => Object.assign(file, original.files[index]));
    Object.assign(typhoonBuild()!, original.build);
    await rm(work, { recursive: true, force: true });
  });

  // Synthetic stand-ins: two small "models" and an archive holding a llama-server in a sub-folder, as the macOS build does.
  const bodies = new Map<string, Buffer>();
  for (const file of TYPHOON_MODEL_FILES) {
    const bytes = Buffer.from(`synthetic ${file.name}`);
    Object.assign(file, { sha256: sha(bytes), size: bytes.length });
    bodies.set(file.name, bytes);
  }
  const tree = join(work, 'tree', 'llama-b0');
  await mkdir(tree, { recursive: true });
  await writeFile(join(tree, 'llama-server'), '#!/bin/sh\n', { mode: 0o755 });
  const archive = join(work, 'llama.tar.gz');
  execFileSync('tar', ['-czf', archive, '-C', join(work, 'tree'), 'llama-b0']);
  const archiveBytes = await readFile(archive);
  const build = typhoonBuild()!;
  Object.assign(build, { name: 'llama-test.tar.gz', sha256: sha(archiveBytes), size: archiveBytes.length });
  bodies.set(build.name, archiveBytes);

  const requested: string[] = [];
  let corrupt = true;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    requested.push(url);
    const name = decodeURIComponent(url.split('/').pop() || '');
    let body = bodies.get(name)!;
    if (name === build.name && corrupt) body = Buffer.from('tampered');
    return new Response(new Uint8Array(body));
  }) as typeof fetch;

  const dir = join(work, 'typhoon');
  const lines: string[] = [];
  await assert.rejects(
    installTyphoon(dir, line => lines.push(line)),
    /OCR_COMPONENT_CHECKSUM_FAILED/,
  );
  assert.equal(existsSync(dir), false, 'no half install is visible to the OCR service');
  assert.equal(await typhoonInstalled(dir), false);

  corrupt = false;
  requested.length = 0;
  await installTyphoon(dir, line => lines.push(line));
  assert.equal(await typhoonInstalled(dir), true);
  assert.equal(existsSync(dir + '.partial'), false);
  assert.equal(existsSync(join(dir, 'llama', build.name)), false, 'the archive is removed after extracting');
  // Only the archive that failed is fetched again; the verified models are kept.
  assert.equal(requested.length, 1);
  assert.ok(lines.includes('DONE'));
  assert.ok(lines.some(line => /^STEP 1\/3 .*%$/.test(line)));
});

test('the first Typhoon download is fetched from the pinned model revision and llama.cpp release', async () => {
  const source = await readFile(new URL('../electron/typhoon.ts', import.meta.url), 'utf8');
  assert.match(source, /huggingface\.co\/\$\{MODEL_REPO\}\/resolve\/\$\{MODEL_REVISION\}/);
  assert.match(source, /MODEL_REVISION = '[0-9a-f]{40}'/);
  assert.match(source, /github\.com\/ggml-org\/llama\.cpp\/releases\/download\/\$\{LLAMA_RELEASE\}/);
});
