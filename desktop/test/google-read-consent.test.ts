import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoogleReadConsent } from '../electron/google-read-consent';
import { executeGoogleRead } from '../electron/google-read-tool';
import { googleReadRequestConsent } from '../electron/google-consent';
import { GoogleWorkspace } from '../electron/google-workspace';
import { googleOperationCatalog, type GoogleRequest } from '../electron/google-operations';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { defaultPolicy } from '../electron/policy';
import { Approvals } from '../electron/approvals';
import { Workbench } from '../electron/workbench';
import { Questions } from '../electron/questions';
import { ToolGate } from '../electron/tool-gate';
import { DesktopTools, type ToolScope } from '../electron/tools';
import { ToolLoop } from '../electron/tool-loop';
import { useLanguage } from '../electron/i18n';
import type { Harness } from '../electron/service';

const privacy: any = await import('../../src/modules/privacy/index.js');
const json = (data: unknown) => new Response(JSON.stringify(data));
const query = 'ขอดูอีเมลที่เกี่ยวข้องกับ hr เดือนนี้';
const list: GoogleRequest = { operation: 'gmail.list', params: { query: 'hr after:2026/10/01 before:2026/11/01' } };
const get = (id = 'mail_one'): GoogleRequest => ({ operation: 'gmail.get', params: { messageId: id } });
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'step-google-read-consent-'));
  const store = new Store(join(dir, 'store.sqlite'));
  const vault = new Vault(join(dir, 'vault.sqlite'), { wrap: s => Buffer.from(s), unwrap: b => b.toString() });
  const controller = new AbortController();
  const context = { signal: controller.signal, check: async () => {}, approve: async () => true };
  const config = {
    clientId: 'fixture.apps.googleusercontent.com',
    domains: ['example.test'],
    services: ['gmail-read', 'gmail-draft'] as const,
  };
  let calls = 0,
    prompts = 0,
    scans = 0,
    answer = true,
    changed = false;
  const google = new GoogleWorkspace(
    store,
    vault,
    () => ({ ...config, services: [...config.services] }),
    async () => {},
    async url => {
      calls++;
      return String(url).includes('/messages?')
        ? json({ messages: [{ id: 'mail_one' }, { id: 'mail_two' }] })
        : json({
            id: 'mail_one',
            payload: { mimeType: 'text/plain', body: { data: Buffer.from('Synthetic HR notice').toString('base64url') } },
          });
    },
    async (_config, scopes) => ({
      who: { sub: 'synthetic', email: 'fixture@example.test', hd: 'example.test' },
      scopes,
      tokens: { access: 'synthetic-access', refresh: 'synthetic-refresh', expires: Date.now() + 3600000 },
    }),
  );
  await google.connect(['gmail-read', 'gmail-draft'], context);
  const id = google.state().accounts[0].id;
  const check = async () => {
    if (changed) throw new Error('POLICY_CHANGED');
    if (controller.signal.aborted) throw new Error('CANCELLED');
  };
  const consent = new GoogleReadConsent(query, 'OpenAI · test-model', check);
  const read = (
    input = list,
    request: object = {},
    grant = consent,
    ask = async () => {
      prompts++;
      return answer;
    },
  ) =>
    executeGoogleRead(
      google,
      id,
      input,
      request,
      grant,
      {
        ...context,
        check,
        approve: async () => {
          throw new Error('DUPLICATE_PROMPT');
        },
      },
      text => {
        scans++;
        return privacy.evaluatePrivacyGate(text);
      },
      ask,
    );
  return {
    google,
    store,
    vault,
    controller,
    context,
    id,
    dir,
    read,
    check,
    consent,
    counts: () => ({ calls, prompts, scans }),
    answer: (value: boolean) => {
      answer = value;
    },
    change: () => {
      changed = true;
    },
    clean: () => {
      consent.close();
      vault.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('HR search, pagination and message reads share one approval and review every result; next request asks again', async () => {
  const f = await fixture();
  try {
    const request = {};
    const result = await f.read(list, request);
    await f.read({ ...list, params: { ...list.params, pageToken: 'next_page' } });
    await Promise.all([f.read(get()), f.read(get('mail_two'))]);
    assert.deepEqual(f.counts(), { calls: 4, prompts: 1, scans: 4 });
    assert.equal(await f.consent.covers(request, JSON.stringify(result)), true);
    assert.equal(await f.consent.covers({}, JSON.stringify(result)), false);
    assert.equal(await f.consent.covers(request, JSON.stringify({ data: 'injected' })), false);
    await assert.rejects(
      f.consent.authorize(
        'different-account',
        async () => {
          throw new Error('DUPLICATE_PROMPT');
        },
        f.check,
      ),
      /GOOGLE_READ_SCOPE_CHANGED/,
    );
    f.consent.close();
    await assert.rejects(f.read(get()), /CANCELLED/);
    const next = new GoogleReadConsent(query, 'OpenAI · test-model', f.check);
    await f.read(list, {}, next);
    assert.equal(f.counts().prompts, 2, 'identical requests in the same session do not share consent');
    next.close();
  } finally {
    f.clean();
  }
});

test('parallel first reads open one dialog; denial is latched without reading Google', async () => {
  const f = await fixture();
  try {
    f.answer(false);
    const results = await Promise.allSettled([f.read(), f.read(get()), f.read(get('mail_two'))]);
    for (const result of results) {
      assert.equal(result.status, 'rejected');
      if (result.status === 'rejected') assert.match(result.reason.message, /CANCELLED/);
    }
    await assert.rejects(f.read(), /CANCELLED/);
    assert.deepEqual(f.counts(), { calls: 0, prompts: 1, scans: 0 });
  } finally {
    f.clean();
  }
});

test('account changes, global invalidation and writes cannot reuse a read grant', async () => {
  for (const invalidate of ['revision', 'epoch']) {
    const f = await fixture();
    try {
      await f.read();
      if (invalidate === 'revision') {
        f.google.pause(f.id, true);
        f.google.pause(f.id, false);
      } else f.google.invalidate();
      await assert.rejects(f.read(get()), /GOOGLE_READ_SCOPE_CHANGED/);
      assert.equal(f.counts().calls, 1);
      assert.equal(f.counts().prompts, 1);
      await assert.rejects(
        f.read({ operation: 'gmail.draft', body: { to: ['synthetic@example.test'], subject: 'Fixture', text: 'Fixture' } }),
        /GOOGLE_READ_SCOPE_CHANGED/,
      );
    } finally {
      f.clean();
    }
  }
});

test('policy changes during approval and cancellation before handoff prevent reads or transmission', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.read(list, {}, f.consent, async () => {
        f.change();
        return true;
      }),
      /POLICY_CHANGED/,
    );
    assert.equal(f.counts().calls, 0);
  } finally {
    f.clean();
  }
  const other = await fixture();
  try {
    const request = {};
    const value = await other.read(list, request);
    other.controller.abort();
    await assert.rejects(other.consent.covers(request, JSON.stringify(value)), /CANCELLED/);
  } finally {
    other.clean();
  }
});

test('request consent cannot release privacy-blocked data or a result after the account changes', async () => {
  const f = await fixture();
  try {
    const request = {};
    await assert.rejects(
      executeGoogleRead(
        f.google,
        f.id,
        list,
        request,
        f.consent,
        f.context,
        () => ({ action: 'block-external', classification: 'restricted' }),
        async () => true,
      ),
      /PRIVACY_REVIEW_REQUIRED/,
    );
    assert.equal(await f.consent.covers(request, '{}'), false);
    const value = await f.read(get(), request);
    f.google.invalidate();
    await assert.rejects(f.consent.covers(request, JSON.stringify(value)), /GOOGLE_ACCOUNT_CHANGED/);
  } finally {
    f.clean();
  }
});

test('Ask mode host: local discovery, HR search and multiple reads need exactly one approval even with privacy on', async () => {
  const f = await fixture();
  const policy = defaultPolicy();
  policy.checks.privacy = true;
  const approvalsSeen: string[] = [];
  const approvals = new Approvals(f.store, approval => {
    if (approval) {
      approvalsSeen.push(approval.tool);
      queueMicrotask(() => approvals.respond(approval.id, 'once'));
    }
  });
  f.store.put('settings', 'main', { workspace: f.dir });
  const workbench = new Workbench(f.store, undefined, () => policy);
  const gate = new ToolGate(
    () => policy,
    () => 'ask',
    () => workbench.root(),
    approvals,
    async () => ({ blocked: false, reason: '', results: [] }),
  );
  let skillPath = 'skills/common/google-workspace/SKILL.md';
  for (const resource of ['SKILL.md', 'references/tool-contract.md', 'examples/good-output.md']) {
    const file = join(f.dir, 'skills/common/google-workspace', resource);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, 'Synthetic bundled Google instructions and public contract.');
  }
  mkdirSync(join(f.dir, 'skills/custom'), { recursive: true });
  writeFileSync(join(f.dir, 'skills/custom/SKILL.md'), 'Synthetic separately installed instructions.');
  const tools = new DesktopTools(
    workbench,
    {
      root: f.dir,
      privacy: privacy.evaluatePrivacyGate,
      catalog: async () => [{ name: 'google-workspace', path: skillPath, status: 'routed' }],
      skillMetadata: async () => ({ path: skillPath, mandatoryReferences: [] }),
      route: async () => ({ routingContract: { mode: 'SKILL', skill: 'google-workspace', authority: { status: 'ALLOW' } } }),
    } as unknown as Harness,
    gate,
    approvals,
    new Questions(() => {}),
    () => policy,
    () => 'ask',
    'unused',
  );
  const scope: ToolScope = {
    cancel: () => f.controller.abort(),
    sessionId: 'same-session',
    query: 'earlier unrelated request',
    request: query,
    team: 'fixture',
    contract: { mode: 'GENERAL', authority: { status: 'ALLOW' } },
    connection: { id: 'test', provider: 'openai', mode: 'api', model: 'test-model', executable: '', ready: true, note: '' },
    signal: f.controller.signal,
    search: async () => '',
    activity: () => {},
  };
  tools.external = async (r, runScope, check) => {
    assert.ok(runScope.googleReads);
    if (r.args?.action === 'list') {
      const value = { accounts: f.google.catalog('fixture'), operations: googleOperationCatalog };
      await runScope.googleReads.recordDiscovery(r, JSON.stringify(value));
      return value;
    }
    return executeGoogleRead(
      f.google,
      f.id,
      { operation: r.input as GoogleRequest['operation'], params: r.args?.params as any },
      r,
      runScope.googleReads,
      { ...f.context, check },
      privacy.evaluatePrivacyGate,
      async detail => {
        assert.equal(detail.facts[0].value, query);
        assert.match(detail.facts[2].value, /OpenAI.*test-model/);
        return approvals.request(approvals.rule(f.dir, 'google-read-request', detail.body), detail, scope.signal);
      },
    );
  };
  try {
    const run = async () => {
      const host = await tools.host(scope);
      let turn = 0;
      const request = (input: string, args: object) =>
        '```step-tool\n' + JSON.stringify({ tool: 'google_workspace', input, args }) + '\n```';
      return new ToolLoop(host).run(
        'synthetic prompt',
        async prompt => {
          assert.doesNotMatch(prompt, /"ok":false/);
          turn++;
          if (turn === 1) return '```step-tool\n{"tool":"skill","input":"google-workspace"}\n```';
          if (turn === 2)
            return '```step-tool\n{"tool":"skill","input":"google-workspace","args":{"resource":"references/tool-contract.md"}}\n```';
          if (turn === 3) return '```step-tool\n{"tool":"tool_search","input":"google_workspace","args":{"scope":"core"}}\n```';
          if (turn === 4) return '```step-tool\n{"tool":"tool_describe","input":"google_workspace"}\n```';
          if (turn === 5) return request('', { action: 'list' });
          if (turn === 6) return request('gmail.list', { action: 'execute', account: 'handle', params: list.params });
          if (turn === 7)
            return [get(), get('mail_two')]
              .map(r => request(r.operation, { action: 'execute', account: 'handle', params: r.params }))
              .join('\n');
          return 'Synthetic HR summary';
        },
        f.controller.signal,
      );
    };
    assert.equal(await run(), 'Synthetic HR summary');
    assert.deepEqual(approvalsSeen, ['google-read-request']);
    assert.equal(await run(), 'Synthetic HR summary');
    assert.deepEqual(approvalsSeen, ['google-read-request', 'google-read-request']);
    skillPath = 'skills/custom/SKILL.md';
    const custom = await tools.host(scope);
    const instruction = { tool: 'skill' as const, input: 'google-workspace' };
    const customValue = await custom.execute(instruction, f.controller.signal);
    await custom.outgoing(JSON.stringify(customValue), f.controller.signal, instruction);
    assert.equal(approvalsSeen.at(-1), 'tool-data', 'an arbitrary installed Skill cannot inherit the bundled-instruction exemption');
    await custom.dispose!();
    const host = await tools.host(scope);
    scope.connection.model = 'changed';
    await assert.rejects(host.check(), /DESTINATION_CHANGED/);
    await host.dispose!();
    scope.connection.model = 'test-model';
    const paging = await tools.host(scope);
    await paging.execute(
      { tool: 'google_workspace', input: list.operation, args: { action: 'execute', params: list.params } },
      f.controller.signal,
    );
    f.google.invalidate();
    await assert.rejects(paging.check(), /GOOGLE_ACCOUNT_CHANGED/);
    await paging.dispose!();
    policy.transmissionConsent = { allowRunScope: false };
    tools.external = async (_r, runScope) => ({ scoped: Boolean(runScope.googleReads) });
    scope.connection.model = 'test-model';
    const managed = await tools.host(scope);
    assert.deepEqual(await managed.execute({ tool: 'google_workspace', input: '', args: { action: 'list' } }, f.controller.signal), {
      scoped: false,
    });
    await managed.dispose!();
  } finally {
    approvals.close();
    f.clean();
  }
});

test('one-request consent explains account, destination, read scope and expiry in Thai and English', () => {
  try {
    for (const language of ['th', 'en']) {
      useLanguage(() => language);
      const detail = googleReadRequestConsent(query, 'OpenAI · test', 'fi••••@example.test', 'synthetic operation');
      assert.equal(detail.facts[0].value, query);
      assert.equal(detail.facts[1].value, 'fi••••@example.test');
      assert.equal(detail.facts[2].value, 'OpenAI · test');
      assert.equal(detail.allowRemember, false);
      if (language === 'en') {
        assert.match(detail.title, /this request/);
        assert.match(detail.body, /Approve once.*new request/i);
        assert.match(detail.facts[3].value, /Excludes sending, editing and deleting/);
      } else assert.match(detail.body, /อนุมัติครั้งเดียว/);
    }
  } finally {
    useLanguage(() => 'th');
  }
});
