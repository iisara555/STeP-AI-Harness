import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_GOOGLE_CLIENT_ID,
  googleClientBuildConfig,
  parseGoogleDesktopClient,
  readGoogleClientFile,
} from '../electron/google-client';
import { build } from 'esbuild';

const clientId = 'synthetic-client.apps.googleusercontent.com';
const secret = 'synthetic-client-secret';
const file = (client = clientId) => JSON.stringify({ installed: { client_id: client, client_secret: secret } });
test('published organization builds require the matching installed-app JSON and reject confidential Web clients', () => {
  assert.equal(googleClientBuildConfig(undefined), null);
  assert.throws(() => googleClientBuildConfig('', true), /^Error: GOOGLE_DESKTOP_CLIENT_JSON_REQUIRED$/);
  assert.deepEqual(googleClientBuildConfig(file(DEFAULT_GOOGLE_CLIENT_ID), true), {
    clientId: DEFAULT_GOOGLE_CLIENT_ID,
    clientSecret: secret,
  });
  assert.throws(() => googleClientBuildConfig(file()), /^Error: GOOGLE_CLIENT_MISMATCH$/);
  assert.throws(
    () => googleClientBuildConfig(JSON.stringify({ web: { client_id: DEFAULT_GOOGLE_CLIENT_ID, client_secret: secret } })),
    /^Error: GOOGLE_CLIENT_FILE_INVALID$/,
  );
});
test('compiled installed-app credentials are usable only for their exact client ID', async () => {
  const result = await build({
    entryPoints: ['electron/google-bundled-client.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    define: { __STEP_GOOGLE_DESKTOP_CLIENT__: JSON.stringify(googleClientBuildConfig(file(DEFAULT_GOOGLE_CLIENT_ID))) },
  });
  const compiled = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles![0].text).toString('base64'));
  assert.equal(compiled.bundledGoogleClientSecret(DEFAULT_GOOGLE_CLIENT_ID), secret);
  assert.equal(compiled.bundledGoogleClientSecret(clientId), undefined);
});
test('only the configured Desktop OAuth client can be imported', () => {
  assert.equal(parseGoogleDesktopClient('\uFEFF' + file(), clientId), secret);
  assert.throws(
    () => parseGoogleDesktopClient(file('other-client.apps.googleusercontent.com'), clientId),
    /^Error: GOOGLE_CLIENT_MISMATCH$/,
  );
  for (const value of [
    '{invalid private JSON',
    'null',
    '[]',
    JSON.stringify({ web: { client_id: clientId, client_secret: secret } }),
    JSON.stringify({ installed: { client_id: clientId } }),
    JSON.stringify({ installed: { client_id: clientId, client_secret: 'has\nnewline' } }),
    JSON.stringify({ installed: { client_id: clientId, client_secret: 'short' } }),
    file() + ' '.repeat(65536),
  ])
    assert.throws(() => parseGoogleDesktopClient(value, clientId), /^Error: GOOGLE_CLIENT_FILE_INVALID$/);
});
test('user-selected client files are bounded and filesystem errors disclose no path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-google-client-'));
  try {
    const path = join(dir, 'client.json');
    await writeFile(path, file());
    assert.equal(parseGoogleDesktopClient(await readGoogleClientFile(path), clientId), secret);
    await writeFile(path, 'x'.repeat(65537));
    await assert.rejects(readGoogleClientFile(path), /^Error: GOOGLE_CLIENT_FILE_INVALID$/);
    await assert.rejects(readGoogleClientFile(join(dir, 'private-missing.json')), /^Error: GOOGLE_CLIENT_FILE_INVALID$/);
    await assert.rejects(readGoogleClientFile(dir), /^Error: GOOGLE_CLIENT_FILE_INVALID$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
