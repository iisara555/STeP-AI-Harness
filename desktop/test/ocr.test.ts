import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OcrService } from '../electron/ocr';
import { ocrComponentSpec } from '../electron/components';

async function serve(handler: Parameters<typeof createServer>[1]) {
  const server: Server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('only the STeP OCR service counts as running', async () => {
  const other = await serve((_, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, service: 'something else' }));
  });
  try {
    assert.deepEqual(await new OcrService(() => '', other.base).health(), { running: false, crosscheck: false });
  } finally {
    await other.close();
  }
  assert.equal((await new OcrService(() => '', 'http://127.0.0.1:9').health()).running, false);
});

test('receipts are posted as raw bytes to the local service and its result is returned', async () => {
  let received: { url?: string; bytes?: Buffer } = {};
  const fake = await serve((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/health')
      return void res.end(JSON.stringify({ ok: true, service: 'STeP Local Thai OCR', crosscheck_installed: true }));
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      received = { url: req.url, bytes: Buffer.concat(chunks) };
      res.end(JSON.stringify({ ok: true, result: { text: 'ยอดสุทธิ 107.00', pages: [] } }));
    });
  });
  try {
    const dir = await mkdtemp(join(tmpdir(), 'step-ocr-')),
      file = join(dir, 'ใบเสร็จ.jpg');
    await writeFile(file, Buffer.from([1, 2, 3]));
    const service = new OcrService(() => '', fake.base);
    assert.deepEqual(await service.health(), { running: true, crosscheck: true });
    const read = await service.recognize(file, true);
    assert.equal(read.result.text, 'ยอดสุทธิ 107.00');
    assert.deepEqual([...received.bytes!], [1, 2, 3]);
    assert.match(received.url!, /filename=%E0%B9%83.*\.jpg&threshold=0\.80&handwriting=off&crosscheck=on/);
    await writeFile(join(dir, 'note.exe'), 'x');
    await assert.rejects(service.recognize(join(dir, 'note.exe'), false), /OCR_UNSUPPORTED_FILE/);
  } finally {
    await fake.close();
  }
});

test('starting requires an installed OCR folder', async () => {
  await assert.rejects(new OcrService(() => join(tmpdir(), 'no-ocr-here'), 'http://127.0.0.1:9').start(), /OCR_NOT_INSTALLED/);
});

test('the component installer refuses folders that are not the OCR trial', async () => {
  const { installOcr } = await import('../electron/components');
  await assert.rejects(
    installOcr(tmpdir(), join(tmpdir(), 'venv-never-created'), () => {}),
    /OCR_FOLDER_INVALID/,
  );
});

test('base installers exclude the heavy OCR runtime and the Receipt page installs it on demand', async () => {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(pkg.scripts['dist:win'], /bundle-ocr/);
  assert.doesNotMatch(pkg.scripts['dist:mac'], /bundle-ocr/);
  assert.doesNotMatch(pkg.scripts['dist:mac:x64'], /bundle-ocr/);
  assert.ok(
    pkg.build.extraResources.some((resource: any) => resource.to === 'ocr'),
    'small OCR application code still ships',
  );
  assert.ok(!pkg.build.extraResources.some((resource: any) => resource.to === 'ocr-runtime'), 'heavy OCR runtime must not ship');

  const receipt = await readFile(new URL('../src/receipt.tsx', import.meta.url), 'utf8');
  assert.match(receipt, /call\('ocrInstall'/);
  assert.match(receipt, /OCR เป็นส่วนเสริม ไม่ติดมากับตัวติดตั้งหลัก/);

  const main = await readFile(new URL('../electron/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /resourcesPath, 'ocr-runtime'/);
});

test('optional OCR component pins the Paddle build supported by each desktop architecture', () => {
  assert.equal(ocrComponentSpec('win32', 'x64')?.paddle, 'paddlepaddle==3.3.0');
  assert.equal(ocrComponentSpec('darwin', 'arm64')?.paddle, 'paddlepaddle==3.3.0');
  assert.equal(ocrComponentSpec('darwin', 'x64')?.paddle, 'paddlepaddle==3.0.0');
  assert.equal(ocrComponentSpec('linux', 'x64'), null);
});
