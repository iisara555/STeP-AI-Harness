// A saved workspace can disappear. Disabled Skill Packs must not make creating, sending or deleting chat fail.
// All records and replies are synthetic; only the local fake provider is contacted.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const server = createServer(async (req, res) => {
  for await (const _chunk of req) {
    /* Consume the synthetic request. */
  }
  if (req.url === '/hook') {
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"decision":"block"}');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Synthetic reply' } }] }) + '\n\ndata: [DONE]\n\n');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const home = await mkdtemp(join(tmpdir(), 'step-missing-workspace-'));
const workspace = join(home, 'missing-workspace');
const existingId = 'synthetic-existing';
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
const insert = db.prepare('INSERT INTO records VALUES(?,?,?)');
insert.run(
  'settings',
  'main',
  JSON.stringify({
    team: 'cc',
    assistant: 'STeP Mate',
    workspace,
    theme: 'light',
    onboarding: true,
    whatsNewSeen: '999.0.0',
    tourDone: true,
    consentedAt: new Date().toISOString(),
    termsVersion: '2026-10-02',
  }),
);
insert.run(
  'session',
  existingId,
  JSON.stringify({
    id: existingId,
    title: 'Synthetic existing task',
    team: 'cc',
    connectionId: '',
    messages: [],
    draft: '',
    revision: 0,
    versions: [],
    proposals: [],
    originalQuery: '',
    answers: [],
    clarification: false,
    status: 'idle',
    updatedAt: new Date().toISOString(),
    sources: [],
  }),
);
db.close();
const env = {
  ...process.env,
  STEP_DESKTOP_TEST_HOME: home,
  STEP_DISABLE_UPDATES: '1',
  STEP_TEST_PRESET_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = s => Buffer.from('k' + s);
    safeStorage.decryptString = b => b.toString().slice(1);
  });
  const connectionId = await page.evaluate(async () => {
    const connection = await window.step.call('connection', {
      provider: 'compatible',
      mode: 'api',
      preset: 'groq',
      apiKey: 'k',
      model: 'm',
    });
    await window.step.call('connect', { id: connection.id });
    return connection.id;
  });
  const operations = await page.evaluate(
    async ({ connectionId, existingId }) => {
      let createdId = '';
      const failures = [];
      try {
        createdId = (await window.step.call('create', { connectionId })).id;
      } catch (error) {
        failures.push(`create: ${String(error).includes('ENOENT') ? 'ENOENT' : 'failed'}`);
      }
      try {
        await window.step.call('remove', { id: existingId });
      } catch (error) {
        failures.push(`remove: ${String(error).includes('ENOENT') ? 'ENOENT' : 'failed'}`);
      }
      return { failures, createdId };
    },
    { connectionId, existingId },
  );
  assert.deepEqual(operations.failures, [], 'a missing workspace must not block chat create or history deletion when packs are off');
  const snapshot = await page.evaluate(() => window.step.call('snapshot'));
  assert.equal(
    snapshot.sessions.some(s => s.id === existingId),
    false,
    'the synthetic history was deleted',
  );
  assert.equal(snapshot.policy.features.skillPacks, false);
  await page.evaluate(
    id => window.step.call('send', { id, text: 'Synthetic chat question', mode: 'chat', attachments: [] }),
    operations.createdId,
  );
  await expect
    .poll(
      async () => {
        const s = (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === operations.createdId);
        return s?.messages.filter(m => m.role === 'assistant').at(-1)?.text;
      },
      { timeout: 30000 },
    )
    .toBe('Synthetic reply');
  assert.equal(existsSync(workspace), false, 'chat must not silently recreate the missing employee folder');
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === operations.createdId)?.status)
    .not.toMatch(/running|queued/);
  // Disabling pack discovery never bypasses an organization's managed hook.
  await writeFile(
    join(home, 'desktop-policy.json'),
    JSON.stringify({
      features: { skillPacks: false },
      hooks: [
        {
          event: 'session_end',
          type: 'http',
          url: `http://127.0.0.1:${server.address().port}/hook`,
          timeoutSeconds: 5,
          blockOnFailure: true,
        },
      ],
    }),
  );
  await expect.poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).policy.hooks, { timeout: 10000 }).toBe(1);
  await assert.rejects(
    page.evaluate(id => window.step.call('remove', { id }), operations.createdId),
    /HOOK_BLOCKED/,
  );
  console.log(
    'Missing-workspace smoke passed: create, send and delete work with disabled packs; managed hooks still block; folder is not recreated.',
  );
} finally {
  await app.close();
  server.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
