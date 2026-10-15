import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GOOGLE_OPERATIONS, googleInvocation, googleOperationCatalog, type GoogleRequest } from '../electron/google-operations';
import { googleScopes, type GoogleService } from '../src/google-services';

const contract = JSON.parse(
  await readFile(new URL('../../skills/common/google-workspace/references/tool-contract.json', import.meta.url), 'utf8'),
);

test('every Skill request example validates against native Google operations and its documented service', () => {
  assert.deepEqual(contract.operations.map((item: any) => item.request.operation).sort(), [...GOOGLE_OPERATIONS].sort());
  for (const item of contract.operations) {
    const request = item.request as GoogleRequest;
    const invocation = googleInvocation(request);
    assert.equal(invocation.write, item.effect === 'write', request.operation);
    assert.ok(
      invocation.scopes.some(scope => googleScopes([item.service as GoogleService]).includes(scope)),
      request.operation,
    );
    const entry = googleOperationCatalog.find(entry => entry.operation === request.operation)!;
    assert.ok(Array.isArray(entry.params));
    assert.ok(Array.isArray(entry.body));
    for (const [key, value] of Object.entries(request.params || {})) {
      assert.ok(
        entry.params.some(field => field.replace(/\?.*$/, '').split(' ')[0] === key),
        `${request.operation} params.${key}`,
      );
      assert.notEqual(value, undefined);
    }
    for (const key of Object.keys(request.body || {}))
      assert.ok(
        entry.body.some(field => field.replace(/\?.*$/, '').split(' ')[0] === key),
        `${request.operation} body.${key}`,
      );
  }
});

test('Skill examples preserve RAW identifiers and calendar invitation effects', () => {
  const find = (operation: string) => contract.operations.find((item: any) => item.request.operation === operation).request;
  const sheet = googleInvocation(find('sheets.values.update'));
  assert.equal(new URL(sheet.url).searchParams.get('valueInputOption'), 'RAW');
  assert.deepEqual(sheet.body, {
    values: [
      ['รหัส', 'ยอด'],
      ['00123', 100],
    ],
  });
  const calendar = googleInvocation(find('calendar.createEvent'));
  assert.equal(new URL(calendar.url).searchParams.get('sendUpdates'), 'all');
  assert.equal((calendar.body as any).start.dateTime, '2026-10-14T09:00:00+07:00');
  const docs = googleInvocation(find('docs.appendText'));
  assert.equal((docs.body as any).writeControl.requiredRevisionId, 'demo_revision');
});
