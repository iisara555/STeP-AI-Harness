import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph } from 'docx';
import { ToolLoop } from '../electron/tool-loop';
import { TOOL_REGISTRY } from '../src/tool-registry';
import { LOOP_TOOLS } from '../src/tools';
import { loopRequests } from '../src/tools';
import { Store } from '../electron/store';
import { Workbench } from '../electron/workbench';
import { defaultPolicy } from '../electron/policy';
import { Approvals } from '../electron/approvals';
import { Questions } from '../electron/questions';
import { ToolGate } from '../electron/tool-gate';
import { DesktopTools, type ToolScope, documentSections } from '../electron/tools';
import { sheetWorker } from '../electron/sheets';
import type { Harness } from '../electron/service';
// PowerShell (Windows) needs the call operator to run a quoted executable path.
const node = `${process.platform === 'win32' ? '& ' : ''}"${process.execPath}"`;
const privacy: any = await import('../../src/modules/privacy/index.js');
const documents: any = await import('../../src/modules/privacy/document.js');
async function fixture(mode: 'ask' | 'acceptEdits' | 'plan' | 'auto' = 'ask') {
  const root = await mkdtemp(join(tmpdir(), 'step-phase2-')),
    store = new Store(':memory:'),
    policy = defaultPolicy();
  // These tests cover the transmission consent and privacy masking, which run when the organization turns them on.
  policy.checks = { authority: true, privacy: true };
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
  const events: string[] = [],
    bodies: string[] = [];
  const approvals = new Approvals(store, r => {
    if (r) {
      requests++;
      bodies.push(r.body);
      lastApproval = r.id;
      opened();
      if (holdApproval) return;
      queueMicrotask(() => approvals.respond(r.id, !approve ? 'cancel' : allowRun && r.runScope ? 'run' : 'once'));
    }
  });
  const gate = new ToolGate(
    () => policy,
    () => mode,
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
    () => mode,
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
    bodies,
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
test('registry and dispatcher parity includes loop-owned paging, without phantom tools', async () => {
  const source = await readFile(resolve('electron/tools.ts'), 'utf8');
  const cases = [...source.matchAll(/case '([a-z_]+)':/g)].map(match => match[1]);
  assert.deepEqual([...new Set([...cases, 'read_remaining'])].sort(), [...LOOP_TOOLS].sort());
  assert.deepEqual(Object.keys(TOOL_REGISTRY).sort(), [...LOOP_TOOLS].sort());
});

test('synthetic ToolLoop discovery then underlying file/patch/task calls retain gates', async () => {
  const f = await fixture();
  const host = await f.tools.host(f.scope);
  await writeFile(join(f.root, 'note.txt'), 'synthetic exact text');
  const proposals = [
    { tool: 'tool_search', input: 'workspace' },
    { tool: 'tool_describe', input: 'files' },
    { tool: 'files', input: 'note.txt' },
    { tool: 'tool_describe', input: 'patch' },
    { tool: 'patch', input: 'note.txt', args: { old_string: 'exact', new_string: 'replacement' } },
    { tool: 'tool_describe', input: 'tasks' },
    { tool: 'tasks', input: '', args: { action: 'list' } },
    { tool: 'tool_describe', input: 'terminal', args: { tool: 'terminal', arguments: { input: 'bad' } } },
  ];
  let turn = 0;
  const prompts: string[] = [];
  try {
    const answer = await new ToolLoop(host, 20, 20000).run(
      'Synthetic local-only fixture',
      async prompt => {
        prompts.push(prompt);
        const proposal = proposals[turn++];
        return proposal ? '```step-tool\n' + JSON.stringify(proposal) + '\n```' : 'fixture complete';
      },
      f.scope.signal,
    );
    assert.equal(answer, 'fixture complete');
    const full = prompts.at(-1)!;
    assert.match(full, /staged-for-human-review/);
    assert.match(full, /synthetic exact text/);
    assert.match(full, /INVALID_TOOL_REQUEST/);
    assert.equal(await readFile(join(f.root, 'note.txt'), 'utf8'), 'synthetic exact text');
    assert.ok(f.requests() >= 6, 'discovery does not remove transmission consent');
    await assert.rejects(f.tools.execute({ tool: 'tool_search', input: '', args: { limit: '10' } } as any, f.scope), /INVALID_INPUT/);
    await assert.rejects(f.tools.execute({ tool: 'files', input: '../outside.txt' }, f.scope), /INVALID_PATH/);
  } finally {
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('explicit managed MCP discovery retains the existing effect gate and never dispatches a remote call', async () => {
  const f = await fixture();
  let contacted = 0;
  f.policy.features.mcp = true;
  f.policy.mcpServers = [{ name: 'synthetic', transport: 'stdio', command: 'unused', args: [] }];
  f.tools.external = async (r, _scope, check) => {
    await check();
    contacted++;
    assert.equal(r.tool, 'mcp_search');
    assert.equal(r.input, 'synthetic');
    return {
      total: 1,
      tools: [
        {
          server: 'synthetic',
          name: 'remote_read',
          description: 'untrusted',
          inputSchema: { type: 'object', properties: { key: { type: 'string' } } },
        },
      ],
    };
  };
  const host = await f.tools.host(f.scope);
  try {
    await host.execute({ tool: 'tool_search', input: '' }, f.scope.signal);
    assert.equal(contacted, 0);
    const described = (await host.execute(
      { tool: 'tool_describe', input: 'remote_read', args: { server: 'synthetic' } },
      f.scope.signal,
    )) as any;
    assert.equal(described.tools[0].name, 'remote_read');
    assert.equal(described.tools[0].executionGranted, false);
    assert.equal(described.tools[0].trusted, false);
    assert.equal(contacted, 1);
    assert.ok(f.requests() > 0, 'remote discovery still uses execution gate');
    await assert.rejects(
      host.execute({ tool: 'tool_describe', input: 'remote_read', args: { server: 'other' } }, f.scope.signal),
      /MCP_SERVER_NOT_ALLOWED/,
    );
    const limited = (await host.execute(
      { tool: 'tool_search', input: '', args: { scope: 'mcp', server: 'synthetic', limit: 1 } },
      f.scope.signal,
    )) as any;
    assert.equal(limited.hasMore, false);
    assert.equal(limited.boundedDiscovery, true);
    assert.equal(contacted, 2);
    f.deny();
    const denied = (await host.execute(
      { tool: 'tool_describe', input: 'remote_read', args: { server: 'synthetic' } },
      f.scope.signal,
    )) as any;
    assert.equal(denied.cancelled, true);
    assert.equal(contacted, 2, 'denied discovery must not contact server');
    f.policy.features.mcp = false;
    await assert.rejects(
      f.tools.execute({ tool: 'tool_search', input: '', args: { scope: 'mcp', server: 'synthetic' } }, f.scope),
      /MCP_DISABLED/,
    );
    assert.equal(contacted, 2);
  } finally {
    await host.dispose?.();
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('agent search_files and patch dispatch retain privacy, write gates and plan restrictions', async () => {
  for (const mode of ['ask', 'acceptEdits', 'plan'] as const) {
    const f = await fixture(mode);
    const host = await f.tools.host(f.scope);
    try {
      await mkdir(join(f.root, 'nested'));
      await writeFile(join(f.root, 'nested', 'a.txt'), 'synthetic marker\nold exact text');
      const [request] = loopRequests(JSON.stringify({ tool: 'search_files', input: '.', args: { pattern: 'marker', target: 'content' } }));
      assert.ok(request, 'search must be agent reachable');
      const result = (await host.execute(request, f.scope.signal)) as any;
      assert.deepEqual(result.matches, [{ path: 'nested/a.txt', line: 1, text: 'synthetic marker' }]);
      await host.outgoing(JSON.stringify(result), f.scope.signal, request);
      assert.ok(f.requests() > 0, 'transmission consent still applies');
      const [patch] = loopRequests(
        JSON.stringify({ tool: 'patch', input: 'nested/a.txt', args: { old_string: 'old exact text', new_string: 'new exact text' } }),
      );
      assert.ok(patch, 'patch must be agent reachable');
      assert.equal(host.readOnly(patch), false);
      if (mode === 'plan') {
        await assert.rejects(host.execute(patch, f.scope.signal), /PLAN_MODE_BLOCKED/);
        continue;
      }
      const receipt = (await host.execute(patch, f.scope.signal)) as any;
      assert.equal(receipt.status, mode === 'ask' ? 'staged-for-human-review' : 'applied');
      assert.equal(
        await readFile(join(f.root, 'nested', 'a.txt'), 'utf8'),
        mode === 'ask' ? 'synthetic marker\nold exact text' : 'synthetic marker\nnew exact text',
      );
      if (mode === 'acceptEdits') assert.ok(f.events.includes('pre_tool_use'));
      f.policy.permission.pathRules = [{ pattern: 'nested/**', allow: false }];
      await assert.rejects(host.execute(patch, f.scope.signal), /PATH_RULE_DENIED/);
      assert.deepEqual(((await host.execute(request, f.scope.signal)) as any).matches, []);
    } finally {
      await host.dispose?.();
      await f.workbench.close();
      f.store.close();
      await rm(f.root, { recursive: true, force: true });
    }
  }
});
test('draft progress consent covers only clean answers and receipts, never file contents or browser actions', async () => {
  const f = await fixture();
  f.allowRun();
  const host = await f.tools.host(f.scope);
  await host.outgoing('{"answer":"Brief"}', f.scope.signal, { tool: 'ask_user', input: 'Style?' });
  const count = f.requests();
  await host.outgoing('{"approved":true}', f.scope.signal, { tool: 'plan', input: 'Draft' });
  await host.outgoing('{"status":"staged-for-human-review"}', f.scope.signal, { tool: 'changes', input: 'draft.md', content: 'Draft' });
  assert.equal(f.requests(), count);
  await host.outgoing('File content', f.scope.signal, { tool: 'changes', input: 'draft.md', args: { action: 'diff' } });
  assert.equal(f.requests(), count + 1);
  await host.outgoing('Web content', f.scope.signal, { tool: 'browser_control', input: 'tab', args: { action: 'read' } });
  assert.equal(f.requests(), count + 2);
  f.scope.connection.id = 'different-account';
  await assert.rejects(host.outgoing('{"approved":true}', f.scope.signal, { tool: 'plan', input: 'Draft' }), /DESTINATION_CHANGED/);
  await host.dispose?.();
  f.store.close();
});

test('reference outline discovers section names without transmitting the whole document and keeps source consent', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'known.md'), '# Policy\n\nPurpose\n## Medical allowance\nFull policy evidence here.');
    const host = await f.tools.host(f.scope);
    const request = { tool: 'reference', input: 'registered', args: { action: 'outline' } } as const;
    const outline = (await host.execute(request, f.scope.signal)) as any;
    assert.deepEqual(outline.sections, ['Policy', 'Medical allowance']);
    assert.ok(!JSON.stringify(outline).includes('Full policy evidence'));
    await host.outgoing(JSON.stringify(outline), f.scope.signal, request);
    assert.ok(f.requests() > 0);
    const section = (await host.execute(
      { tool: 'reference', input: 'registered', args: { section: 'Medical allowance' } },
      f.scope.signal,
    )) as any;
    assert.match(section.text, /Full policy evidence/);
    await host.dispose?.();
  } finally {
    f.store.close();
  }
});

test('catalog fallback exposes complete registered discovery metadata through governed tools without reading bodies', async () => {
  const f = await fixture();
  try {
    const harness = (f.tools as any).harness;
    harness.catalog = async () => [
      { name: 'routed', title: 'Routed Skill', description: 'Short purpose', status: 'routed' },
      { name: 'hidden', status: 'registered' },
    ];
    harness.documentCatalog = async () => [
      { id: 'readable', title: 'Readable policy', path: 'policy.md' },
      { id: 'revoked', title: 'Revoked', path: 'old.md', status: 'restricted' },
    ];
    const host = await f.tools.host(f.scope);
    for (const tool of ['skill', 'reference'] as const) {
      const request = { tool, input: '', args: { action: 'catalog' } };
      const result = (await host.execute(request, f.scope.signal)) as any;
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].id, tool === 'skill' ? 'routed' : 'readable');
      assert.ok(!JSON.stringify(result).includes('text'));
      await host.outgoing(JSON.stringify(result), f.scope.signal, request);
    }
    assert.ok(f.requests() > 0, 'discovery transmission still requires consent');
  } finally {
    f.store.close();
  }
});

test('browser control uses the task scope, serial execution, transmission consent and cancellation', async () => {
  const f = await fixture();
  const stop = new AbortController();
  f.scope.signal = stop.signal;
  let owner = '';
  let closed = '';
  f.tools.external = async (request, scope, check) => {
    await check();
    owner = scope.sessionId;
    return { text: 'Synthetic browser result', action: request.args?.action };
  };
  f.tools.closeBrowser = id => {
    closed = id;
  };
  const host = await f.tools.host(f.scope);
  const request = { tool: 'browser_control' as const, input: 'https://example.com', args: { action: 'open' } };
  try {
    assert.equal(host.readOnly(request), false, 'browser operations must retain their order');
    const result = await host.execute(request, stop.signal);
    assert.equal(owner, f.scope.sessionId);
    assert.equal(f.requests(), 0, 'connector owns the one-time action confirmation');
    await host.outgoing(JSON.stringify(result), stop.signal, request);
    assert.equal(f.requests(), 1, 'page evidence still requires provider transmission consent');
    stop.abort();
    assert.equal(closed, f.scope.sessionId);
    await assert.rejects(host.execute(request, stop.signal), /CANCELLED/);
  } finally {
    await host.dispose?.();
    f.store.close();
  }
});

test('plan mode refuses browser interactions before invoking the connector', async () => {
  const f = await fixture('plan');
  let called = false;
  f.tools.external = async () => {
    called = true;
    return {};
  };
  try {
    for (const action of ['open', 'click', 'fill', 'close']) {
      await assert.rejects(f.tools.execute({ tool: 'browser_control', input: 'tab', args: { action } }, f.scope), /PLAN_MODE_BLOCKED/);
    }
    assert.equal(called, false);
  } finally {
    f.store.close();
  }
});

test('scoped file consent batches clean reads but re-prompts masked sources and different folders', async () => {
  const f = await fixture();
  f.policy.pilot = false; // per-source scopes are the strict-mode behavior
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
  f.policy.pilot = false; // per-source scopes are the strict-mode behavior
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
    await writeFile(join(f.root, 'known.md'), '# Known\nIntro\n## First\nOne\n## Second\nTwo');
    const one: any = await f.tools.execute({ tool: 'reference', input: 'registered', args: { section: 'Second' } }, f.scope);
    assert.equal(one.text, '## Second\nTwo');
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
test('the plan workflow asks the employee to approve the plan, keeps it on the task, and execute ticks it off', async () => {
  const f = await fixture();
  try {
    const session = f.store.create('plan task', 'cc');
    const scope = { ...f.scope, sessionId: session.id, workflow: 'plan' as const };
    const before = f.requests();
    const plan = '# เป้าหมาย: จัดสัมมนา\n- [ ] ร่างกำหนดการ\n- [ ] ขออนุมัติงบ (ผู้มีอำนาจ)';
    const approved: any = await f.tools.execute({ tool: 'plan', input: plan }, scope);
    assert.equal(approved.approved, true);
    assert.equal(f.requests(), before + 1, 'asked even in pilot mode');
    const saved = f.store.session(session.id).workPlan!;
    assert.equal(saved.goal, 'จัดสัมมนา');
    assert.deepEqual(
      saved.tasks.map(t => t.status),
      ['todo', 'todo'],
    );
    const executing = { ...scope, workflow: 'execute' as const };
    const ticked: any = await f.tools.execute({ tool: 'plan_update', input: '1', args: { status: 'done' }, content: 'ส่งแล้ว' }, executing);
    assert.deepEqual(ticked, { task: 1, status: 'done', remaining: 1 });
    assert.deepEqual(f.store.session(session.id).workPlan!.tasks[0], { title: 'ร่างกำหนดการ', status: 'done', note: 'ส่งแล้ว' });
    await assert.rejects(f.tools.execute({ tool: 'plan_update', input: '9', args: { status: 'done' } }, executing), /PLAN_TASK_UNKNOWN/);
    await assert.rejects(f.tools.execute({ tool: 'plan_update', input: '2', args: { status: 'approved' } }, executing), /INVALID_INPUT/);
    f.deny();
    const declined: any = await f.tools.execute({ tool: 'plan', input: '# อื่น\n- [ ] งานใหม่' }, scope);
    assert.equal(declined.approved, false);
    assert.equal(f.store.session(session.id).workPlan!.goal, 'จัดสัมมนา', 'a declined plan leaves the approved one');
  } finally {
    f.store.close();
  }
});
test('the AI reads a website only after the employee allows that site once in the task', async () => {
  const f = await fixture();
  f.policy.checks = { authority: false, privacy: false };
  const fetchSite = (url: string) =>
    f.tools.execute({ tool: 'web_fetch', input: url }, f.scope).then(
      () => 'ok',
      (e: Error) => e.message,
    );
  try {
    const before = f.requests();
    await fetchSite('https://no-such-host.example/one');
    assert.equal(f.requests(), before + 1, 'a new site asks');
    await fetchSite('https://no-such-host.example/two');
    assert.equal(f.requests(), before + 1, 'the same site in the same task does not ask again');
    await fetchSite('https://another-host.example/');
    assert.equal(f.requests(), before + 2);
    f.deny();
    assert.equal(await fetchSite('https://third-host.example/'), 'WEB_SITE_DECLINED');
  } finally {
    f.store.close();
  }
});
test('references and Skills load when the app is installed under a folder named STeP Desktop (Windows)', async () => {
  const f = await fixture();
  try {
    const installed = join(f.root, 'Programs', 'STeP Desktop', 'resources', 'harness');
    await mkdir(join(installed, 'docs'), { recursive: true });
    await writeFile(join(installed, 'known.md'), 'Installed source');
    await writeFile(join(installed, '.env'), 'TOKEN=x');
    const harness = (f.tools as any).harness;
    harness.root = installed;
    harness.documentMetadata = async (ids: string[]) =>
      ids.map(id => ({ id, path: id === 'secret' ? '.env' : 'known.md', status: 'active' }));
    assert.match(JSON.stringify(await f.tools.execute({ tool: 'reference', input: 'registered' }, f.scope)), /Installed source/);
    assert.match(JSON.stringify(await f.tools.execute({ tool: 'skill', input: 'known' }, f.scope)), /Installed source/);
    // Sensitive files inside the harness stay closed.
    await assert.rejects(f.tools.execute({ tool: 'reference', input: 'secret' }, f.scope), /INVALID_CONTEXT_PATH/);
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
test('recursive search scans complete sources before matching or line previews', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'boundary.txt'), 'marker ' + 'x'.repeat(39997) + '\npassword: synthetic-test-credential');
    // Review finding M1: a file the privacy review withholds is skipped and counted instead of aborting the whole
    // search. Its marker line (before the credential) is still never returned, because the full file is reviewed first.
    const withheld = (await f.tools.execute({ tool: 'search_files', input: '.', args: { pattern: 'marker' } }, f.scope)) as any;
    assert.deepEqual(withheld.matches, []);
    assert.equal(withheld.withheldFiles, 1);
    assert.ok(!JSON.stringify(withheld).includes('synthetic-test-credential'));
    await rm(join(f.root, 'boundary.txt'));
    await writeFile(join(f.root, 'personal.txt'), 'Contact: sample@example.com\nmarker');
    const result = (await f.tools.execute({ tool: 'search_files', input: '.', args: { pattern: 'Contact:' } }, f.scope)) as any;
    assert.equal(result.matches[0].line, 1);
    assert.ok(!JSON.stringify(result).includes('sample@example.com'));
  } finally {
    await f.workbench.close();
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
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
test('Office creation stages binary files, preserves conflicts and obeys plan mode', async () => {
  const f = await fixture();
  try {
    const created: any = await f.tools.execute(
      {
        tool: 'sheet_create',
        input: 'new.xlsx',
        args: {
          spec: {
            sheets: [{ name: 'งาน', columns: [{ label: 'รหัส' }], rows: [['00123']] }],
          },
        },
      },
      f.scope,
    );
    assert.equal(created.status, 'staged-for-human-review');
    await assert.rejects(readFile(join(f.root, 'new.xlsx')), { code: 'ENOENT' });
    assert.ok(f.store.get<any>('change', created.id).binary);
    await f.workbench.apply(created.id);
    const read: any = await f.tools.execute({ tool: 'sheet_read', input: 'new.xlsx', args: { range: 'A2' } }, f.scope);
    assert.deepEqual(read.rows, [['00123']]);
    await assert.rejects(
      f.tools.execute(
        {
          tool: 'sheet_create',
          input: 'new.xlsx',
          args: {
            spec: {
              sheets: [{ name: 'งาน', columns: [{ label: 'รหัส' }], rows: [['other']] }],
            },
          },
        },
        f.scope,
      ),
      /FILE_EXISTS/,
    );
    const slides: any = await f.tools.execute(
      {
        tool: 'slides_create',
        input: 'new.pptx',
        args: {
          spec: {
            slides: [{ title: 'สังเคราะห์', bullets: ['หนึ่งขั้นตอน'] }],
          },
        },
      },
      f.scope,
    );
    assert.equal(slides.visualReview, 'required');
    await writeFile(join(f.root, 'new.pptx'), 'human file');
    await assert.rejects(f.workbench.apply(slides.id), /FILE_CONFLICT/);
  } finally {
    f.store.close();
  }
  const plan = await fixture('plan');
  try {
    for (const tool of ['sheet_create', 'slides_create'] as const)
      await assert.rejects(plan.tools.execute({ tool, input: 'new.xlsx', args: {} }, plan.scope), /PLAN_MODE_BLOCKED/);
  } finally {
    plan.store.close();
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

test('accept edits applies an AI edit with a snapshot; ask mode leaves it staged for review', async () => {
  for (const mode of ['acceptEdits', 'ask'] as const) {
    const f = await fixture(mode);
    await writeFile(join(f.root, 'draft.md'), 'Before');
    const result: any = await f.tools.execute({ tool: 'changes', input: 'draft.md', content: 'After' }, f.scope);
    if (mode === 'acceptEdits') {
      assert.equal(result.status, 'applied');
      assert.ok(result.snapshotId, 'a snapshot can undo the edit');
      assert.equal(await readFile(join(f.root, 'draft.md'), 'utf8'), 'After');
      assert.equal(f.requests(), 0, 'no dialog for the edit');
      assert.ok(f.events.includes('pre_tool_use') && f.events.includes('post_tool_use'), 'hooks still run');
    } else {
      assert.equal(result.status, 'staged-for-human-review');
      assert.equal(await readFile(join(f.root, 'draft.md'), 'utf8'), 'Before');
    }
    f.store.close();
  }
});

test('accept edits never runs a command without asking', async () => {
  const f = await fixture('acceptEdits');
  f.deny();
  assert.equal(await f.tools.execute({ tool: 'terminal', input: 'echo should-not-run' }, f.scope), null, 'declined, not run');
  assert.equal(f.requests(), 1, 'the command asked first');
  f.store.close();
});

test('task cancel denial and changed destination never terminate an owned job', async () => {
  const f = await fixture();
  const host = await f.tools.host(f.scope);
  try {
    await writeFile(join(f.root, 'slow.cjs'), 'setTimeout(() => {}, 30000);');
    const job = (await host.execute({ tool: 'terminal', input: `${node} slow.cjs` }, f.scope.signal)) as any;
    f.deny();
    assert.equal(await host.execute({ tool: 'tasks', input: job.id, args: { action: 'cancel' } }, f.scope.signal), null);
    assert.equal(
      ((await host.execute({ tool: 'tasks', input: job.id, args: { action: 'status' } }, f.scope.signal)) as any).status,
      'running',
    );
    // The person sees which command is being stopped, not only the task id.
    assert.match(f.bodies.at(-1)!, /slow\.cjs/);
    assert.match(f.bodies.at(-1)!, /running/);
    f.holdApproval();
    const pending = host.execute({ tool: 'tasks', input: job.id, args: { action: 'cancel' } }, f.scope.signal);
    const before = f.requests();
    for (let i = 0; i < 100 && f.requests() === before; i++) await new Promise(resolve => setTimeout(resolve, 5));
    f.scope.connection.id = 'changed';
    f.approvals.respond(f.lastApproval(), 'once');
    await assert.rejects(pending, /DESTINATION_CHANGED/);
    assert.equal(f.workbench.tasks().find(t => t.id === job.id)?.status, 'running');
  } finally {
    await host.dispose?.();
    await f.workbench.close();
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('task wait rechecks the workspace before returning process output', async () => {
  const f = await fixture();
  const host = await f.tools.host(f.scope);
  try {
    await writeFile(join(f.root, 'slow.cjs'), 'setTimeout(() => {}, 30000);');
    const job = (await host.execute({ tool: 'terminal', input: `${node} slow.cjs` }, f.scope.signal)) as any;
    const next = join(f.root, 'next');
    await mkdir(next);
    const pending = host.execute({ tool: 'tasks', input: job.id, args: { action: 'wait', timeoutMs: 30000 } }, f.scope.signal);
    setTimeout(() => f.store.put('settings', 'main', { workspace: next }), 30);
    await assert.rejects(pending, /WORKSPACE_CHANGED/);
  } finally {
    await host.dispose?.();
    await f.workbench.close();
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('agent poll reports rolling-log loss with absolute sanitized-output cursors', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'loud.cjs'), "process.stdout.write('A'.repeat(110000));");
    const job = (await f.tools.execute({ tool: 'terminal', input: `${node} loud.cjs` }, f.scope)) as any;
    const done = (await f.tools.execute(
      { tool: 'tasks', input: job.id, args: { action: 'wait', timeoutMs: 2000, offset: 0, length: 100 } },
      f.scope,
    )) as any;
    assert.equal(done.status, 'done');
    assert.equal(done.output.length, 100);
    assert.equal(done.truncated, true);
    assert.equal(done.offset, 10000);
    assert.equal(done.endOffset, 10100);
    assert.equal(done.total, 110000);
    const end = (await f.tools.execute({ tool: 'tasks', input: job.id, args: { action: 'poll', offset: 110000 } }, f.scope)) as any;
    assert.equal(end.output, '');
    assert.equal(end.endOffset, 110000);
    const legacy = await f.workbench.start(`${node} -e \"process.exit(0)\"`);
    await assert.rejects(f.tools.execute({ tool: 'tasks', input: legacy.id, args: { action: 'status' } }, f.scope), /TASK_NOT_FOUND/);
  } finally {
    await f.workbench.close();
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('agent wait is bounded, cancellable and uses the existing process cancellation gate', async () => {
  const f = await fixture();
  const abort = new AbortController();
  f.scope.signal = abort.signal;
  const host = await f.tools.host(f.scope);
  try {
    await writeFile(join(f.root, 'slow.cjs'), "process.stdout.write('started'); setTimeout(() => process.stdout.write('finished'), 800);");
    const job = (await host.execute({ tool: 'terminal', input: `${node} slow.cjs` }, abort.signal)) as any;
    const request = { tool: 'tasks' as const, input: job.id, args: { action: 'wait', timeoutMs: 20 } };
    let activity = '';
    f.scope.activity = text => {
      activity = text;
    };
    host.activity?.('tasks');
    assert.equal(activity, 'กำลังตรวจงานเบื้องหลัง');
    assert.equal(host.readOnly(request), false, 'bounded waits must not fan out in parallel');
    const waiting = (await host.execute(request, abort.signal)) as any;
    assert.equal(waiting.status, 'running');
    assert.equal(waiting.timedOut, true);
    await assert.rejects(host.execute({ ...request, args: { action: 'wait', timeoutMs: 30001 } }, abort.signal), /INVALID_INPUT/);
    const done = (await host.execute({ ...request, args: { action: 'wait', timeoutMs: 2000 } }, abort.signal)) as any;
    assert.equal(done.status, 'done');
    assert.equal(done.timedOut, false);
    assert.match(done.output, /startedfinished/);
    const slow = (await host.execute({ tool: 'terminal', input: `${node} slow.cjs` }, abort.signal)) as any;
    await assert.rejects(
      f.tools.execute({ tool: 'tasks', input: slow.id, args: { action: 'cancel' } }, { ...f.scope, sessionId: 'other' }),
      /TASK_NOT_FOUND/,
    );
    const before = f.requests();
    await host.execute({ tool: 'tasks', input: slow.id, args: { action: 'cancel' } }, abort.signal);
    assert.equal(f.requests(), before + 1, 'cancel retains human approval in ask mode');
    const cancelled = (await host.execute(
      { tool: 'tasks', input: slow.id, args: { action: 'wait', timeoutMs: 2000 } },
      abort.signal,
    )) as any;
    assert.equal(cancelled.status, 'cancelled');
    const pendingJob = (await host.execute({ tool: 'terminal', input: `${node} slow.cjs` }, abort.signal)) as any;
    const pending = host.execute({ tool: 'tasks', input: pendingJob.id, args: { action: 'wait', timeoutMs: 30000 } }, abort.signal);
    setTimeout(() => abort.abort(), 20);
    await assert.rejects(pending, /CANCELLED/);
  } finally {
    await host.dispose?.();
    await f.workbench.close();
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
  }
  const plan = await fixture('plan');
  try {
    const job = await plan.workbench.start(`${node} -e \"setTimeout(()=>{},1000)\"`, plan.scope.sessionId);
    await assert.rejects(plan.tools.execute({ tool: 'tasks', input: job.id, args: { action: 'cancel' } }, plan.scope), /PLAN_MODE/);
    assert.equal(
      ((await plan.tools.execute({ tool: 'tasks', input: job.id, args: { action: 'status' } }, plan.scope)) as any).status,
      'running',
    );
  } finally {
    await plan.workbench.close();
    plan.store.close();
    await rm(plan.root, { recursive: true, force: true });
  }
});

test('agent task inspection is session/workspace scoped and output bounded over a real subprocess', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'process.cjs'), "process.stdout.write('fixture-output');");
    const job = (await f.tools.execute({ tool: 'terminal', input: `${node} process.cjs` }, f.scope)) as any;
    for (let i = 0; i < 100 && f.workbench.tasks().find(t => t.id === job.id)?.status === 'running'; i++)
      await new Promise(resolve => setTimeout(resolve, 20));
    const status = (await f.tools.execute({ tool: 'tasks', input: job.id, args: { action: 'status' } }, f.scope)) as any;
    assert.equal(status.status, 'done');
    assert.equal(status.output, undefined, 'status returns metadata, not log bodies');
    const poll = (await f.tools.execute({ tool: 'tasks', input: job.id, args: { action: 'poll', offset: 0, length: 7 } }, f.scope)) as any;
    assert.equal(poll.output, 'fixture');
    assert.equal(poll.nextOffset, 7);
    assert.equal(poll.total, 14);
    const list = (await f.tools.execute({ tool: 'tasks', input: '', args: { action: 'list' } }, f.scope)) as any;
    assert.equal(list.length, 1);
    assert.equal(list[0].output, undefined);
    await assert.rejects(
      f.tools.execute({ tool: 'tasks', input: job.id, args: { action: 'status' } }, { ...f.scope, sessionId: 'other' }),
      /TASK_NOT_FOUND/,
    );
    assert.deepEqual(await f.tools.execute({ tool: 'tasks', input: '' }, { ...f.scope, sessionId: 'other' }), []);
    await assert.rejects(
      f.tools.execute({ tool: 'tasks', input: job.id, args: { action: 'poll', length: 40001 } }, f.scope),
      /INVALID_INPUT/,
    );
    await assert.rejects(f.tools.execute({ tool: 'tasks', input: job.id, args: { action: 'unknown' } }, f.scope), /INVALID_INPUT/);
    f.store.put('settings', 'main', { workspace: join(f.root, 'different') });
    await mkdir(join(f.root, 'different'));
    await assert.rejects(f.tools.execute({ tool: 'tasks', input: job.id, args: { action: 'status' } }, f.scope), /TASK_NOT_FOUND/);
  } finally {
    await f.workbench.close();
    f.store.close();
    await rm(f.root, { recursive: true, force: true });
  }
});
