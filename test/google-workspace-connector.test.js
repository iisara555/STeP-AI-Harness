import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleWorkspaceConnector } from '../src/modules/connectors/google-workspace.js';

test('Google reads invoke a bounded CLI without shell/auth side effects and return untrusted source metadata', async () => {
  const calls = [];
  const connector = new GoogleWorkspaceConnector({ run: async (args, options) => {
    calls.push({ args, options }); return JSON.stringify({ documentId: 'synthetic-id', body: { content: [] } });
  } });
  const result = await connector.execute({ operation: 'docs.get', params: { documentId: 'synthetic-id' } });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(0, 3), ['docs', 'documents', 'get']);
  assert.equal(calls[0].options.timeout, 20000);
  assert.equal(result.provenance, 'EXTRACTED_UNVERIFIED');
  assert.equal(result.trust, 'untrusted-data');
});

test('writes require explicit host authorization tied to the exact request and never retry', async () => {
  let calls = 0;
  const c = new GoogleWorkspaceConnector({ run: async () => { calls++; throw new Error('upstream error'); } });
  const request = { operation: 'sheets.create', body: { properties: { title: 'แผนสังเคราะห์' } } };
  await assert.rejects(c.execute(request), /WORKSPACE_WRITE_AUTHORIZATION_REQUIRED/);
  assert.equal(calls, 0);
  await assert.rejects(c.execute(request, { authorize: async action => {
    assert.equal(action.operation, 'sheets.create'); assert.ok(action.digest); return true;
  } }), /WORKSPACE_OUTCOME_UNKNOWN/);
  assert.equal(calls, 1);
});

test('deny arbitrary services, transfer methods, auth commands and private output diagnostics', async () => {
  const c = new GoogleWorkspaceConnector({ run: async () => { throw new Error('refresh_token=private-value'); } });
  for (const operation of ['gmail.send', 'drive.delete', 'auth.login', 'docs.batchUpdate', 'constructor', 'toString'])
    await assert.rejects(c.execute({ operation }), /WORKSPACE_OPERATION_UNSUPPORTED/);
  await assert.rejects(c.execute({ operation: 'docs.get', params: { documentId: 'x' } }), /^Error: WORKSPACE_CLI_FAILED$/);
  await assert.rejects(c.execute({ operation: 'docs.get', params: { documentId: 'x', arbitrary: true } }), /INVALID_WORKSPACE_INPUT/);
});

test('CLI availability/auth/malformed output are explicit failures, and dry run never contacts Google', async () => {
  let calls = 0;
  const c = new GoogleWorkspaceConnector({ run: async () => { calls++; return 'invalid-json'; } });
  const request = { operation: 'drive.list', params: { pageSize: 10 } };
  assert.equal((await c.execute(request, { dryRun: true })).status, 'dry-run');
  assert.equal(calls, 0);
  await assert.rejects(c.execute(request), /WORKSPACE_RESPONSE_INVALID/);
  const missing = new GoogleWorkspaceConnector({ run: async () => { const e = new Error(); e.code = 'ENOENT'; throw e; } });
  await assert.rejects(missing.execute(request), /WORKSPACE_CLI_UNAVAILABLE/);
});

test('content writes use literal sheet values and revision-bound text append, with exact host approval', async () => {
  const calls = [];
  const c = new GoogleWorkspaceConnector({ run: async args => { calls.push(args); return JSON.stringify({ spreadsheetId: 'synthetic-sheet', documentId: 'synthetic-doc' }); } });
  await c.execute({ operation: 'sheets.values.update', params: { spreadsheetId: 'synthetic-sheet', range: 'แผนงาน!A2:B2' }, body: { values: [['00123', 100]] } }, { authorize: async () => true });
  assert.equal(JSON.parse(calls[0][calls[0].indexOf('--params') + 1]).valueInputOption, 'RAW');
  assert.deepEqual(JSON.parse(calls[0][calls[0].indexOf('--json') + 1]).values, [['00123', 100]]);
  const doc = { operation: 'docs.appendText', params: { documentId: 'synthetic-doc' }, body: { text: 'ร่างจากต้นทาง', requiredRevisionId: 'revision-1' } };
  await c.execute(doc, { authorize: async () => true });
  const body = JSON.parse(calls[1][calls[1].indexOf('--json') + 1]);
  assert.equal(body.writeControl.requiredRevisionId, 'revision-1');
  assert.equal(body.requests[0].insertText.text, 'ร่างจากต้นทาง');
  await assert.rejects(c.execute({ ...doc, body: { text: 'missing revision' } }, { authorize: async () => true }), /INVALID_WORKSPACE_INPUT/);
  await assert.rejects(c.execute({ operation: 'sheets.values.update', params: { spreadsheetId: 'synthetic-sheet', range: 'A2:A2' }, body: { values: [[1, 2]] } }, { authorize: async () => true }), /INVALID_WORKSPACE_INPUT/);
});

test('caller mutation during host approval cannot change the invocation', async () => {
  let sent;
  const c = new GoogleWorkspaceConnector({ run: async args => { sent = JSON.parse(args[args.indexOf('--json') + 1]); return JSON.stringify({ documentId: 'new-doc' }); } });
  const req = { operation: 'docs.create', body: { title: 'reviewed title' } };
  const result = await c.execute(req, { authorize: async action => {
    req.body.title = 'changed';
    action.request.operation = 'sheets.create';
    action.request.body.title = 'also changed';
    return true;
  } });
  assert.equal(sent.title, 'reviewed title');
  assert.equal(result.operation, 'docs.create');
});

test('started writes report unknown outcome on process failure, cancellation and invalid acknowledgements', async () => {
  const request = { operation: 'docs.create', body: { title: 'Synthetic title' } };
  for (const failure of ['process', 'abort', 'cancel-after-response', 'json', 'missing-reference', 'oversized']) {
    const controller = new AbortController();
    let effects = 0;
    const c = new GoogleWorkspaceConnector({ run: async () => {
      effects++;
      if (failure === 'process') throw new Error('synthetic-private-upstream-detail');
      if (failure === 'abort') { controller.abort(); const e = new Error(); e.name = 'AbortError'; throw e; }
      if (failure === 'cancel-after-response') { controller.abort(); return '{"documentId":"created"}'; }
      if (failure === 'missing-reference') return '{}';
      if (failure === 'oversized') return 'x'.repeat(1000001);
      return 'invalid-json';
    } });
    await assert.rejects(c.execute(request, { authorize: async () => true, signal: controller.signal }), e => {
      assert.equal(e.message, 'WORKSPACE_OUTCOME_UNKNOWN', failure);
      assert.equal(e.operation, 'docs.create');
      assert.match(e.requestDigest, /^[a-f0-9]{64}$/);
      assert.deepEqual(e.target, {});
      assert.doesNotMatch(JSON.stringify(e), /synthetic-private-upstream-detail|Synthetic title/);
      return true;
    });
    assert.equal(effects, 1, 'no write is retried');
  }
});

test('pre-execution failures are definite and cancellation still stops reads', async () => {
  const request = { operation: 'docs.create', body: { title: 'Synthetic title' } };
  let calls = 0;
  const c = new GoogleWorkspaceConnector({ run: async () => { calls++; return '{"documentId":"created"}'; } });
  const controller = new AbortController();
  await assert.rejects(c.execute(request, { signal: controller.signal, authorize: async () => { controller.abort(); return true; } }), /^Error: CANCELLED$/);
  assert.equal(calls, 0);
  const missing = new GoogleWorkspaceConnector({ run: async () => { const e = new Error(); e.code = 'ENOENT'; throw e; } });
  await assert.rejects(missing.execute(request, { authorize: async () => true }), /^Error: WORKSPACE_CLI_UNAVAILABLE$/);
  const readController = new AbortController();
  const reader = new GoogleWorkspaceConnector({ run: async () => { readController.abort(); return '{}'; } });
  await assert.rejects(reader.execute({ operation: 'drive.list' }, { signal: readController.signal }), /^Error: CANCELLED$/);
});

test('gws Drive search uses shared-drive flags and checked drive-specific or personal search', async () => {
  const calls = [];
  const c = new GoogleWorkspaceConnector({ run: async args => {
    calls.push(JSON.parse(args[args.indexOf('--params') + 1]));
    return '{"files":[],"incompleteSearch":true}';
  } });
  assert.equal((await c.execute({ operation: 'drive.list' })).data.incompleteSearch, true);
  assert.equal(calls[0].supportsAllDrives, true);
  assert.equal(calls[0].includeItemsFromAllDrives, true);
  assert.equal(calls[0].corpora, 'allDrives');
  assert.match(calls[0].fields, /incompleteSearch/);
  await c.execute({ operation: 'drive.list', params: { driveId: 'shared_drive' } });
  assert.equal(calls[1].corpora, 'drive');
  assert.equal(calls[1].driveId, 'shared_drive');
  await c.execute({ operation: 'drive.list', params: { includeItemsFromAllDrives: false } });
  assert.equal(calls[2].corpora, 'user');
  for (const params of [{ driveId: 'bad/drive' }, { includeItemsFromAllDrives: 'true' }, { driveId: 'shared_drive', includeItemsFromAllDrives: false }])
    await assert.rejects(c.execute({ operation: 'drive.list', params }), /INVALID_WORKSPACE_INPUT/);
});
