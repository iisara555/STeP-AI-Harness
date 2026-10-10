import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWeb } from '../electron/web-extract';
import { ToolLoop, type LoopHost } from '../electron/tool-loop';
import { loopRequests } from '../src/tools';
import { defaultPolicy, parsePolicy } from '../electron/policy';
import { Mcp } from '../electron/mcp';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import { tmpdir } from 'node:os';

test('structured web extraction keeps Thai article, headings, table and verified public links, excludes executable content', () => {
  const html =
    '<!doctype html><html><head><title>ประกาศสังเคราะห์</title></head><body><nav>Menu</nav><main><h1>ข่าวทดสอบ</h1><p>ข้อมูล &amp; หลักฐาน</p><script>secret code</script><table><tr><th>รายการ</th><th>ราคา</th></tr><tr><td>สังเคราะห์</td><td>10</td></tr></table><a href="/source">เอกสาร</a><a>ไม่มีปลายทาง</a><a href="http://127.0.0.1/private">private</a><a href="javascript:alert(1)">JS</a></main></body></html>';
  const result = extractWeb(html, 'https://example.org/news');
  assert.equal(result.title, 'ประกาศสังเคราะห์');
  assert.equal(result.headings[0].text, 'ข่าวทดสอบ');
  assert.deepEqual(result.tables[0], [
    ['รายการ', 'ราคา'],
    ['สังเคราะห์', '10'],
  ]);
  assert.deepEqual(result.links, [{ text: 'เอกสาร', url: 'https://example.org/source' }]);
  assert.match(result.text, /ข้อมูล & หลักฐาน/);
  assert.doesNotMatch(JSON.stringify(result), /secret code|Menu|javascript|127\.0\.0\.1/);
  assert.equal(result.provenance, 'external-untrusted');
  assert.throws(
    () => extractWeb('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secret">]><a>&x;</a>', 'https://example.org'),
    /WEB_EXTRACT_INVALID/,
  );
});
test('web extraction marks bounded evidence as incomplete instead of claiming a complete page', () => {
  const result = extractWeb('<main><p>' + 'ข้อความ '.repeat(12000) + '</p></main>', 'https://example.org');
  assert.equal(result.truncated, true);
  assert.ok(result.text.length <= 30000);
});
test('new tool protocol exposes controlled extraction, image analysis and generation', () => {
  for (const tool of ['web_extract', 'vision_analyze', 'browser_vision', 'image_generate'])
    assert.equal(loopRequests('```step-tool\n' + JSON.stringify({ tool, input: 'synthetic' }) + '\n```')[0]?.tool, tool);
});
test('tool observability correlates success and failure without retaining input, output or exception details', async () => {
  const records: unknown[] = [],
    prompts: string[] = [];
  const host: LoopHost = {
    enabled: () => true,
    check: async () => {},
    readOnly: () => true,
    execute: async r => {
      if (r.tool === 'web_extract') throw new Error('private failure detail');
      return 'private synthetic output';
    },
    outgoing: async t => t,
    observe: r => records.push(r),
  };
  const replies = [
    '```step-tool\n{"tool":"files","input":"private-input"}\n```',
    '```step-tool\n{"tool":"web_extract","input":"https://example.org/private-input"}\n```',
    'done',
  ];
  await new ToolLoop(host).run('question', async p => (prompts.push(p), replies.shift()!), new AbortController().signal);
  assert.equal(records.length, 2);
  const data = records as { id: string; tool: string; ok: boolean; code?: string; ms: number }[];
  assert.deepEqual(
    data.map(r => [r.tool, r.ok, r.code]),
    [
      ['files', true, undefined],
      ['web_extract', false, 'TOOL_FAILED'],
    ],
  );
  assert.match(prompts[2], new RegExp(data[1].id));
  assert.doesNotMatch(JSON.stringify(data), /private|example\.org/);
});
test('Google Workspace server profile remains explicitly managed and does not enable MCP by default', () => {
  assert.equal(defaultPolicy().features.mcp, false);
  const parsed = parsePolicy({
    features: { mcp: true },
    mcpServers: [{ name: 'workspace', profile: 'google-workspace', transport: 'http', url: 'https://example.org/mcp' }],
  });
  const mcp = new Mcp(
    () => parsed.policy,
    () => '',
    '/tmp/synthetic-mcp',
    t => ({ action: 'pass', redactedText: t }),
    async () => true,
  );
  assert.deepEqual(mcp.servers(), [{ name: 'workspace', profile: 'google-workspace', transport: 'http' }]);
});

test('vision uses an isolated counted provider call and generated artifacts survive run completion', async () => {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', mode: 'api', model: 'synthetic', ready: true });
  store.put('settings', 'main', { workspace: tmpdir() });
  const session = store.create('c', 'cc');
  let turns = 0,
    vision = 0,
    generations = 0;
  const harness: Harness = {
    root: tmpdir(),
    route: async () => ({ routingContract: { mode: 'GENERAL', authority: { status: 'ALLOW' }, mandatoryReferences: [] } }),
    contextPolicy: () => ({ history: 'ignore', carryover: false }),
    privacy: t => ({ action: 'pass', redactedText: t, findings: [] }),
    skillMetadata: async () => null,
    documentPrivacy: async () => null,
    nextOutput: async () => null,
    toolLoop: () => true,
    visionEnabled: () => true,
    tools: async scope => ({
      enabled: () => true,
      check: async () => {},
      readOnly: () => false,
      outgoing: async t => t,
      execute: async r =>
        r.tool === 'vision_analyze'
          ? { text: await scope.analyze!('Describe synthetic image', { mime: 'image/png', data: 'synthetic-base64' }) }
          : scope.generate!(r.input),
    }),
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (prompt, _c, context) => {
          context.onUsage?.({ input: 3, output: 2, total: 5 });
          if (context.images?.length) {
            vision++;
            assert.equal(context.session, undefined);
            assert.doesNotMatch(context.system || '', /step-tool/);
            return 'Synthetic image observation';
          }
          turns++;
          if (turns === 1) return '```step-tool\n{"tool":"vision_analyze","input":"synthetic.png"}\n```';
          if (turns === 2) {
            assert.match(prompt, /Synthetic image observation/);
            return '```step-tool\n{"tool":"image_generate","input":"Synthetic illustration"}\n```';
          }
          assert.match(prompt, /generated-local/);
          return 'Done';
        },
      },
    }),
    () => {},
    undefined,
    async () => {
      generations++;
      return {
        id: 'synthetic-artifact',
        name: 'synthetic.png',
        provider: 'openai',
        mime: 'image/png',
        model: 'synthetic-image',
        at: new Date().toISOString(),
      };
    },
  );
  try {
    await service.run(session.id, 'Inspect and illustrate synthetic material', '', true, undefined, 'chat');
    const saved = store.session(session.id);
    assert.equal(saved.status, 'review');
    assert.equal(vision, 1);
    assert.equal(generations, 1);
    assert.equal(turns, 3);
    assert.equal(saved.images?.[0].id, 'synthetic-artifact');
    assert.equal(saved.usage?.total, 20);
    assert.deepEqual(
      saved.runs?.at(-1)?.steps[0].tools?.map(t => [t.tool, t.ok]),
      [
        ['vision_analyze', true],
        ['image_generate', true],
      ],
    );
    assert.equal(saved.runs?.at(-1)?.steps[0].providerCalls?.filter(c => c.kind === 'vision').length, 1);
  } finally {
    store.close();
  }
});

test('cancelled tools record a diagnostic outcome without retry or source payload', async () => {
  const controller = new AbortController(),
    records: unknown[] = [];
  const loop = new ToolLoop({
    enabled: () => true,
    check: async () => {},
    readOnly: () => true,
    outgoing: async t => t,
    observe: r => records.push(r),
    execute: async () => {
      controller.abort();
      throw new Error('private cancellation');
    },
  });
  await assert.rejects(loop.run('question', async () => '```step-tool\n{"tool":"files","input":"synthetic"}\n```', controller.signal));
  assert.equal((records[0] as any).code, 'CANCELLED');
  assert.doesNotMatch(JSON.stringify(records), /private/);
});

test('deeply nested hostile HTML is bounded before recursive DOM processing', () => {
  assert.throws(() => extractWeb('<div>'.repeat(200) + 'x' + '</div>'.repeat(200), 'https://example.org'), /TOOL_OUTPUT_LIMIT/);
});

test('declined permission is recorded as denied, not successful tool execution', async () => {
  const records: unknown[] = [];
  let turns = 0;
  await new ToolLoop({
    enabled: () => true,
    check: async () => {},
    readOnly: () => false,
    execute: async () => null,
    outgoing: async t => t,
    observe: r => records.push(r),
  }).run(
    'Synthetic request',
    async prompt => {
      if (!turns++) return '```step-tool\n{"tool":"image_generate","input":"Synthetic picture"}\n```';
      assert.match(prompt, /TOOL_DENIED/);
      return 'Nothing generated';
    },
    new AbortController().signal,
  );
  assert.equal((records[0] as any).ok, false);
  assert.equal((records[0] as any).code, 'TOOL_DENIED');
});
