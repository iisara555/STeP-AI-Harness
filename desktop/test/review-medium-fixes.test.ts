// Regression tests for the three MEDIUM review findings on execution tranches 1-3 (M1, P1, P2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../electron/store';
import { Workbench } from '../electron/workbench';
import { defaultPolicy } from '../electron/policy';
import { sensitivePath } from '../electron/permissions';
const privacy: any = await import('../../src/modules/privacy/index.js');

async function fixture(scrub?: (text: string) => string) {
  const root = await mkdtemp(join(tmpdir(), 'step-medium-')),
    store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: root });
  const workbench = new Workbench(store, scrub, () => policy);
  return {
    root,
    store,
    workbench,
    async close() {
      await workbench.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
const review = (text: string) => {
  const result = privacy.evaluatePrivacyGate(text);
  if (result.action === 'block-external' || typeof result.redactedText !== 'string') throw new Error('PRIVACY_REVIEW_REQUIRED');
  return result.redactedText;
};

test('M1: one credential-bearing file is withheld instead of aborting the whole recursive search', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, 'docs'));
    await writeFile(join(f.root, 'docs', 'readme.txt'), 'project MARKER here');
    await writeFile(join(f.root, 'docs', 'setup.txt'), 'MARKER\ndb password: synthetic-fixture-value\n');
    const result = (await f.workbench.searchFiles('.', { pattern: 'MARKER' }, review)) as any;
    assert.deepEqual(result.matches, [{ path: 'docs/readme.txt', line: 1, text: 'project MARKER here' }]);
    assert.equal(result.withheldFiles, 1);
    assert.ok(!JSON.stringify(result).includes('synthetic-fixture-value'));
    // Any other review failure is still fatal (fail closed).
    await assert.rejects(
      f.workbench.searchFiles('.', { pattern: 'MARKER' }, () => {
        throw new Error('WORKSPACE_CHANGED');
      }),
      /WORKSPACE_CHANGED/,
    );
  } finally {
    await f.close();
  }
});

test('P1: a credential split across output chunks is masked completely and cursors stay stable', async () => {
  const scrub = (text: string) => privacy.evaluatePrivacyGate(text).redactedText;
  const f = await fixture(scrub);
  try {
    await writeFile(
      join(f.root, 'split.cjs'),
      "process.stdout.write('PRE password: Synthetic-'); setTimeout(()=>process.stdout.write('Tail-Value-987654\\nAFTER-MARKER\\n'),300)",
    );
    const task = await f.workbench.start(`"${process.execPath}" split.cjs`, 's');
    await new Promise(r => setTimeout(r, 150));
    const mid = (await f.workbench.inspectTask('s', task.id, { action: 'poll', offset: 0 })) as any;
    assert.ok(!mid.output.includes('Synthetic-'), 'an incomplete line is never exposed unscanned');
    for (let i = 0; i < 100 && f.workbench.tasks().find(t => t.id === task.id)?.status === 'running'; i++)
      await new Promise(r => setTimeout(r, 30));
    const done = (await f.workbench.inspectTask('s', task.id, { action: 'poll', offset: 0 })) as any;
    assert.doesNotMatch(done.output, /Tail-Value-987654|Synthetic-/);
    assert.match(done.output, /AFTER-MARKER/);
    // Already-delivered text is never rescanned, so an earlier endOffset still points at the same place.
    const after = (await f.workbench.inspectTask('s', task.id, { action: 'poll', offset: mid.endOffset })) as any;
    assert.equal(mid.output + after.output, done.output);
  } finally {
    await f.close();
  }
});

test('P1: output without a final newline is flushed at exit, and progress lines ending in CR are shown', async () => {
  const scrub = (text: string) => privacy.evaluatePrivacyGate(text).redactedText;
  const f = await fixture(scrub);
  try {
    await writeFile(join(f.root, 'cr.cjs'), "process.stdout.write('10%\\r'); setTimeout(()=>process.stdout.write('done-no-newline'),1500)");
    const task = await f.workbench.start(`"${process.execPath}" cr.cjs`, 's');
    for (let i = 0; i < 40 && !/10%/.test(f.workbench.tasks().find(t => t.id === task.id)!.output); i++)
      await new Promise(r => setTimeout(r, 25));
    assert.match(f.workbench.tasks().find(t => t.id === task.id)!.output, /10%/);
    assert.equal(f.workbench.tasks().find(t => t.id === task.id)!.status, 'running');
    for (let i = 0; i < 100 && f.workbench.tasks().find(t => t.id === task.id)?.status === 'running'; i++)
      await new Promise(r => setTimeout(r, 30));
    assert.match(f.workbench.tasks().find(t => t.id === task.id)!.output, /done-no-newline$/);
  } finally {
    await f.close();
  }
});

test('P2: common credential files outside the old list are protected paths', async () => {
  for (const name of ['.netrc', '_netrc', '.npmrc', '.pypirc', '.git-credentials', '.pgpass', 'vault.kdbx'])
    assert.ok(sensitivePath('/work/project/' + name), name);
  for (const name of ['netrc.md', 'npmrc-guide.txt', 'notes.txt']) assert.equal(sensitivePath('/work/project/' + name), undefined, name);
  const f = await fixture();
  try {
    await writeFile(join(f.root, '.netrc'), 'machine example.invalid login fixture password SyntheticNetrcValue42\n');
    await writeFile(join(f.root, 'notes.txt'), 'password mention only');
    await assert.rejects(f.workbench.read('.netrc'), /INVALID_PATH/);
    const result = (await f.workbench.searchFiles('.', { pattern: 'password' })) as any;
    assert.deepEqual(
      result.matches.map((m: any) => m.path),
      ['notes.txt'],
    );
  } finally {
    await f.close();
  }
});
