#!/usr/bin/env node
// Offline source-checkout validation only. Never loads credentials or invokes Google.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function checkContract(root) {
  const folder = resolve(root, 'skills/common/google-workspace');
  const [source, reference, fixtures] = await Promise.all([
    readFile(resolve(root, 'desktop/electron/google-operations.ts'), 'utf8'),
    readFile(resolve(folder, 'references/tool-contract.md'), 'utf8'),
    readFile(resolve(folder, 'references/tool-contract.json'), 'utf8').then(JSON.parse),
  ]);
  const block = /export const GOOGLE_OPERATIONS = \[([\s\S]*?)\] as const;/.exec(source);
  assert.ok(block, 'Native operation catalog not found');
  const extended = source.includes('Object.keys(EXTENDED_GOOGLE_OPERATIONS)')
    ? await readFile(resolve(root, 'desktop/electron/google-extended-operations.ts'), 'utf8') : '';
  const operations = [...block[1].matchAll(/'([a-zA-Z.]+)'/g), ...extended.matchAll(/^  '([a-zA-Z.]+)': define\(/gm)].map(match => match[1]).sort();
  assert.equal(new Set(operations).size, operations.length, 'Native operations must be unique');
  const documented = [...reference.matchAll(/^\| `([a-zA-Z.]+)` \|/gm)].map(match => match[1]).sort();
  const sampled = fixtures.operations.map(item => item.request.operation).sort();
  assert.deepEqual(documented, operations, 'Reference operations differ from the native catalog');
  assert.deepEqual(sampled, operations, 'Fixtures must cover every native operation exactly once');
  for (const item of fixtures.operations) {
    assert.ok(['read', 'write'].includes(item.effect), 'Fixture needs a read/write effect');
    assert.ok(item.service, 'Fixture needs a service');
  }
  return { status: 'checked-offline', operations: operations.length, liveGoogleVerified: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--root')) {
    process.stderr.write('Usage: node check-contract.mjs [--root /path/to/source-checkout]\n');
    process.exitCode = 1;
  } else {
    try {
      const root = args[1] || fileURLToPath(new URL('../../../../', import.meta.url));
      process.stdout.write(JSON.stringify(await checkContract(root)) + '\n');
    } catch (error) {
      process.stderr.write('Google Workspace contract check failed: ' + error.message + '\n');
      process.exitCode = 1;
    }
  }
}
