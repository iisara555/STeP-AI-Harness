import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, symlink, writeFile, link, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../electron/store';
import { Memories, memoryMarkdown, parseMemory, extractPreferences } from '../electron/memory';
import { defaultPolicy, parsePolicy } from '../electron/policy';
import { WorkspaceContext } from '../electron/workspace-context';
import { Workbench } from '../electron/workbench';
import { ocrAttachmentReport } from '../electron/ocr-attachment';
import { attachmentReason } from '../electron/attachments';
import { DatabaseSync } from 'node:sqlite';
const privacy: any = await import('../../src/modules/privacy/index.js');
const scan = privacy.evaluatePrivacyGate;
const entry = { name: 'Style', text: 'Prefer concise responses.', type: 'user', scope: 'private', importance: 0.7, ttl_days: 0 };
test('version-one stores migrate to FTS without replaying interrupted sessions', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-fts-migrate-')),
    path = join(home, 'workspace.sqlite');
  const source = new Store(':memory:');
  const s = source.create('c', 'cc');
  s.status = 'running';
  s.messages.push({ role: 'user', text: 'Earlier searchable project', at: '2026-09-30T00:00:00Z' });
  source.close();
  const old = new DatabaseSync(path);
  old.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id)); PRAGMA user_version=1;');
  old.prepare('INSERT INTO records VALUES(?,?,?)').run('session', s.id, JSON.stringify(s));
  old.close();
  const migrated = new Store(path);
  assert.equal(migrated.session(s.id).status, 'interrupted');
  assert.deepEqual(migrated.search('searchable'), [s.id]);
  migrated.close();
});

test('memory schema, explicit confirmation, evidence, privacy, edit and deletion', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-memory-'));
  const store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: '', team: 'cc' });
  const memories = new Memories(store, home, () => policy, scan);
  const s = store.create('c', 'cc');
  s.status = 'review';
  s.messages.push({ role: 'user', text: 'ตอบเป็นภาษาไทยและสรุปกระชับ', at: new Date().toISOString() });
  s.messages.push({ role: 'assistant', text: 'Prefer tables', at: new Date().toISOString() });
  await memories.dream(s);
  assert.equal((await memories.list()).length, 0);
  assert.equal(memories.proposals().length, 2);
  assert.equal(
    extractPreferences(s).some(p => p.text.includes('tables')),
    false,
  );
  const proposal = memories.proposals()[0];
  const m = await memories.confirm(proposal.id, { name: 'Response style' });
  assert.equal(parseMemory(memoryMarkdown(m)).text, m.text);
  assert.ok((await readFile(join(home, 'memory', m.id + '.md'), 'utf8')).includes('schema_version: 1'));
  assert.equal((await memories.relevant('Hello')).length, 1);
  for (const text of [
    'Contact fake.person@example.test',
    'โทร 0812345678',
    'OPENAI_API_KEY=sk-' + 'A'.repeat(40),
    'Name: Test Person\nAddress: Test address',
  ]) {
    await assert.rejects(memories.save({ ...entry, text }), /MEMORY_PRIVACY_BLOCKED/);
  }
  const edited = await memories.save({ ...m, text: 'Prefer clear responses.' });
  assert.equal(edited.id, m.id);
  await memories.remove(m.id);
  assert.equal((await memories.list()).length, 0);
  store.close();
});
test('workspace memory and proposals cannot cross roots; team memory needs policy and correct team', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-memory-scope-')),
    a = join(home, 'a'),
    b = join(home, 'b'),
    team = join(home, 'team');
  await Promise.all([mkdir(a), mkdir(b), mkdir(team)]);
  const store = new Store(':memory:');
  let policy = defaultPolicy();
  store.put('settings', 'main', { workspace: a, team: 'cc' });
  const memories = new Memories(store, home, () => policy, scan);
  await memories.save({ ...entry, scope: 'project' });
  await assert.rejects(memories.save({ ...entry, scope: 'team' }), /MEMORY_TEAM_DISABLED/);
  store.put('settings', 'main', { workspace: b, team: 'cc' });
  assert.equal((await memories.list()).length, 0);
  policy = { ...policy, features: { ...policy.features, memoryTeam: true }, memory: { teamDirectories: { cc: team } } };
  await memories.save({ ...entry, scope: 'team' });
  assert.equal((await memories.list()).length, 1);
  store.put('settings', 'main', { workspace: b, team: 'afp' });
  assert.equal((await memories.list()).length, 0);
  assert.ok(parsePolicy({ memory: { teamDirectories: { cc: 'relative/path' } }, features: { memoryTeam: true } }).problems.length);
  policy.permission.pathRules = [{ pattern: '.step/**', allow: false }];
  await assert.rejects(memories.save({ ...entry, scope: 'project' }), /PATH_RULE_DENIED/);
  store.close();
});
test('expired memory, hard-linked files and symlink directories never enter prompts', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-memory-expiry-')),
    workspace = join(home, 'work');
  await mkdir(workspace);
  const store = new Store(':memory:');
  store.put('settings', 'main', { workspace, team: 'cc' });
  const policy = defaultPolicy();
  const memories = new Memories(store, home, () => policy, scan);
  const m = await memories.save({ ...entry, ttl_days: 1 });
  await writeFile(join(home, 'memory', m.id + '.md'), memoryMarkdown({ ...m, updated_at: '2020-01-01T00:00:00.000Z' }));
  assert.equal((await memories.relevant('Hi')).length, 0);
  assert.equal((await memories.list())[0].expired, true);
  const memoryPath = join(home, 'memory', m.id + '.md'),
    linkedPath = join(home, 'external-memory.md'),
    original = await readFile(memoryPath, 'utf8');
  await link(memoryPath, linkedPath);
  assert.equal((await memories.list()).length, 0);
  await assert.rejects(memories.save({ ...m, text: 'Prefer clear responses.' }), /MEMORY_NOT_FOUND/);
  await assert.rejects(memories.remove(m.id), /MEMORY_NOT_FOUND/);
  assert.equal(await readFile(linkedPath, 'utf8'), original);
  await unlink(linkedPath);
  assert.equal((await memories.list()).length, 1);
  await mkdir(join(workspace, '.step'));
  await symlink(home, join(workspace, '.step', 'memory'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(memories.save({ ...entry, scope: 'project' }), /INVALID_PATH/);
  store.close();
});
test('workspace instructions and styles load bounded, approved files only', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-persona-'));
  const store = new Store(':memory:');
  store.put('settings', 'main', { workspace: home, team: 'cc', outputStyle: 'table.md' });
  await mkdir(join(home, '.step', 'output-styles'), { recursive: true });
  await writeFile(join(home, 'STEP.md'), 'Prefer Markdown tables.');
  await writeFile(join(home, 'ASSISTANT.md'), 'Use a concise tone.');
  await writeFile(join(home, '.step', 'output-styles', 'table.md'), 'Use tables for comparisons.');
  const ctx = new WorkspaceContext(new Workbench(store, s => s, defaultPolicy), home, () => store.settings(), scan);
  assert.deepEqual(
    (await ctx.load()).map(p => p.path),
    ['STEP.md', 'ASSISTANT.md', '.step/output-styles/table.md'],
  );
  assert.deepEqual(await ctx.styles(), ['table.md']);
  await writeFile(join(home, 'AGENTS.md'), 'email: fake.person@example.test');
  await assert.rejects(ctx.load(), /MEMORY_PRIVACY_BLOCKED/);
  store.close();
});
test('SQLite search backfills existing sessions; resume, fork, exports and delete stay isolated', () => {
  const store = new Store(':memory:'),
    s = store.create('c', 'cc');
  s.messages = [{ role: 'user', text: 'ประชุมโครงการ Alpha', at: '2026-09-30T00:00:00Z' }];
  s.files = [{ name: 'reference.txt', text: 'Distinct evidence', at: '2026-09-30T00:00:00Z' }];
  s.consentedAt = 'today';
  s.allowedIdentifiers = ['0123456789012'];
  s.draft = 'Editable draft';
  s.status = 'interrupted';
  store.save(s);
  assert.deepEqual(store.search('โครงการ'), [s.id]);
  assert.deepEqual(store.search('Distinct'), [s.id]);
  assert.deepEqual(store.search('Alpha" OR x'), []);
  assert.equal(store.resume(s.id).status, 'interrupted');
  const fork = store.fork(s.id);
  assert.equal(fork.parentId, s.id);
  assert.equal(fork.status, 'idle');
  assert.equal(fork.consentedAt, undefined);
  assert.equal(fork.allowedIdentifiers, undefined);
  store.edit(fork.id, 'Changed draft', fork.revision);
  assert.equal(store.session(s.id).draft, 'Editable draft');
  const exported = JSON.parse(store.exportSession(s.id, 'json'));
  assert.equal(exported.connectionId, undefined);
  assert.equal(exported.consentedAt, undefined);
  assert.ok(store.exportSession(s.id, 'md').includes('reference.txt'));
  store.remove('session', s.id);
  assert.deepEqual(store.search('Alpha'), [fork.id]);
  store.close();
});
test('OCR attachments require complete pages and mask detected identifiers', () => {
  const text = 'Receipt email: fake.person@example.test';
  const report = ocrAttachmentReport({ text, pages: [{ lines: [{ text }] }] }, scan);
  assert.ok(!report.redactedText.includes('fake.person@example.test'));
  assert.equal(attachmentReason(report), undefined);
  assert.equal(
    attachmentReason(ocrAttachmentReport({ text: 'first page', pages: [{ text: 'first page' }, { text: '' }] }, scan)),
    'ATTACH_PAGES_WITHOUT_TEXT',
  );
  assert.equal(attachmentReason(ocrAttachmentReport({ text: '', pages: [] }, scan)), 'ATTACH_NO_TEXT');
});
