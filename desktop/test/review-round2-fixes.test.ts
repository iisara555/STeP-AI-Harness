// Regression tests for the second review round of execution tranches 1-3 (R2-M1, R2-L1, R2-L2) and the remaining
// first-round LOW findings (L1 cancel approval text, L2 truncation flag without an offset, L3 parser hint).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../electron/store';
import { Workbench } from '../electron/workbench';
import { defaultPolicy } from '../electron/policy';
import { sensitivePath } from '../electron/permissions';
import { brokenRequests } from '../src/tools';
// PowerShell (Windows) needs the call operator to run a quoted executable path.
const node = `${process.platform === 'win32' ? '& ' : ''}"${process.execPath}"`;
const privacy: any = await import('../../src/modules/privacy/index.js');

const SECRET = 'TailValue987654';
const scrub = (text: string) => privacy.evaluatePrivacyGate(text).redactedText;
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'step-round2-')),
    store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: root });
  const workbench = new Workbench(store, scrub, () => policy);
  return {
    root,
    store,
    workbench,
    async run(name: string, body: string) {
      await writeFile(join(root, name), body);
      const task = await workbench.start(`${node} ${name}`, 's');
      const seen: string[] = [];
      for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 20));
        const current = workbench.tasks().find(t => t.id === task.id)!;
        seen.push(current.output);
        if (current.status !== 'running') break;
      }
      return { task, seen, final: workbench.tasks().find(t => t.id === task.id)!.output };
    },
    async close() {
      await workbench.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
const leaks = (texts: string[]) => texts.some(t => t.includes(SECRET) || t.includes('Synthetic'));

test('R2-M1: a read over 8,000 characters never releases its unfinished credential line unscanned', async () => {
  const f = await fixture();
  try {
    // Many short lines in one read, ending in a partial credential line.
    const a = await f.run(
      'big.cjs',
      `process.stdout.write('ok line\\n'.repeat(1200) + 'PRE password: Synthetic-'); setTimeout(()=>process.stdout.write('${SECRET}\\nMARK\\n'),300)`,
    );
    assert.ok(!leaks(a.seen), a.final.slice(-120));
    assert.match(a.final, /PRE \[credential-redacted\]/);
    assert.match(a.final, /MARK\n$/);
    // Split before the colon, at the 8,000-character boundary: neither half matches alone.
    const b = await f.run(
      'colon.cjs',
      `process.stdout.write('ok line\\n'.repeat(1000) + 'db passw'); setTimeout(()=>process.stdout.write('ord: Synthetic${SECRET}\\nEND\\n'),300)`,
    );
    assert.ok(!leaks(b.seen), b.final.slice(-120));
    assert.match(b.final, /\[credential-redacted\]/);
    assert.match(b.final, /END\n$/);
    // A genuine line over 8,000 characters whose credential straddles the forced release.
    const c = await f.run(
      'long.cjs',
      `process.stdout.write('x'.repeat(7990) + ' password: Synthetic-'); setTimeout(()=>process.stdout.write('${SECRET}\\nMARK\\n'),300)`,
    );
    assert.ok(!leaks(c.seen), c.final.slice(-120));
    // A long token without spaces is not split at the forced release either.
    const d = await f.run(
      'token.cjs',
      `process.stdout.write('y '.repeat(4200) + 'sk-abcdefghij'); setTimeout(()=>process.stdout.write('klmnopqrstuvwxyz${SECRET}\\nMARK\\n'),300)`,
    );
    assert.ok(!d.seen.some(t => /sk-abcdefghij|klmnopq/.test(t)), d.final.slice(-120));
  } finally {
    await f.close();
  }
});

test('R2-L1: a credential value on the line after its key is masked when the lines arrive separately', async () => {
  const f = await fixture();
  try {
    const r = await f.run(
      'yaml.cjs',
      `process.stdout.write('password:\\n'); setTimeout(()=>process.stdout.write('  Synthetic-${SECRET}\\nMARK\\n'),300)`,
    );
    assert.ok(!leaks(r.seen), r.final);
    assert.match(r.final, /MARK\n$/);
  } finally {
    await f.close();
  }
});

test('stream masking stays append-only: earlier cursors never move', async () => {
  const f = await fixture();
  try {
    const r = await f.run(
      'cursor.cjs',
      `process.stdout.write('A1\\nB2 passw'); setTimeout(()=>process.stdout.write('ord: Synthetic${SECRET}\\nC3\\n'),200); setTimeout(()=>process.stdout.write('D4\\n'),400)`,
    );
    for (let i = 1; i < r.seen.length; i++) assert.ok(r.seen[i].startsWith(r.seen[i - 1]), JSON.stringify(r.seen.slice(i - 1, i + 1)));
    assert.ok(!leaks(r.seen));
    assert.match(r.final, /D4\n$/);
  } finally {
    await f.close();
  }
});

test('L2: a poll without an offset reports output that was already lost', async () => {
  const f = await fixture();
  try {
    const r = await f.run('lots.cjs', `process.stdout.write(('z'.repeat(99)+'\\n').repeat(1200))`);
    const poll = (await f.workbench.inspectTask('s', r.task.id, { action: 'poll' })) as any;
    assert.equal(poll.offset, 20000);
    assert.equal(poll.truncated, true);
    // A cursor at or after the retained start loses nothing.
    const later = (await f.workbench.inspectTask('s', r.task.id, { action: 'poll', offset: 30000 })) as any;
    assert.equal(later.truncated, false);
  } finally {
    await f.close();
  }
});

test('R2-L2: further common credential files are protected paths without false positives', () => {
  for (const name of ['.vault-token', '.htpasswd', '.my.cnf', '.s3cfg', '.yarnrc.yml', 'pip.conf', 'pip.ini', '.boto'])
    assert.ok(sensitivePath('/work/project/' + name), name);
  // Windows ignores trailing dots and spaces and opens the default data stream.
  for (const name of ['.netrc.', '.netrc ', '.netrc::$DATA', '.npmrc. .'])
    assert.ok(sensitivePath('C:\\Users\\u\\' + name), JSON.stringify(name));
  for (const name of ['my.cnf.md', 'pip.conf.example', 'htpasswd-guide.txt', 's3cfg.md'])
    assert.equal(sensitivePath('/work/project/' + name), undefined, name);
});

test('L3: a broken request names the field and the expected type', () => {
  const problems = brokenRequests('```step-tool\n{"tool":"files","input":"a.txt","args":{"offset":"40000"}}\n```');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /args\.offset/);
  assert.match(problems[0], /integer/);
});
