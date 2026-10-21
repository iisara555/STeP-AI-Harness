// Offline audit evidence for main 127218295efbeb8b4b4d9a85b471033011574bbb.
// Run: node --import ./desktop/node_modules/tsx/dist/loader.mjs scripts/audit-google-workspace.mts
// Uses synthetic accounts and an injected transport; never contacts Google.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../desktop/electron/store';
import { Vault } from '../desktop/electron/vault';
import { GoogleWorkspace } from '../desktop/electron/google-workspace';
import { googleInvocation } from '../desktop/electron/google-operations';
import { googleScriptContentHash } from '../desktop/electron/google-validation';
import { googleMailContent } from '../desktop/electron/google-mail';
import { DEFAULT_GOOGLE_SERVICES } from '../desktop/src/google-services';
import { GoogleWorkspaceConnector } from '../src/modules/connectors/google-workspace.js';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const context = () => ({
  signal: new AbortController().signal,
  check: async () => {},
  approve: async () => true,
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
const script = {
  scriptId: 'demo_script',
  files: [
    { name: 'appsscript', type: 'JSON', source: '{}' },
    { name: 'Code', type: 'SERVER_JS', source: 'function main() {}' },
    { name: 'Other', type: 'SERVER_JS', source: 'function other() {}' },
  ],
};
function fixture(expired = false) {
  const dir = mkdtempSync(join(tmpdir(), 'step-workspace-audit-'));
  const store = new Store(join(dir, 'store.sqlite'));
  const vault = new Vault(join(dir, 'vault.sqlite'), {
    wrap: s => Buffer.from(s),
    unwrap: b => b.toString(),
  });
  const config = {
    clientId: 'audit.apps.googleusercontent.com',
    domains: ['example.test'],
    services: [...DEFAULT_GOOGLE_SERVICES],
  };
  let subject = 'audit-one';
  let handler: (url: string, init: RequestInit) => Promise<Response> = async () => json({ documentId: 'demo_doc' });
  const google = new GoogleWorkspace(
    store,
    vault,
    () => config,
    async () => {},
    async (url, init = {}) => handler(String(url), init),
    async (_config, scopes) => ({
      who: {
        sub: subject,
        email: subject + '@example.test',
        hd: 'example.test',
      },
      scopes,
      tokens: {
        access: 'audit-access',
        refresh: 'audit-refresh',
        expires: expired ? 0 : Date.now() + 3600000,
      },
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
      return google.state().accounts.at(-1)!.id;
    },
    clean: () => {
      vault.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
const read = {
  operation: 'docs.get',
  params: { documentId: 'demo_doc' },
} as const;
const evidence: object[] = [];
const deadline = setTimeout(() => {
  throw new Error('AUDIT_DEADLINE_EXCEEDED');
}, 30000);
deadline.unref();

// Exercise Skill examples through the real OAuth/Vault/execute path, with family-shaped synthetic API responses.
{
  const f = fixture();
  try {
    const id = await f.connect();
    const contract = JSON.parse(
      readFileSync(new URL('../skills/common/google-workspace/references/tool-contract.json', import.meta.url), 'utf8'),
    );
    const families: Record<string, number> = {};
    for (const item of contract.operations) {
      const request = structuredClone(item.request);
      const op: string = request.operation;
      if (op === 'appscript.projects.updateContent') request.body.expectedContentHash = googleScriptContentHash(script);
      f.respond(async (url, init) => {
        if (op.startsWith('appscript.') && url.endsWith('/content')) return json(script);
        if (op === 'appscript.run') return json({ done: true, response: { result: 'synthetic' } });
        if (op === 'appscript.versions.create') return json({ scriptId: 'demo_script', versionNumber: 1 });
        if (op.startsWith('appscript.deployments.')) return json({ deploymentId: 'demo_deployment' });
        if (op.startsWith('appscript.')) return json({ scriptId: 'demo_script', processes: [], versions: [] });
        if (op.startsWith('docs.'))
          return json({
            documentId: 'demo_doc',
            revisionId: 'demo_revision',
            body: { content: [] },
          });
        if (op.startsWith('sheets.'))
          return json({
            spreadsheetId: 'demo_sheet',
            values: [['00123']],
            sheets: [],
          });
        if (op.startsWith('slides.'))
          return json({
            presentationId: 'demo_slides',
            revisionId: 'demo_revision',
            slides: [],
          });
        if (op.startsWith('forms.'))
          return json({
            formId: 'demo_form',
            revisionId: 'demo_revision',
            responses: [],
          });
        if (op === 'gmail.attachments.getText')
          return json({
            data: Buffer.from('synthetic text').toString('base64url'),
            size: 14,
          });
        if (op.startsWith('gmail.'))
          return json({
            id: 'demo_message',
            messages: [],
            payload: { mimeType: 'text/plain', body: { data: 'aGk' } },
          });
        if (op.startsWith('chat.'))
          return json({
            name: 'spaces/demo_space/messages/demo_message',
            spaces: [],
            messages: [],
          });
        if (op.startsWith('meet.')) return json({ name: 'spaces/demo_space' });
        if (op === 'drive.getText' || op === 'drive.exportText') return new Response('synthetic text');
        if (init.method === 'DELETE') return new Response(null, { status: 204 });
        return json({ id: 'demo_result', items: [], files: [] });
      });
      const result = await f.google.execute(id, request, context());
      assert.equal(result.status, 'completed', op);
      assert.equal(result.trust, 'untrusted-data', op);
      const family = op.split('.')[0];
      families[family] = (families[family] || 0) + 1;
    }
    evidence.push({
      check: 'native-synthetic-execution',
      operations: contract.operations.length,
      families,
      live: false,
    });
  } finally {
    f.clean();
  }
}

// GWA-01: a temporary refresh failure permanently hides an otherwise valid account.
{
  const f = fixture(true);
  try {
    const id = await f.connect();
    let calls = 0;
    f.respond(async () => {
      calls++;
      throw new Error('synthetic temporary network failure');
    });
    await assert.rejects(f.google.execute(id, read, context()), /^Error: GOOGLE_REQUEST_FAILED$/);
    assert.equal(f.google.state().accounts[0].reauth, true);
    assert.equal(f.google.catalog('audit').length, 0);
    await assert.rejects(f.google.execute(id, read, context()), /^Error: GOOGLE_ACCESS_DENIED$/);
    assert.equal(calls, 1);
    evidence.push({
      finding: 'GWA-01',
      reproduced: true,
      first: 'GOOGLE_REQUEST_FAILED',
      later: 'GOOGLE_ACCESS_DENIED',
      reauth: true,
    });
  } finally {
    f.clean();
  }
}

// GWA-02: cancelling the owner of a shared refresh also cancels a different live caller.
{
  const f = fixture(true);
  try {
    const id = await f.connect();
    const started = deferred();
    const owner = new AbortController();
    const waiter = new AbortController();
    let refreshCalls = 0;
    f.respond(async (url, init) => {
      assert.equal(url, 'https://oauth2.googleapis.com/token');
      refreshCalls++;
      started.resolve();
      return new Promise((_resolve, reject) =>
        init.signal!.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }),
      );
    });
    const a = f.google.execute(id, read, {
      ...context(),
      signal: owner.signal,
    });
    await started.promise;
    const b = f.google.execute(id, read, {
      ...context(),
      signal: waiter.signal,
    });
    await new Promise<void>(done => setImmediate(done));
    const results = Promise.allSettled([a, b]);
    owner.abort();
    const settled = await results;
    assert.equal(refreshCalls, 1);
    assert.equal(waiter.signal.aborted, false);
    assert.deepEqual(
      settled.map(r => (r.status === 'rejected' ? r.reason.message : 'fulfilled')),
      ['CANCELLED', 'CANCELLED'],
    );
    evidence.push({
      finding: 'GWA-02',
      reproduced: true,
      refreshCalls,
      errors: ['CANCELLED', 'CANCELLED'],
      waiterAborted: false,
    });
  } finally {
    f.clean();
  }
}

// GWA-03: fresh account handles expose no human-visible discriminator for multiple accounts.
{
  const f = fixture();
  try {
    await f.connect();
    f.identity('second-user');
    await f.connect();
    assert.equal(f.google.state().accounts.length, 2);
    assert.notEqual(f.google.state().accounts[0].label, f.google.state().accounts[1].label);
    const catalog = f.google.catalog('audit');
    assert.equal(catalog.length, 2);
    assert.deepEqual(catalog.map(({ handle, ...rest }) => rest)[0], catalog.map(({ handle, ...rest }) => rest)[1]);
    evidence.push({
      finding: 'GWA-03',
      reproduced: true,
      catalogLabels: catalog.map(a => a.label),
    });
  } finally {
    f.clean();
  }
}

// GWA-04: the optional gws connector loses the distinction between failed and already-applied writes.
{
  let effects = 0;
  const connector = new GoogleWorkspaceConnector({
    run: async () => {
      effects++;
      throw new Error('response lost after commit');
    },
  });
  const request = {
    operation: 'docs.create',
    body: { title: 'Synthetic audit' },
  };
  await assert.rejects(connector.execute(request, { authorize: async () => true }), /^Error: WORKSPACE_CLI_FAILED$/);
  assert.equal(effects, 1);
  evidence.push({
    finding: 'GWA-04',
    reproduced: true,
    appliedWrites: effects,
    returned: 'WORKSPACE_CLI_FAILED',
  });
}

// GWA-05: both same-project edits pass the content precondition, then overwrite one another.
{
  const f = fixture();
  try {
    const id = await f.connect();
    let current = structuredClone(script);
    const bothReads = deferred();
    let reads = 0;
    f.respond(async (_url, init) => {
      if (init.method !== 'PUT') {
        const snapshot = structuredClone(current);
        if (++reads === 2) bothReads.resolve();
        await bothReads.promise;
        return json(snapshot);
      }
      current = { ...current, ...JSON.parse(String(init.body)) };
      return json(current);
    });
    const edit = (name: string, source: string) => ({
      operation: 'appscript.projects.updateContent' as const,
      params: { scriptId: script.scriptId },
      body: {
        files: [{ name, type: 'SERVER_JS', source }],
        expectedContentHash: googleScriptContentHash(script),
      },
    });
    const results = await Promise.all([
      f.google.execute(id, edit('Code', 'function main() { return 1; }'), context()),
      f.google.execute(id, edit('Other', 'function other() { return 2; }'), context()),
    ]);
    assert.deepEqual(
      results.map(r => r.status),
      ['completed', 'completed'],
    );
    const preserved = current.files.filter(file => file.source.includes('return')).length;
    assert.equal(preserved, 1);
    evidence.push({
      finding: 'GWA-05',
      reproduced: true,
      successfulEdits: 2,
      preservedEdits: preserved,
      alreadyDocumented: true,
    });
  } finally {
    f.clean();
  }
}

// GWA-06: Drive search cannot request shared-drive items, unlike gogcli's default search.
{
  const call = googleInvocation({ operation: 'drive.list' });
  const url = new URL(call.url);
  assert.equal(url.searchParams.has('supportsAllDrives'), false);
  assert.equal(url.searchParams.has('includeItemsFromAllDrives'), false);
  assert.throws(
    () =>
      googleInvocation({
        operation: 'drive.list',
        params: { includeItemsFromAllDrives: true },
      }),
    /INVALID_GOOGLE_INPUT/,
  );
  evidence.push({
    finding: 'GWA-06',
    contractConfirmed: true,
    live: false,
    missing: ['supportsAllDrives', 'includeItemsFromAllDrives'],
  });
}

// GWA-07: Gmail plain-text decoding ignores a valid non-UTF-8 MIME charset.
{
  const bytes = Buffer.from([0xca, 0xc7, 0xd1, 0xca, 0xb4, 0xd5]);
  assert.equal(new TextDecoder('windows-874').decode(bytes), 'สวัสดี');
  const result = googleMailContent({
    id: 'synthetic_thai_message',
    payload: {
      mimeType: 'text/plain',
      headers: [{ name: 'Content-Type', value: 'text/plain; charset=windows-874' }],
      body: { data: bytes.toString('base64url') },
    },
  });
  assert.notEqual(result.text, 'สวัสดี');
  assert.ok(result.text.includes('\uFFFD'));
  assert.equal(result.contentUnavailable, undefined);
  evidence.push({
    finding: 'GWA-07',
    reproduced: true,
    charset: 'windows-874',
    expected: 'สวัสดี',
    actual: result.text,
    contentUnavailable: false,
  });
}

// Tasks 'pending work' requests include completed, unhidden tasks by API default.
{
  const call = googleInvocation({
    operation: 'tasks.list',
    params: { tasklistId: 'demo_list' },
  });
  assert.equal(new URL(call.url).searchParams.has('showCompleted'), false);
  assert.throws(
    () =>
      googleInvocation({
        operation: 'tasks.list',
        params: { tasklistId: 'demo_list', showCompleted: false },
      }),
    /INVALID_GOOGLE_INPUT/,
  );
  evidence.push({
    limitation: 'GWA-L01',
    confirmed: true,
    operation: 'tasks.list',
    showCompleted: 'API default true; filter completed locally',
  });
}

console.log(
  JSON.stringify(
    {
      baseline: '127218295efbeb8b4b4d9a85b471033011574bbb',
      live: false,
      evidence,
    },
    null,
    2,
  ),
);
clearTimeout(deadline);
