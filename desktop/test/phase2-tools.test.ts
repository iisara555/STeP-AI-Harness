import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph } from 'docx';
import { Store } from '../electron/store';
import { Workbench } from '../electron/workbench';
import { defaultPolicy } from '../electron/policy';
import { Approvals } from '../electron/approvals';
import { Questions } from '../electron/questions';
import { ToolGate } from '../electron/tool-gate';
import { DesktopTools, type ToolScope, documentSections } from '../electron/tools';
import { sheetWorker } from '../electron/sheets';
import type { Harness } from '../electron/service';
const privacy: any = await import('../../src/modules/privacy/index.js');
const documents: any = await import('../../src/modules/privacy/document.js');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'step-phase2-')),
    store = new Store(':memory:'),
    policy = defaultPolicy();
  store.put('settings', 'main', { workspace: root });
  const workbench = new Workbench(store, undefined, () => policy);
  let approve = true;
  let allowRun = false;
  let holdApproval = false,
    lastApproval = '';
  let requests = 0;
  let opened: () => void = () => {};
  const approvalOpened = new Promise<void>(resolve => {
    opened = resolve;
  });
  const events: string[] = [];
  const approvals = new Approvals(store, r => {
    if (r) {
      requests++;
      lastApproval = r.id;
      opened();
      if (holdApproval) return;
      queueMicrotask(() => approvals.respond(r.id, !approve ? 'cancel' : allowRun && r.runScope ? 'run' : 'once'));
    }
  });
  const gate = new ToolGate(
    () => policy,
    () => 'ask',
    () => workbench.root(),
    approvals,
    async p => {
      events.push(p.event);
      return { blocked: false, reason: '', results: [] };
    },
  );
  const harness = {
    root,
    privacy: privacy.evaluatePrivacyGate,
    route: async () => ({ routingContract: { mode: 'SKILL', skill: 'known', authority: { status: 'ALLOW' } } }),
    catalog: async () => [{ name: 'known', path: 'known.md', status: 'routed' }],
    skillMetadata: async () => ({ path: 'known.md', mandatoryReferences: [] }),
    documentMetadata: async (ids: string[]) =>
      ids.map(id => (id === 'registered' ? { id, path: 'known.md', status: 'active' } : { id, status: 'unregistered' })),
    documentPrivacy: documents.evaluateDocumentPrivacy,
  } as unknown as Harness;
  const tools = new DesktopTools(
    workbench,
    harness,
    gate,
    approvals,
    new Questions(() => {}),
    () => policy,
    () => 'ask',
    resolve('electron/sheet-worker.cjs'),
  );
  const scope: ToolScope = {
    cancel: () => {},
    sessionId: 's',
    query: 'read',
    team: 'cc',
    contract: { mode: 'GENERAL', authority: { status: 'ALLOW' } },
    connection: { id: 'test', provider: 'openai', mode: 'api', model: 'test', executable: '', ready: true, note: '' },
    signal: new AbortController().signal,
    search: async () => 'web',
    activity: () => {},
  };
  return {
    root,
    store,
    workbench,
    tools,
    scope,
    policy,
    events,
    deny: () => {
      approve = false;
    },
    requests: () => requests,
    allowRun: () => {
      allowRun = true;
    },
    holdApproval: () => {
      holdApproval = true;
    },
    lastApproval: () => lastApproval,
    approvals,
    approvalOpened,
  };
}
test('scoped file consent batches clean reads but re-prompts masked sources and different folders', async () => {
  const f = await fixture();
  f.allowRun();
  await mkdir(join(f.root, 'other'));
  await writeFile(join(f.root, 'a.txt'), 'Public A');
  await writeFile(join(f.root, 'b.txt'), 'Public B');
  await writeFile(join(f.root, 'private.txt'), 'Contact: sample@example.com');
  await writeFile(join(f.root, 'other/c.txt'), 'Public C');
  const host = await f.tools.host(f.scope);
  const send = async (input: string) => {
    const request = { tool: 'files' as const, input };
    const value = await host.execute(request, f.scope.signal);
    return host.outgoing(JSON.stringify(value), f.scope.signal, request);
  };
  try {
    await Promise.all(['a.txt', 'b.txt'].map(send));
    assert.equal(f.requests(), 1);
    assert.equal(f.tools.transmissionGrants().length, 1);
    assert.ok(!(await send('private.txt')).includes('sample@example.com'));
    assert.equal(f.requests(), 2, 'pre-masking risk cannot disappear into a reusable grant');
    await send('other/c.txt');
    assert.equal(f.requests(), 3);
    f.tools.revokeTransmission(f.tools.transmissionGrants()[0].id);
    await assert.rejects(send('b.txt'), /CANCELLED/);
    assert.deepEqual(f.store.list('approval'), []);
  } finally {
    await host.dispose?.();
    assert.deepEqual(f.tools.transmissionGrants(), []);
    f.store.close();
  }
});
test('disposing a loop cancels its pending transmission dialog without waiting for expiry', async () => {
  const f = await fixture();
  f.holdApproval();
  const host = await f.tools.host(f.scope);
  const pending = assert.rejects(host.outgoing('Public fixture', f.scope.signal), /CANCELLED/);
  await f.approvalOpened;
  assert.equal(f.requests(), 1);
  await host.dispose?.();
  await pending;
  assert.throws(() => f.approvals.respond(f.lastApproval(), 'once'), /APPROVAL_EXPIRED/);
  f.store.close();
});
test('administrator one-time setting disables scopes; web-result scopes do not authorize destinations', async () => {
  const f = await fixture();
  f.allowRun();
  let host = await f.tools.host(f.scope);
  const request = { tool: 'web_fetch' as const, input: 'https://example.org/one' };
  try {
    await host.outgoing('Public result one', f.scope.signal, request);
    await host.outgoing('Public result two', f.scope.signal, { ...request, input: 'https://example.org/two' });
    assert.equal(f.requests(), 1);
    await f.tools.outgoing('https://example.org/three', f.scope, 'web-url');
    assert.equal(f.requests(), 2, 'destination request remains independently confirmed');
    await host.outgoing('New origin result', f.scope.signal, { ...request, input: 'https://example.com/one' });
    assert.equal(f.requests(), 3);
    await host.dispose?.();
    f.policy.transmissionConsent = { allowRunScope: false };
    host = await f.tools.host(f.scope);
    await host.outgoing('Public result one', f.scope.signal, request);
    await host.outgoing('Public result two', f.scope.signal, request);
    assert.equal(f.requests(), 5);
    assert.deepEqual(f.tools.transmissionGrants(), []);
  } finally {
    await host.dispose?.();
    f.store.close();
  }
});
test('consent ends with the loop and never overrides policy or destination changes', async () => {
  const f = await fixture();
  f.allowRun();
  await writeFile(join(f.root, 'a.txt'), 'Public A');
  const request = { tool: 'files' as const, input: 'a.txt' };
  let host = await f.tools.host(f.scope);
  try {
    const value = JSON.stringify(await host.execute(request, f.scope.signal));
    await host.outgoing(value, f.scope.signal, request);
    await host.dispose?.();
    host = await f.tools.host(f.scope);
    await host.outgoing(value, f.scope.signal, request);
    assert.equal(f.requests(), 2);
    f.scope.connection.model = 'different';
    await assert.rejects(host.outgoing(value, f.scope.signal, request), /DESTINATION_CHANGED/);
  } finally {
    await host.dispose?.();
    f.store.close();
  }
});
test('new file data requires separate consent, denied data and credentials never transmit', async () => {
  const f = await fixture();
  try {
    const clean = await f.tools.outgoing('Synthetic public text', f.scope);
    assert.equal(clean, 'Synthetic public text');
    assert.equal(f.requests(), 1);
    const masked = await f.tools.outgoing('Contact: sample@example.com', f.scope);
    assert.ok(!masked.includes('sample@example.com'));
    f.deny();
    await assert.rejects(f.tools.outgoing('New data', f.scope), /TOOL_DATA_DECLINED/);
    const count = f.requests();
    await assert.rejects(f.tools.outgoing('password: synthetic-test-credential', f.scope), /PRIVACY_REVIEW_REQUIRED/);
    assert.equal(f.requests(), count);
  } finally {
    f.store.close();
  }
});
test('generated search needs destination consent and checks state again before network access', async () => {
  const f = await fixture();
  let searches = 0;
  f.scope.search = async () => {
    searches++;
    return 'evidence';
  };
  try {
    f.deny();
    await assert.rejects(f.tools.execute({ tool: 'web_search', input: 'public fixture query' }, f.scope), /TOOL_DATA_DECLINED/);
    assert.equal(searches, 0);
    await assert.rejects(f.tools.execute({ tool: 'web_search', input: 'email: sample@example.com' }, f.scope), /PRIVACY_REVIEW_REQUIRED/);
    assert.equal(searches, 0);
  } finally {
    f.store.close();
  }
  const g = await fixture();
  g.scope.search = async () => {
    searches++;
    return 'evidence';
  };
  try {
    await assert.rejects(
      g.tools.execute({ tool: 'web_search', input: 'public query' }, g.scope, async () => {
        throw new Error('POLICY_CHANGED');
      }),
      /POLICY_CHANGED/,
    );
    assert.equal(searches, 0);
  } finally {
    g.store.close();
  }
});
test('only routed Skills and registered references load; every tool passes hooks', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'known.md'), 'Registered source');
    assert.match(JSON.stringify(await f.tools.execute({ tool: 'skill', input: 'known' }, f.scope)), /Registered source/);
    await assert.rejects(f.tools.execute({ tool: 'skill', input: 'unknown' }, f.scope), /SKILL_NOT_ROUTED/);
    await assert.rejects(f.tools.execute({ tool: 'reference', input: 'unknown' }, f.scope), /REFERENCE_UNAVAILABLE/);
    assert.match(JSON.stringify(await f.tools.execute({ tool: 'reference', input: 'registered' }, f.scope)), /Registered source/);
    const outline: any = await f.tools.execute({ tool: 'doc_outline', input: 'test.docx' }, f.scope).catch(() => null);
    assert.equal(outline, null);
    assert.ok(f.events.includes('pre_tool_use'));
    assert.ok(f.events.includes('post_tool_use'));
    f.scope.contract.authority.status = 'DENY';
    const host = await f.tools.host(f.scope);
    await assert.rejects(host.check(), /AUTHORITY_REVIEW_REQUIRED/);
    await host.dispose?.();
  } finally {
    f.store.close();
  }
});
test('text previews paginate; apply backs up bytes; restoration is staged and protects later edits', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'long.txt'), 'x'.repeat(250_000));
    const chunk = await f.workbench.readChunk('long.txt', 200_000);
    assert.equal(chunk.total, 250_000);
    assert.equal(chunk.nextOffset, 240_000);
    await writeFile(join(f.root, 'a.txt'), 'before');
    const change = await f.workbench.stage('a.txt', 'after');
    const applied = await f.workbench.apply(change.id);
    assert.ok(applied.snapshotId);
    const restored = await f.workbench.restoreSnapshot(applied.snapshotId!);
    assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'after');
    await f.workbench.apply(restored.id);
    assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'before');
    const stale = await f.workbench.restoreSnapshot(applied.snapshotId!);
    await writeFile(join(f.root, 'a.txt'), 'human edit');
    await assert.rejects(f.workbench.apply(stale.id), /FILE_CONFLICT/);
    const other = join(f.root, 'other');
    await mkdir(other);
    f.store.put('settings', 'main', { workspace: other });
    assert.equal((await f.workbench.changes()).length, 0);
    assert.equal((await f.workbench.snapshots()).length, 0);
  } finally {
    f.store.close();
  }
});
test('model file reads scan the complete source before paging across credential boundaries', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'boundary.txt'), 'x'.repeat(39_997) + '\npassword: synthetic-test-credential');
    await assert.rejects(f.tools.execute({ tool: 'files', input: 'boundary.txt' }, f.scope), /PRIVACY_REVIEW_REQUIRED/);
    await writeFile(join(f.root, 'personal.txt'), 'Contact: sample@example.com\n' + 'a'.repeat(50_000));
    const chunk: any = await f.tools.execute({ tool: 'files', input: 'personal.txt' }, f.scope);
    assert.equal(chunk.nextOffset, 40_000);
    assert.ok(!chunk.text.includes('sample@example.com'));
    assert.equal(chunk.redactionApplied, true);
  } finally {
    f.store.close();
  }
});
test('spreadsheet edits preserve scalar types, stage a readable preview and reject changed source bytes', async () => {
  const f = await fixture();
  try {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Data').getCell('A1').value = 'before';
    const path = join(f.root, 'book.xlsx');
    await book.xlsx.writeFile(path);
    const change: any = await f.tools.execute(
      {
        tool: 'sheet_edit',
        input: 'book.xlsx',
        args: {
          sheet: 'Data',
          edits: [
            { cell: 'A1', value: 'after' },
            { cell: 'B1', value: 42 },
            { cell: 'C1', value: true },
          ],
        },
      },
      f.scope,
    );
    const before = new ExcelJS.Workbook();
    await before.xlsx.readFile(path);
    assert.equal(before.getWorksheet('Data')!.getCell('A1').value, 'before');
    assert.match(change.after, /42/);
    await f.workbench.apply(change.id);
    const after = new ExcelJS.Workbook();
    await after.xlsx.readFile(path);
    assert.equal(after.getWorksheet('Data')!.getCell('B1').value, 42);
    assert.equal(after.getWorksheet('Data')!.getCell('C1').value, true);
    const reading: any = await f.tools.execute({ tool: 'sheet_read', input: 'book.xlsx', args: { range: 'A1:C1' } }, f.scope);
    assert.deepEqual(reading.rows, [['after', '42', 'true']]);
    const bytes = await readFile(path);
    await assert.rejects(sheetWorker(bytes, { edits: [{ cell: 'A1', value: { formula: 'external' } }] }, f.scope.signal), /INVALID_INPUT/);
    await assert.rejects(sheetWorker(bytes, { range: 'A1:ZZ999' }, f.scope.signal), /SHEET_RANGE_LIMIT/);
  } finally {
    f.store.close();
  }
});
test('DOCX tools use the actual privacy worker and retain section text', async () => {
  const f = await fixture();
  try {
    const document = new Document({
      sections: [
        {
          children: [
            new Paragraph('# One'),
            new Paragraph('Synthetic document body'),
            new Paragraph('# Two'),
            new Paragraph('Second body'),
          ],
        },
      ],
    });
    await writeFile(join(f.root, 'document.docx'), await Packer.toBuffer(document));
    const outline: any = await f.tools.execute({ tool: 'doc_outline', input: 'document.docx' }, f.scope);
    assert.equal(outline.sections.length, 2);
    const section: any = await f.tools.execute({ tool: 'doc_section', input: 'document.docx', args: { index: 1 } }, f.scope);
    assert.match(section.text, /Second body/);
  } finally {
    f.store.close();
  }
});
test('document outlines split headings and supply exact section text', () => {
  const parts = documentSections('# A\nBody\n# B\nMore');
  assert.equal(parts.length, 2);
  assert.equal(parts[1].text, '# B\nMore');
});
