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
  } }), /WORKSPACE_CLI_FAILED/);
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
  await c.execute(req, { authorize: async () => { req.body.title = 'changed'; return true; } });
  assert.equal(sent.title, 'reviewed title');
});
