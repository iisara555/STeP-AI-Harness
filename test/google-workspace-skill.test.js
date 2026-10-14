import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { checkContract } from '../skills/common/google-workspace/scripts/check-contract.mjs';

test('native Workspace reference/checker covers the shipped operation catalog', async () => {
  assert.deepEqual(await checkContract(resolve('.')), {
    status: 'checked-offline', operations: 26, liveGoogleVerified: false,
  });
});

test('offline contract checker rejects a reference that promises an unsupported operation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-google-contract-'));
  try {
    const folder = 'skills/common/google-workspace/references';
    await Promise.all([mkdir(join(root, folder), { recursive: true }), mkdir(join(root, 'desktop/electron'), { recursive: true })]);
    const files = ['desktop/electron/google-operations.ts', `${folder}/tool-contract.md`, `${folder}/tool-contract.json`];
    for (const file of files) await writeFile(join(root, file), await readFile(file));
    const path = join(root, folder, 'tool-contract.md');
    await writeFile(path, (await readFile(path, 'utf8')) + '\n| `drive.share` | fileId | email | unsupported |\n');
    await assert.rejects(checkContract(root), /Reference operations differ/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
