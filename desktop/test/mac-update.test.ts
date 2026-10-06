import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appBundlePath, downloadVerified, FEED_DOWNLOAD_BASE, macUpdateAsset, swapScript } from '../electron/mac-update';

test('only the zip for this processor from the feed is downloaded', () => {
  const files = [
    { url: 'STeP-Desktop-0.5.18-arm64.zip', sha512: 'a', size: 10 },
    { url: 'STeP-Desktop-0.5.18-arm64.dmg', sha512: 'b' },
    { url: 'STeP-Desktop-0.5.18-x64.zip', sha512: 'c' },
  ];
  assert.deepEqual(macUpdateAsset(files, '0.5.18', 'arm64'), {
    url: `${FEED_DOWNLOAD_BASE}STeP-Desktop-0.5.18-arm64.zip`,
    name: 'STeP-Desktop-0.5.18-arm64.zip',
    sha512: 'a',
    size: 10,
  });
  assert.equal(macUpdateAsset(files, '0.5.18', 'x64')?.sha512, 'c');
  assert.equal(macUpdateAsset(files, '0.5.19', 'arm64'), null, 'a version the feed does not list');
  assert.equal(macUpdateAsset([{ url: 'STeP-Desktop-0.5.18-arm64.zip' }], '0.5.18', 'arm64'), null, 'no checksum, no download');
  assert.equal(macUpdateAsset(files, '../evil', 'arm64'), null);
});

test('the app is replaced in place only from a real install, never from the disk image or a translocated copy', () => {
  assert.equal(appBundlePath('/Applications/STeP Desktop.app/Contents/MacOS/STeP Desktop'), '/Applications/STeP Desktop.app');
  assert.equal(appBundlePath('/Volumes/STeP Desktop 0.5.17/STeP Desktop.app/Contents/MacOS/STeP Desktop'), null);
  assert.equal(appBundlePath('/private/var/folders/x/AppTranslocation/ABC/d/STeP Desktop.app/Contents/MacOS/STeP Desktop'), null);
  assert.equal(appBundlePath('/usr/local/bin/step'), null);
});

test('a download is kept only when its sha512 matches the feed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-mac-update-'));
  const body = Buffer.from('synthetic update zip '.repeat(1000));
  const sha512 = createHash('sha512').update(body).digest('base64');
  const fetchImpl = async () => new Response(body);
  const progress: number[] = [];
  const asset = { url: 'https://example.invalid/a.zip', name: 'a.zip', sha512, size: body.length };
  const file = await downloadVerified(asset, join(dir, 'a.zip'), p => progress.push(p), fetchImpl);
  assert.deepEqual(await readFile(file), body);
  assert.equal(progress.at(-1), 100);
  await assert.rejects(
    downloadVerified({ ...asset, sha512: 'wrong' }, join(dir, 'b.zip'), () => {}, fetchImpl),
    /UPDATE_CHECKSUM_MISMATCH/,
  );
  assert.equal(existsSync(join(dir, 'b.zip')), false, 'a file that fails the check is removed');
  await assert.rejects(
    downloadVerified(
      asset,
      join(dir, 'c.zip'),
      () => {},
      async () => new Response('nope', { status: 404 }),
    ),
    /UPDATE_DOWNLOAD_FAILED/,
  );
  await rm(dir, { recursive: true, force: true });
});

test('the swap script quotes every path', () => {
  const script = swapScript("/Applications/STeP Desktop's.app", "/tmp/a b/u'pdate.zip", 42);
  assert.match(script, /'\/Applications\/STeP Desktop'\\''s\.app'/);
  assert.match(script, /while \/bin\/kill -0 42 /);
  assert.ok(!/\$\(|`/.test(script.replace('"$NEW"', '').replace('"$0"', '')), 'no command substitution from paths');
});

test('a filesystem write error rejects the download without an uncaught exception', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-update-write-error-'));
  try {
    const dest = join(dir, 'a.zip');
    await mkdir(dest);
    // Isolate the unhandled-stream regression from the test runner itself.
    const source = `
      import assert from 'node:assert/strict';
      import { createHash } from 'node:crypto';
      import { downloadVerified } from ${JSON.stringify(new URL('../electron/mac-update.ts', import.meta.url).href)};
      const bytes = Buffer.from('synthetic update');
      const asset = { url: 'https://example.invalid/a.zip', name: 'a.zip', sha512: createHash('sha512').update(bytes).digest('base64') };
      await assert.rejects(downloadVerified(asset, ${JSON.stringify(dest)}, () => {}, async () => new Response(bytes)), error => ['EISDIR', 'EPERM', 'EACCES'].includes(error.code));
    `;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(dest), true, 'do not remove a preexisting directory on failure');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a response stream failure rejects the download and removes incomplete bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-update-interrupted-'));
  try {
    const dest = join(dir, 'a.zip');
    let reads = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (reads++ === 0) controller.enqueue(Buffer.from('partial synthetic archive'));
        else controller.error(new Error('SYNTHETIC_READ_FAILURE'));
      },
    });
    await assert.rejects(
      downloadVerified(
        { url: 'https://example.invalid/a.zip', name: 'a.zip', sha512: 'unused' },
        dest,
        () => {},
        async () => new Response(stream),
      ),
      /SYNTHETIC_READ_FAILURE/,
    );
    assert.equal(existsSync(dest), false, 'an interrupted archive must not remain');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  'the swap installs the canonical archive bundle even when the installed app was renamed',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'step-update-renamed-'));
    const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
    try {
      const tools = join(root, 'tools');
      await mkdir(tools);
      const stubs = {
        ditto: '#!/bin/bash\n/bin/mkdir -p "$4/STeP Desktop.app"\nprintf new > "$4/STeP Desktop.app/marker"\n',
        codesign: '#!/bin/bash\nexit 0\n',
        xattr: '#!/bin/bash\nexit 0\n',
        open: '#!/bin/bash\nexit 0\n',
      };
      for (const [name, content] of Object.entries(stubs)) await writeFile(join(tools, name), content, { mode: 0o700 });
      for (const [index, name] of ['STeP Desktop.app', "STeP Desktop's copy.app"].entries()) {
        const folder = join(root, String(index)),
          bundle = join(folder, name),
          zip = join(folder, 'a.zip');
        await mkdir(bundle, { recursive: true });
        await writeFile(join(bundle, 'marker'), 'old');
        await writeFile(zip, 'synthetic zip');
        let script = swapScript(bundle, zip, 99999999);
        for (const tool of Object.keys(stubs)) script = script.replaceAll(`/usr/bin/${tool}`, quote(join(tools, tool)));
        const file = join(folder, 'swap.sh');
        await writeFile(file, script);
        const result = spawnSync('/bin/bash', [file], { encoding: 'utf8', timeout: 10000 });
        assert.equal(result.status, 0, `${name}: ${result.stderr}`);
        assert.equal(await readFile(join(bundle, 'marker'), 'utf8'), 'new');
        assert.equal(existsSync(zip), false);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

// Runs the real script with macOS's ditto and codesign: an ad-hoc signed bundle is swapped for its update.
test(
  'macOS: the swap script replaces the app with the signed update and keeps the old one when the update is broken',
  { skip: process.platform !== 'darwin' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'step-mac-swap-'));
    const makeApp = async (dir: string, version: string) => {
      const app = join(dir, 'STeP Desktop.app');
      await mkdir(join(app, 'Contents', 'MacOS'), { recursive: true });
      await writeFile(
        join(app, 'Contents', 'Info.plist'),
        `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>th.test.step</string><key>CFBundleExecutable</key><string>STeP Desktop</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`,
      );
      await writeFile(join(app, 'Contents', 'MacOS', 'STeP Desktop'), `#!/bin/sh\necho ${version}\n`, { mode: 0o755 });
      execFileSync('/usr/bin/codesign', ['--force', '--deep', '-s', '-', app]);
      return app;
    };
    const original = await makeApp(join(root, 'Applications'), '1.0.0');
    const installed = join(root, 'Applications', "STeP Desktop's copy.app");
    await rename(original, installed);
    const next = await makeApp(join(root, 'build'), '2.0.0');
    const zip = join(root, 'update.zip');
    execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', next, zip]);
    const script = join(root, 'swap.sh');
    // No process has pid 999999, so the script starts at once; `open` is not wanted in CI.
    await writeFile(script, swapScript(installed, zip, 999999).replaceAll('/usr/bin/open', 'true'), { mode: 0o700 });
    const ran = spawnSync('/bin/bash', [script], { encoding: 'utf8' });
    assert.equal(ran.status, 0, ran.stderr);
    assert.match(await readFile(join(installed, 'Contents', 'MacOS', 'STeP Desktop'), 'utf8'), /2\.0\.0/);
    assert.equal(existsSync(zip), false, 'the downloaded zip is removed');

    // A tampered update fails the signature check and the installed app stays as it was.
    await writeFile(join(next, 'Contents', 'MacOS', 'STeP Desktop'), '#!/bin/sh\necho tampered\n', { mode: 0o755 });
    execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', next, zip]);
    await writeFile(script, swapScript(installed, zip, 999999).replaceAll('/usr/bin/open', 'true'), { mode: 0o700 });
    const refused = spawnSync('/bin/bash', [script], { encoding: 'utf8' });
    assert.notEqual(refused.status, 0);
    assert.match(await readFile(join(installed, 'Contents', 'MacOS', 'STeP Desktop'), 'utf8'), /2\.0\.0/);
    await rm(root, { recursive: true, force: true });
  },
);
