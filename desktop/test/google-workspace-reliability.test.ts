import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { GoogleWorkspace } from '../electron/google-workspace';
import { googleInvocation, type GoogleRequest } from '../electron/google-operations';
import { googleScriptContentHash } from '../electron/google-validation';
import { googleMailContent } from '../electron/google-mail';
import { DEFAULT_GOOGLE_SERVICES } from '../src/google-services';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const context = () => ({ signal: new AbortController().signal, check: async () => {}, approve: async () => true });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
const nextTurn = () => new Promise<void>(done => setImmediate(done));
const read: GoogleRequest = { operation: 'docs.get', params: { documentId: 'demo_doc' } };
function fixture(expired = false) {
  const dir = mkdtempSync(join(tmpdir(), 'step-google-reliability-'));
  const store = new Store(join(dir, 'store.sqlite'));
  const vault = new Vault(join(dir, 'vault.sqlite'), { wrap: s => Buffer.from(s), unwrap: b => b.toString() });
  const config = { clientId: 'fixture.apps.googleusercontent.com', domains: ['example.test'], services: [...DEFAULT_GOOGLE_SERVICES] };
  let subject = 'fixture-one';
  let handler: (url: string, init: RequestInit) => Promise<Response> = async () => json({ documentId: 'demo_doc' });
  const google = new GoogleWorkspace(
    store,
    vault,
    () => config,
    async () => {},
    async (url, init = {}) => handler(String(url), init),
    async (_config, scopes) => ({
      who: { sub: subject, email: 'same-prefix-' + subject + '@example.test', hd: 'example.test' },
      scopes,
      tokens: { access: 'synthetic-access', refresh: 'synthetic-refresh', expires: expired ? 0 : Date.now() + 3600000 },
    }),
  );
  return {
    google,
    store,
    vault,
    respond: (fn: typeof handler) => {
      handler = fn;
    },
    identity: (value: string) => {
      subject = value;
    },
    connect: async () => {
      await google.connect([...DEFAULT_GOOGLE_SERVICES], context());
      return google.state().accounts.find(a => store.get<any>('google-account', a.id)!.subject === subject)!.id;
    },
    clean: () => {
      vault.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('temporary token failures keep the account usable and a later explicit read can recover', async () => {
  for (const failure of ['network', 'server', 'quota', 'malformed']) {
    const f = fixture(true);
    try {
      const id = await f.connect();
      let calls = 0;
      f.respond(async () => {
        calls++;
        if (failure === 'network') throw new Error('synthetic offline');
        if (failure === 'server') return json({ error: 'synthetic' }, 503);
        if (failure === 'quota') return json({ error: 'synthetic' }, 429);
        return json({ access_token: 1, token_type: 'Bearer', expires_in: 3600 });
      });
      await assert.rejects(f.google.execute(id, read, context()), /GOOGLE_REQUEST_FAILED|GOOGLE_QUOTA_LIMIT|GOOGLE_RESPONSE_INVALID/);
      assert.equal(calls, 1, failure + ': no automatic retry');
      assert.equal(f.google.state().accounts[0].reauth, false, failure);
      assert.equal(f.google.catalog('session').length, 1, failure);
      f.respond(async url =>
        url.endsWith('/token')
          ? json({ access_token: 'new-access', token_type: 'Bearer', expires_in: 3600 })
          : json({ documentId: 'demo_doc' }),
      );
      assert.equal((await f.google.execute(id, read, context())).status, 'completed', failure);
    } finally {
      f.clean();
    }
  }
});

test('a revoked refresh grant still requires reauthorization without exposing upstream diagnostics', async () => {
  const f = fixture(true);
  try {
    const id = await f.connect();
    f.respond(async () => json({ error: 'invalid_grant', error_description: 'synthetic private diagnostic' }, 400));
    await assert.rejects(f.google.execute(id, read, context()), /^Error: GOOGLE_REAUTH_REQUIRED$/);
    assert.equal(f.google.state().accounts[0].reauth, true);
    assert.equal(f.google.catalog('session').length, 0);
  } finally {
    f.clean();
  }
});

test('cancelling either waiter leaves a shared token refresh available to the other task', async () => {
  for (const cancelFirst of [true, false]) {
    const f = fixture(true);
    const release = deferred();
    try {
      const id = await f.connect();
      const started = deferred();
      const owner = new AbortController(),
        waiter = new AbortController();
      let calls = 0,
        refreshSignal: AbortSignal | undefined;
      f.respond(async (url, init) => {
        if (url.endsWith('/token')) {
          calls++;
          refreshSignal = init.signal!;
          started.resolve();
          await release.promise;
          if (init.signal?.aborted) throw new Error('synthetic abort');
          return json({ access_token: 'new-access', token_type: 'Bearer', expires_in: 3600 });
        }
        assert.equal((init.headers as any).authorization, 'Bearer new-access');
        return json({ documentId: 'demo_doc' });
      });
      const a = f.google.execute(id, read, { ...context(), signal: owner.signal });
      await started.promise;
      const b = f.google.execute(id, read, { ...context(), signal: waiter.signal });
      const rejected = assert.rejects(cancelFirst ? a : b, /^Error: CANCELLED$/);
      await nextTurn();
      (cancelFirst ? owner : waiter).abort();
      await rejected;
      assert.equal(refreshSignal!.aborted, false);
      release.resolve();
      assert.equal((await (cancelFirst ? b : a)).status, 'completed');
      assert.equal(calls, 1);
    } finally {
      release.resolve();
      f.clean();
    }
  }
});

test('the last cancelled refresh waiter releases the request and does not poison the next refresh', async () => {
  const f = fixture(true);
  try {
    const id = await f.connect(),
      started = deferred();
    const controller = new AbortController();
    let calls = 0,
      previousSignal: AbortSignal | undefined;
    f.respond(async (url, init) => {
      if (!url.endsWith('/token')) return json({ documentId: 'demo_doc' });
      if (++calls === 1) {
        previousSignal = init.signal!;
        started.resolve();
        return new Promise((_resolve, reject) =>
          init.signal!.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }),
        );
      }
      return json({ access_token: 'new-access', token_type: 'Bearer', expires_in: 3600 });
    });
    const pending = f.google.execute(id, read, { ...context(), signal: controller.signal });
    const rejected = assert.rejects(pending, /^Error: CANCELLED$/);
    await started.promise;
    controller.abort();
    await rejected;
    assert.equal(previousSignal!.aborted, true);
    assert.equal((await f.google.execute(id, read, context())).status, 'completed');
    assert.equal(calls, 2);
    assert.equal(f.google.state().accounts[0].reauth, false);
  } finally {
    f.clean();
  }
});

test('an older Vault snapshot cannot start a second refresh after a rotated token was saved', async () => {
  const f = fixture(true),
    releaseRefresh = deferred(),
    releaseSnapshot = deferred();
  try {
    const id = await f.connect(),
      started = deferred(),
      secondSnapshot = deferred();
    const use = f.vault.use.bind(f.vault);
    let snapshots = 0,
      refreshes = 0;
    f.vault.use = async (...args) => {
      const delay = args[1] === 'google-oauth' && ++snapshots === 2;
      if (delay) secondSnapshot.resolve();
      const result = await use(...args);
      if (delay) await releaseSnapshot.promise;
      return result;
    };
    f.respond(async url => {
      if (!url.endsWith('/token')) return json({ documentId: 'demo_doc' });
      refreshes++;
      started.resolve();
      await releaseRefresh.promise;
      return json({ access_token: 'new-access', refresh_token: 'rotated-refresh', token_type: 'Bearer', expires_in: 3600 });
    });
    const a = f.google.execute(id, read, context());
    await started.promise;
    const b = f.google.execute(id, read, context());
    await secondSnapshot.promise;
    releaseRefresh.resolve();
    await a;
    releaseSnapshot.resolve();
    await b;
    assert.equal(refreshes, 1);
  } finally {
    releaseRefresh.resolve();
    releaseSnapshot.resolve();
    f.clean();
  }
});

test('pausing an account aborts shared refresh and cannot save a late token or call a service', async () => {
  const f = fixture(true);
  const release = deferred();
  try {
    const id = await f.connect(),
      started = deferred();
    let refreshSignal: AbortSignal | undefined,
      services = 0;
    f.respond(async (url, init) => {
      if (!url.endsWith('/token')) {
        services++;
        return json({ documentId: 'demo_doc' });
      }
      refreshSignal = init.signal!;
      started.resolve();
      await release.promise;
      return json({ access_token: 'late-access', token_type: 'Bearer', expires_in: 3600 });
    });
    const pending = f.google.execute(id, read, context());
    const rejected = assert.rejects(pending, /CANCELLED|GOOGLE_ACCOUNT_CHANGED/);
    await started.promise;
    f.google.pause(id, true);
    assert.equal(refreshSignal!.aborted, true);
    release.resolve();
    await rejected;
    assert.equal(services, 0);
    const a = f.store.get<any>('google-account', id)!;
    await f.vault.use(a.credentialId, 'google-oauth', `${a.clientId}:${a.subject}`, async raw => {
      assert.equal(JSON.parse(raw).access, 'synthetic-access');
    });
  } finally {
    release.resolve();
    f.clean();
  }
});

const initialScript = {
  scriptId: 'demo_script',
  files: [
    { name: 'appsscript', type: 'JSON', source: '{}' },
    { name: 'Code', type: 'SERVER_JS', source: 'function main() {}' },
    { name: 'Other', type: 'SERVER_JS', source: 'function other() {}' },
  ],
};
const edit = (name: string, hash = googleScriptContentHash(initialScript), scriptId = 'demo_script'): GoogleRequest => ({
  operation: 'appscript.projects.updateContent',
  params: { scriptId },
  body: { files: [{ name, type: 'SERVER_JS', source: `function ${name}() { return 1; }` }], expectedContentHash: hash },
});

test('same-project Script writes serialize the preflight and reject a stale second edit without losing data', async () => {
  const f = fixture(),
    release = deferred();
  try {
    const id = await f.connect(),
      started = deferred();
    let current = structuredClone(initialScript),
      reads = 0,
      writes = 0;
    f.respond(async (_url, init) => {
      if (init.method !== 'PUT') {
        reads++;
        return json(structuredClone(current));
      }
      if (++writes === 1) {
        started.resolve();
        await release.promise;
      }
      current = { ...current, ...JSON.parse(String(init.body)) };
      return json(current);
    });
    const a = f.google.execute(id, edit('Code'), context());
    await started.promise;
    const b = f.google.execute(id, edit('Other'), context());
    const stale = assert.rejects(b, /^Error: GOOGLE_SOURCE_CHANGED$/);
    await nextTurn();
    assert.equal(reads, 1, 'the queued writer must not read a snapshot before owning the project');
    release.resolve();
    await a;
    await stale;
    assert.equal(writes, 1);
    assert.match(current.files.find(file => file.name === 'Code')!.source, /return 1/);
    assert.equal((await f.google.execute(id, edit('Other', googleScriptContentHash(current)), context())).status, 'completed');
    assert.equal(current.files.filter(file => file.source.includes('return 1')).length, 2);
  } finally {
    release.resolve();
    f.clean();
  }
});

test('a cancelled Script queue entry cannot let later writes bypass the active project owner', async () => {
  const f = fixture(),
    release = deferred();
  try {
    const id = await f.connect(),
      started = deferred();
    let current = structuredClone(initialScript),
      reads = 0,
      writes = 0;
    f.respond(async (_url, init) => {
      if (init.method !== 'PUT') {
        reads++;
        return json(structuredClone(current));
      }
      writes++;
      started.resolve();
      await release.promise;
      current = { ...current, ...JSON.parse(String(init.body)) };
      return json(current);
    });
    const a = f.google.execute(id, edit('Code'), context());
    await started.promise;
    const controller = new AbortController();
    const b = f.google.execute(id, edit('Other'), { ...context(), signal: controller.signal });
    const cancelled = assert.rejects(b, /^Error: CANCELLED$/);
    await nextTurn();
    controller.abort();
    await cancelled;
    const c = f.google.execute(id, edit('Other'), context());
    const stale = assert.rejects(c, /^Error: GOOGLE_SOURCE_CHANGED$/);
    await nextTurn();
    assert.equal(reads, 1);
    release.resolve();
    await a;
    await stale;
    assert.equal(writes, 1);
    assert.equal((await f.google.execute(id, edit('Other', googleScriptContentHash(current)), context())).status, 'completed');
  } finally {
    release.resolve();
    f.clean();
  }
});

test('Script writes to unrelated projects can still proceed in parallel', async () => {
  const f = fixture(),
    release = deferred();
  try {
    const id = await f.connect(),
      started = deferred(),
      second = deferred();
    f.respond(async (url, init) => {
      if (init.method !== 'PUT') return json(initialScript);
      if (url.includes('/first/')) {
        started.resolve();
        await release.promise;
      } else second.resolve();
      return json({ scriptId: url.includes('/first/') ? 'first' : 'second', ...JSON.parse(String(init.body)) });
    });
    const a = f.google.execute(id, edit('Code', undefined, 'first'), context());
    await started.promise;
    const b = f.google.execute(id, edit('Other', undefined, 'second'), context());
    await second.promise;
    assert.equal((await b).status, 'completed');
    release.resolve();
    assert.equal((await a).status, 'completed');
  } finally {
    release.resolve();
    f.clean();
  }
});

test('queued Script writes stop when their predecessor has an unknown remote outcome', async () => {
  const f = fixture(),
    release = deferred();
  try {
    const id = await f.connect(),
      started = deferred();
    let reads = 0,
      writes = 0;
    f.respond(async (_url, init) => {
      if (init.method !== 'PUT') {
        reads++;
        return json(initialScript);
      }
      writes++;
      started.resolve();
      await release.promise;
      throw new Error('synthetic response lost after dispatch');
    });
    const a = f.google.execute(id, edit('Code'), context());
    const unknownA = assert.rejects(a, /^Error: GOOGLE_OUTCOME_UNKNOWN$/);
    await started.promise;
    const b = f.google.execute(id, edit('Other'), context());
    const unknownB = assert.rejects(b, /^Error: GOOGLE_OUTCOME_UNKNOWN$/);
    await nextTurn();
    release.resolve();
    await Promise.all([unknownA, unknownB]);
    assert.equal(reads, 1);
    assert.equal(writes, 1, 'a queued edit must not run against a possibly in-flight predecessor');
    f.respond(async (_url, init) => json(init.method === 'PUT' ? { ...initialScript, ...JSON.parse(String(init.body)) } : initialScript));
    assert.equal(
      (await f.google.execute(id, edit('Other'), context())).status,
      'completed',
      'a later explicitly reviewed call can proceed',
    );
  } finally {
    release.resolve();
    f.clean();
  }
});

test('Script queue ownership rechecks the caller context before reading or writing', async () => {
  const f = fixture(),
    release = deferred();
  try {
    const id = await f.connect(),
      started = deferred();
    let allowed = true,
      reads = 0,
      writes = 0;
    f.respond(async (_url, init) => {
      if (init.method !== 'PUT') {
        reads++;
        return json(initialScript);
      }
      writes++;
      started.resolve();
      await release.promise;
      return json({ ...initialScript, ...JSON.parse(String(init.body)) });
    });
    const a = f.google.execute(id, edit('Code'), context());
    await started.promise;
    const b = f.google.execute(id, edit('Other'), {
      ...context(),
      check: async () => {
        if (!allowed) throw new Error('POLICY_CHANGED');
      },
    });
    const changed = assert.rejects(b, /^Error: POLICY_CHANGED$/);
    await nextTurn();
    allowed = false;
    release.resolve();
    await a;
    await changed;
    assert.equal(reads, 1);
    assert.equal(writes, 1);
  } finally {
    release.resolve();
    f.clean();
  }
});

test('account discovery has repeatable, distinct masked labels even when email prefixes collide', async () => {
  const f = fixture();
  try {
    await f.connect();
    f.identity('fixture-two');
    await f.connect();
    const catalog = f.google.catalog('session');
    assert.equal(new Set(catalog.map(a => a.label)).size, 2);
    assert.deepEqual(
      catalog.map(a => a.label),
      f.google.catalog('session').map(a => a.label),
    );
    for (const a of catalog) assert.match(a.label, /sa••••@example.test/);
    assert.equal(new Set(catalog.map(a => f.google.resolve(a.handle, 'session'))).size, 2);
    assert.doesNotMatch(JSON.stringify(catalog), /fixture-one|fixture-two|synthetic-access|synthetic-refresh/);
  } finally {
    f.clean();
  }
});

test('Gmail plain text honors per-part MIME charsets including legacy Thai mail', () => {
  for (const [charset, bytes, expected] of [
    ['utf-8', Buffer.from('ข้อความไทย'), 'ข้อความไทย'],
    ['windows-874', Buffer.from([0xca, 0xc7, 0xd1, 0xca, 0xb4, 0xd5]), 'สวัสดี'],
    ['tis-620', Buffer.from([0xca, 0xc7, 0xd1, 0xca, 0xb4, 0xd5]), 'สวัสดี'],
    ['iso-8859-1', Buffer.from([0x63, 0x61, 0x66, 0xe9]), 'café'],
  ] as const) {
    const result = googleMailContent({
      id: 'message',
      payload: {
        mimeType: 'text/plain',
        headers: [{ name: 'content-type', value: `text/plain; charset="${charset}"` }],
        body: { data: bytes.toString('base64url') },
      },
    });
    assert.equal(result.text, expected, charset);
    assert.equal(result.contentUnavailable, undefined);
  }
});

test('unreadable Gmail text is marked incomplete instead of replacing or dropping bytes silently', () => {
  for (const [charset, data] of [
    ['utf-8', '_w'],
    ['unknown-charset', 'aGk'],
    ['utf-8', '%%%'],
    ['utf-8', 'A'],
  ] as const) {
    const result = googleMailContent({
      payload: { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: `text/plain; charset=${charset}` }], body: { data } },
    });
    assert.equal(result.text, '');
    assert.ok(result.contentUnavailable);
  }
  const mixed = googleMailContent({
    payload: {
      parts: [
        { mimeType: 'text/plain', body: { data: Buffer.from('readable').toString('base64url') } },
        { mimeType: 'text/plain', body: { data: '_w' } },
      ],
    },
  });
  assert.equal(mixed.text, 'readable');
  assert.ok(mixed.contentUnavailable, 'a readable sibling does not make the failed part complete');
});

test('Drive search includes shared drives, supports a specific drive and preserves incomplete-search metadata', async () => {
  const defaults = new URL(googleInvocation({ operation: 'drive.list' }).url);
  assert.equal(defaults.searchParams.get('supportsAllDrives'), 'true');
  assert.equal(defaults.searchParams.get('includeItemsFromAllDrives'), 'true');
  assert.equal(defaults.searchParams.get('corpora'), 'allDrives');
  assert.match(defaults.searchParams.get('fields')!, /incompleteSearch/);
  const scoped = new URL(googleInvocation({ operation: 'drive.list', params: { driveId: 'shared_drive', pageToken: 'next' } }).url);
  assert.equal(scoped.searchParams.get('driveId'), 'shared_drive');
  assert.equal(scoped.searchParams.get('corpora'), 'drive');
  assert.equal(scoped.searchParams.get('pageToken'), 'next');
  const personal = new URL(googleInvocation({ operation: 'drive.list', params: { includeItemsFromAllDrives: false } }).url);
  assert.equal(personal.searchParams.get('corpora'), 'user');
  assert.equal(personal.searchParams.get('includeItemsFromAllDrives'), 'false');
  for (const params of [
    { driveId: 'bad/drive' },
    { includeItemsFromAllDrives: 'true' },
    { driveId: 'shared', includeItemsFromAllDrives: false },
  ])
    assert.throws(() => googleInvocation({ operation: 'drive.list', params }), /INVALID_GOOGLE_INPUT/);
  const f = fixture();
  try {
    const id = await f.connect();
    f.respond(async () => json({ files: [{ id: 'shared_file' }], incompleteSearch: true, nextPageToken: 'more' }));
    const result = await f.google.execute(id, { operation: 'drive.list' }, context());
    assert.equal(result.data.incompleteSearch, true);
    assert.equal(result.data.nextPageToken, 'more');
  } finally {
    f.clean();
  }
});
