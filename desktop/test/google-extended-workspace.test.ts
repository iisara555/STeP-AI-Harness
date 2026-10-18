import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { GoogleWorkspace, type googleAuthorize } from '../electron/google-workspace';
import { GOOGLE_OPERATIONS, googleInvocation, googleOperationCatalog, type GoogleRequest } from '../electron/google-operations';
import { googleMailMessage } from '../electron/google-mail';
import { googleScriptContentHash } from '../electron/google-validation';
import { DEFAULT_GOOGLE_SERVICES, googleScopes, type GoogleService } from '../src/google-services';

const contract = JSON.parse(
  readFileSync(new URL('../../skills/common/google-workspace/references/tool-contract.json', import.meta.url), 'utf8'),
);
const official = JSON.parse(readFileSync(new URL('./fixtures/google-api-methods.json', import.meta.url), 'utf8'));
const example = (name: string): GoogleRequest =>
  structuredClone(contract.operations.find((e: any) => e.request.operation === name).request);
const json = (value: any) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const context = { signal: new AbortController().signal, check: async () => {}, approve: async () => true };
function fixture(services: GoogleService[] = [...DEFAULT_GOOGLE_SERVICES]) {
  const dir = mkdtempSync(join(tmpdir(), 'step-google-expanded-'));
  const store = new Store(join(dir, 'workspace.sqlite'));
  const vault = new Vault(join(dir, 'vault.sqlite'), { wrap: s => Buffer.from(s), unwrap: b => b.toString() });
  let handle: (url: string, init: RequestInit) => Promise<Response> = async () => json({ id: 'demo_result' });
  let subject = '12345';
  let granted: string[] | undefined;
  const calls: { url: string; init: RequestInit }[] = [];
  const config = { clientId: 'synthetic-client.apps.googleusercontent.com', domains: ['example.test'], services };
  const authorize: typeof googleAuthorize = async (_config, scopes) => ({
    who: { sub: subject, email: 'fixture@example.test', hd: 'example.test' },
    scopes: granted || scopes,
    tokens: { access: 'synthetic-access', refresh: 'synthetic-refresh', expires: Date.now() + 3600000 },
  });
  const google = new GoogleWorkspace(
    store,
    vault,
    () => config,
    async () => {},
    async (url, init = {}) => {
      calls.push({ url: String(url), init });
      assert.equal(init.redirect, 'error');
      return handle(String(url), init);
    },
    authorize,
  );
  return {
    google,
    store,
    calls,
    config,
    respond: (fn: typeof handle) => {
      handle = fn;
    },
    identity: (id: string) => {
      subject = id;
    },
    scopes: (scopes: string[]) => {
      granted = scopes;
    },
    clean: () => {
      vault.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('all native operations use the official Google API endpoint, verb and accepted OAuth scopes', () => {
  assert.deepEqual(Object.keys(official.operations).sort(), [...GOOGLE_OPERATIONS].sort());
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const operation of GOOGLE_OPERATIONS) {
    const call = googleInvocation(example(operation)),
      api = official.operations[operation];
    assert.equal(call.method, api.method, operation);
    const pattern = api.endpoint
      .split(/(\{[^}]+\})/)
      .map((part: string) => (part.startsWith('{') ? (part.startsWith('{+') ? '.+' : '[^/]+') : escape(part)))
      .join('');
    const url = new URL(call.url);
    assert.match(url.origin + url.pathname, new RegExp('^' + pattern + '$'), operation);
    for (const scope of call.scopes) assert.ok(api.scopes.includes(scope), operation + ': ' + scope);
    assert.equal(call.write, api.method !== 'GET', operation);
  }
  for (const family of ['docs', 'sheets', 'slides', 'forms']) {
    const entry = googleOperationCatalog.find(e => e.operation === family + '.batchUpdate')!;
    const note = entry.body.find((s: string) => s.startsWith('requests'))!;
    const allowed = /allowed: ([^)]+)/.exec(note)![1].split(', ');
    for (const request of allowed) assert.ok(official.requestTypes[family].includes(request), family + ': ' + request);
  }
});

test('batch writes refuse unknown request types, missing revisions, mismatched rectangles and excessive data', () => {
  for (const operation of ['docs.batchUpdate', 'slides.batchUpdate', 'forms.batchUpdate']) {
    const request = example(operation);
    delete request.body!.requiredRevisionId;
    assert.throws(() => googleInvocation(request), /INVALID_GOOGLE_INPUT/);
    const unknown = example(operation);
    unknown.body!.requests = [{ unsupportedAction: {} }];
    assert.throws(() => googleInvocation(unknown), /INVALID_GOOGLE_INPUT/);
  }
  const batch = example('sheets.values.batchUpdate');
  batch.body!.data[0].range = 'A:A';
  assert.throws(() => googleInvocation(batch), /INVALID_GOOGLE_INPUT/);
  batch.body!.data = [{ range: 'A1:B2', values: [['wrong size']] }];
  assert.throws(() => googleInvocation(batch), /INVALID_GOOGLE_INPUT/);
  batch.body!.data = [1, 2].map(() => ({ range: 'A1:E100', values: Array.from({ length: 100 }, () => Array(5).fill('x')) }));
  assert.throws(() => googleInvocation(batch), /INVALID_GOOGLE_INPUT/);
  const data = example('docs.batchUpdate');
  data.body!.requests = Array.from({ length: 51 }, () => ({ insertText: { text: 'x' } }));
  assert.throws(() => googleInvocation(data), /INVALID_GOOGLE_INPUT/);
  data.body!.requests = [{ insertText: { text: 'x'.repeat(50001) } }];
  assert.throws(() => googleInvocation(data), /INVALID_GOOGLE_INPUT/);
  for (const operation of ['drive.get', 'forms.get', 'appscript.projects.get']) {
    const bad = example(operation);
    const key = Object.keys(bad.params!)[0];
    bad.params![key] = '../other?token=private';
    assert.throws(() => googleInvocation(bad), /INVALID_GOOGLE_INPUT/);
  }
});

test('Sheets keeps identifiers RAW and permits formulas only through explicit USER_ENTERED', () => {
  const request = example('sheets.values.batchUpdate');
  assert.equal((googleInvocation(request).body as any).valueInputOption, 'RAW');
  assert.equal((googleInvocation(request).body as any).data[0].values[1][0], '00123');
  request.body!.valueInputOption = 'USER_ENTERED';
  request.body!.data = [{ range: 'A1:A1', values: [['=SUM(B1:B5)']] }];
  assert.equal((googleInvocation(request).body as any).valueInputOption, 'USER_ENTERED');
});

test('service intent prevents draft/modify grants sending mail and legacy document grants managing Drive', async () => {
  const f = fixture();
  try {
    await f.google.connect(['gmail-draft'], context);
    const id = f.google.state().accounts[0].id;
    assert.deepEqual(f.google.state().accounts[0].services, ['gmail-draft']);
    await assert.rejects(f.google.execute(id, example('gmail.send'), context), /GOOGLE_SCOPE_MISSING/);
    assert.equal(f.calls.length, 0);
    // A legacy account without the new intent field also keeps draft-only behavior.
    const account: any = f.store.get('google-account', id);
    delete account.services;
    f.store.put('google-account', id, account);
    await assert.rejects(f.google.execute(id, example('gmail.send'), context), /GOOGLE_SCOPE_MISSING/);
    await f.google.connect(['gmail-manage'], context, id);
    await f.google.execute(id, example('gmail.modify'), context);
    await assert.rejects(f.google.execute(id, example('gmail.send'), context), /GOOGLE_SCOPE_MISSING/);
    await f.google.connect(['gmail-draft', 'gmail-send'], context, id);
    await f.google.execute(id, example('gmail.send'), context);
    assert.equal(f.calls.length, 2);
    await f.google.connect(['documents'], context, id);
    await assert.rejects(f.google.execute(id, example('drive.permissions.create'), context), /GOOGLE_SCOPE_MISSING/);
    await assert.rejects(f.google.execute(id, example('drive.uploadText'), context), /GOOGLE_SCOPE_MISSING/);
    assert.equal(f.calls.length, 2);
  } finally {
    f.clean();
  }
});

test('adding services is bound to the existing Google subject and never upgrades a different account', async () => {
  const f = fixture();
  try {
    await f.google.connect(['documents'], context);
    const before = f.google.state().accounts[0];
    f.identity('56789');
    await assert.rejects(f.google.connect(['forms', 'appscript'], context, before.id), /GOOGLE_ACCOUNT_MISMATCH/);
    assert.deepEqual(f.google.state().accounts[0], before);
    f.identity('12345');
    await f.google.connect(['forms', 'appscript'], context, before.id);
    assert.equal(f.google.state().accounts.length, 1);
    assert.equal(f.google.state().accounts[0].id, before.id);
    assert.deepEqual(f.google.state().accounts[0].services, ['forms', 'appscript']);
  } finally {
    f.clean();
  }
});

test('partial Forms consent permits body operations but does not grant response reads', async () => {
  const f = fixture();
  try {
    f.scopes(googleScopes(['forms']).filter(s => !s.endsWith('/forms.responses.readonly')));
    await f.google.connect(['forms'], context);
    const id = f.google.state().accounts[0].id;
    f.respond(async () => json({ formId: 'demo_form' }));
    await f.google.execute(id, example('forms.create'), context);
    await assert.rejects(f.google.execute(id, example('forms.responses.list'), context), /GOOGLE_SCOPE_MISSING/);
    assert.equal(f.calls.length, 1);
  } finally {
    f.clean();
  }
});

test('UTF-8 Drive transfer is approved immutably, bounded and rejects binary output', async () => {
  const f = fixture();
  try {
    await f.google.connect(['drive'], context);
    const id = f.google.state().accounts[0].id;
    const request = example('drive.uploadText');
    f.respond(async (url, init) => {
      assert.match(url, /uploadType=multipart/);
      assert.match(String(init.body), /00123,100/);
      assert.doesNotMatch(String(init.body), /changed after approval/);
      return json({ id: 'demo_file' });
    });
    await f.google.execute(id, request, {
      ...context,
      approve: async () => {
        request.body!.text = 'changed after approval';
        return true;
      },
    });
    f.respond(async () => new Response('รหัส,ยอด\n00123,100', { headers: { 'content-type': 'text/csv' } }));
    const read = await f.google.execute(id, example('drive.exportText'), context);
    assert.equal(read.data.text, 'รหัส,ยอด\n00123,100');
    f.respond(async () => new Response(Uint8Array.from([255, 0, 254])));
    await assert.rejects(f.google.execute(id, example('drive.getText'), context), /GOOGLE_TEXT_ONLY/);
  } finally {
    f.clean();
  }
});

test('thread/draft and attachment reads decode before privacy review and remove access tokens', async () => {
  const f = fixture();
  try {
    await f.google.connect(['gmail-read', 'gmail-draft'], context);
    const id = f.google.state().accounts[0].id;
    const message = {
      id: 'demo_message',
      threadId: 'demo_thread',
      payload: {
        mimeType: 'text/plain',
        headers: [{ name: 'Message-ID', value: '<demo@example.test>' }],
        body: { data: Buffer.from('ข้อความ synthetic-access').toString('base64url') },
      },
    };
    f.respond(async () => json({ id: 'demo_thread', messages: [message] }));
    const thread = await f.google.execute(id, example('gmail.threads.get'), context);
    assert.equal(thread.data.messages[0].text, 'ข้อความ [credential removed]');
    assert.doesNotMatch(JSON.stringify(thread), /synthetic-access|payload|base64/);
    f.respond(async () => json({ id: 'demo_draft', message }));
    const draft = await f.google.execute(id, example('gmail.drafts.get'), context);
    assert.equal(draft.data.message.headers[0].name, 'Message-ID');
    f.respond(async () => json({ data: Buffer.from('ข้อความแนบ synthetic-access').toString('base64url'), size: 40 }));
    const attachment = await f.google.execute(id, example('gmail.attachments.getText'), context);
    assert.equal(attachment.data.text, 'ข้อความแนบ [credential removed]');
    f.respond(async () => json({ data: Buffer.from([0, 255, 0]).toString('base64url') }));
    await assert.rejects(f.google.execute(id, example('gmail.attachments.getText'), context), /GOOGLE_TEXT_ONLY/);
  } finally {
    f.clean();
  }
});

test('Apps Script edits preserve unmodified files and reject changes since the reviewed content hash', async () => {
  const f = fixture();
  try {
    await f.google.connect(['appscript'], context);
    const id = f.google.state().accounts[0].id;
    const files = [
      { name: 'appsscript', type: 'JSON', source: '{}' },
      { name: 'Code', type: 'SERVER_JS', source: 'function sample() {}' },
      { name: 'Config', type: 'SERVER_JS', source: 'const privateValue = "synthetic-access";' },
    ];
    let current = { scriptId: 'demo_script', files };
    let writes = 0;
    f.respond(async (_url, init) => {
      if (init.method === 'PUT') {
        writes++;
        const sent = JSON.parse(String(init.body));
        assert.equal(sent.files.find((file: any) => file.name === 'Config').source, files[2].source);
        assert.equal(sent.files.find((file: any) => file.name === 'Code').source, 'function sample() { return 2; }');
        return json({ scriptId: 'demo_script' });
      }
      return json(current);
    });
    const result = await f.google.execute(id, example('appscript.projects.getContent'), context);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-access/);
    assert.equal(result.data.contentHash, googleScriptContentHash(current));
    const request: GoogleRequest = {
      operation: 'appscript.projects.updateContent',
      params: { scriptId: 'demo_script' },
      body: {
        files: [{ name: 'Code', type: 'SERVER_JS', source: 'function sample() { return 2; }' }],
        expectedContentHash: result.data.contentHash,
      },
    };
    current = { ...current, files: [...files, { name: 'New', type: 'SERVER_JS', source: 'function later() {}' }] };
    await assert.rejects(f.google.execute(id, request, context), /GOOGLE_SOURCE_CHANGED/);
    assert.equal(writes, 0);
    request.body!.expectedContentHash = googleScriptContentHash(current);
    const changed = await f.google.execute(id, request, context);
    assert.equal(changed.status, 'completed');
    assert.match(changed.resourceUrl!, /script.google.com/);
    assert.equal(writes, 1);
    request.body!.files[0].source = 'const privateValue = "[credential removed]";';
    assert.throws(() => googleInvocation(request), /GOOGLE_REDACTED_SOURCE/);
  } finally {
    f.clean();
  }
});

test('empty acknowledgements confirm only supported updates, and script timeouts are never retried', async () => {
  const f = fixture();
  try {
    await f.google.connect(['drive', 'forms', 'appscript', 'docs'], context);
    const id = f.google.state().accounts[0].id;
    f.respond(async () => new Response(null, { status: 204 }));
    assert.equal((await f.google.execute(id, example('drive.permissions.delete'), context)).status, 'completed');
    assert.equal((await f.google.execute(id, example('forms.setPublishSettings'), context)).status, 'completed');
    await assert.rejects(f.google.execute(id, example('docs.create'), context), /GOOGLE_OUTCOME_UNKNOWN/);
    await assert.rejects(f.google.execute(id, example('appscript.versions.create'), context), /GOOGLE_OUTCOME_UNKNOWN/);
    f.respond(async () => json({ versionNumber: 1 }));
    assert.equal((await f.google.execute(id, example('appscript.versions.create'), context)).data.versionNumber, 1);
    let runs = 0;
    f.respond(async (_url, init) => {
      runs++;
      assert.equal(JSON.parse(String(init.body)).devMode, false);
      throw new Error('private transport diagnostic');
    });
    await assert.rejects(f.google.execute(id, example('appscript.run'), context), /^Error: GOOGLE_OUTCOME_UNKNOWN$/);
    assert.equal(runs, 1);
    f.respond(async () => json({ done: false }));
    await assert.rejects(f.google.execute(id, example('appscript.run'), context), /GOOGLE_OUTCOME_UNKNOWN/);
    f.respond(async () => json({ done: true, response: { result: 'synthetic-access' } }));
    const run = await f.google.execute(id, example('appscript.run'), context);
    assert.equal(run.data.response.result, '[credential removed]');
  } finally {
    f.clean();
  }
});

test('Thai reply mail uses bounded encoded headers, CC/BCC and exact thread linkage without header injection', () => {
  const subject = 'ทดสอบภาษาไทย'.repeat(10);
  const message = googleMailMessage({
    to: ['to@example.test'],
    cc: ['copy@example.test'],
    bcc: ['blind@example.test'],
    subject,
    text: 'เนื้อหา',
    threadId: 'demo_thread',
    inReplyTo: '<message@example.test>',
  });
  const mime = Buffer.from(message.raw, 'base64url').toString('utf8');
  assert.equal(message.threadId, 'demo_thread');
  assert.match(mime, /Cc: copy@example.test\r\nBcc: blind@example.test/);
  const words = [...mime.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
  assert.equal(words.map(word => Buffer.from(word[1], 'base64').toString('utf8')).join(''), subject);
  assert.ok(words.every(word => word[0].length <= 75));
  assert.match(mime, /In-Reply-To: <message@example.test>/);
  assert.throws(
    () =>
      googleMailMessage({
        to: ['a@example.test'],
        subject: 'ok',
        text: 'ok',
        threadId: 'demo',
        inReplyTo: '<a@example.test>\r\nBcc: hidden@example.test',
      }),
    /INVALID_GOOGLE_INPUT/,
  );
});
