import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultPolicy } from '../electron/policy';
import { HookEngine } from '../electron/hooks';

const { installPack, enablePack, enabledPackHooks }: any = await import('../../src/modules/packs/index.js');
const { createHookReceiverServer }: any = await import(new URL('../../scripts/packs/hook-receiver-example.mjs', import.meta.url).href);

test('enabledPackHooks integrates with Desktop HookEngine for priority sorting, matcher filtering, and metadata-only payloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-pack-hook-int-'));
  const work = join(root, 'work');
  const src = join(root, 'src');
  const orderFile = join(root, 'hook-order.jsonl');
  const hookScript = join(root, 'hook.mjs');
  await mkdir(work);
  await mkdir(src);

  await writeFile(
    hookScript,
    [
      `import { appendFileSync, readFileSync } from 'node:fs';`,
      `const label = process.argv[2];`,
      `const payload = JSON.parse(readFileSync(0, 'utf8'));`,
      `appendFileSync(${JSON.stringify(orderFile)}, JSON.stringify({ label, payload }) + '\\n');`,
      `if (payload.tool === 'write_blocked') { console.log(JSON.stringify({ decision: 'block', reason: 'denied by pack hook' })); }`,
      `else { console.log(JSON.stringify({ decision: 'allow' })); }`,
    ].join('\n'),
  );

  const skillText = [
    '---',
    'name: int-skill',
    'description: ทดสอบการทำงานร่วมกันระหว่าง Skill Pack hooks กับ HookEngine ของ Desktop',
    'standardVersion: 2',
    '---',
    '## Purpose\nทดสอบ\n## เมื่อควรใช้\nทดสอบ\n## Inputs\nข้อความ\n## Source\nไม่มี\n## Workflow\n1. ตรวจ\n## Output\nผลตรวจ\n## Authority\nผู้ใช้ต้องยืนยัน\n## Handoff\nส่งผู้ใช้\n## Guardrails\nห้ามอนุมัติแทน',
  ].join('\n');
  await writeFile(join(src, 'SKILL.md'), skillText);
  await writeFile(
    join(src, 'pack.json'),
    JSON.stringify({
      schema_version: 1,
      name: 'int-pack',
      version: '1.0.0',
      skills: [{ id: 'int-skill', path: 'SKILL.md' }],
      agents: [],
      hooks: [
        // Omitted priority -> normalized to 0
        {
          event: 'pre_tool_use',
          type: 'command',
          command: `"${process.execPath}" "${hookScript}" low`,
          matcher: 'write*',
          timeoutSeconds: 10,
          blockOnFailure: true,
        },
        // Explicit higher priority 10 -> runs before priority 0
        {
          event: 'pre_tool_use',
          type: 'command',
          command: `"${process.execPath}" "${hookScript}" high`,
          matcher: 'write*',
          timeoutSeconds: 10,
          blockOnFailure: true,
          priority: 10,
        },
      ],
    }),
  );

  try {
    const installed = installPack(work, src);
    const policy = defaultPolicy();
    policy.features.skillPacks = true;
    policy.skillPacks = { approvedDigests: [installed.digest] };
    enablePack(work, installed.id, policy, { approve: true, hooks: true });

    const engine = new HookEngine(() => ({
      ...policy,
      hooks: [...policy.hooks, ...enabledPackHooks(work, policy)],
    }));

    // Non-matching tool ('read') should not fire write* matcher hooks
    const readOutcome = await engine.run({
      event: 'pre_tool_use',
      sessionId: 'sess-1',
      tool: 'read',
      path: '/secret/raw-path.txt',
      prompt: 'raw user prompt must not leak',
    } as any);
    assert.equal(readOutcome.blocked, false);
    assert.equal(readOutcome.results.length, 0);

    // Matching tool ('write') runs high before low, and strips non-metadata fields
    const writeOutcome = await engine.run({
      event: 'pre_tool_use',
      sessionId: 'sess-1',
      tool: 'write',
      targetHash: 'abc123',
      mode: 'ask',
      path: '/secret/raw-path.txt',
      prompt: 'raw user prompt must not leak',
    } as any);
    assert.equal(writeOutcome.blocked, false);
    assert.equal(writeOutcome.results.length, 2);

    const logLines = (await readFile(orderFile, 'utf8'))
      .trim()
      .split(/\r?\n/)
      .map(l => JSON.parse(l));
    assert.deepEqual(
      logLines.map(entry => entry.label),
      ['high', 'low'],
    );
    const loggedText = JSON.stringify(logLines);
    assert.doesNotMatch(loggedText, /raw-path\.txt|raw user prompt/);
    assert.equal(logLines[0].payload.targetHash, 'abc123');

    // Blocking decision stops on first blocking hook ('high')
    const blockOutcome = await engine.run({
      event: 'pre_tool_use',
      sessionId: 'sess-1',
      tool: 'write_blocked',
    });
    assert.equal(blockOutcome.blocked, true);
    assert.equal(blockOutcome.results.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('HookEngine drives loopback hook-receiver-example over HTTP with matcher and metadata-only payloads', async () => {
  const audits: any[] = [];
  const server = createHookReceiverServer({ blockTools: ['write_denied'], onAudit: (e: any) => audits.push(e) });
  await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const { port } = server.address() as { port: number };

  try {
    const policy = defaultPolicy();
    policy.hooks = [
      {
        event: 'pre_tool_use',
        type: 'http',
        url: `http://127.0.0.1:${port}/v1/tool-audit`,
        headers: {},
        matcher: 'write*',
        timeoutSeconds: 10,
        blockOnFailure: true,
        priority: 10,
      },
    ];
    const engine = new HookEngine(() => policy);

    assert.equal((await engine.run({ event: 'pre_tool_use', tool: 'read' })).blocked, false);
    assert.equal(audits.length, 0);

    assert.equal((await engine.run({ event: 'pre_tool_use', tool: 'write' })).blocked, false);
    assert.equal((await engine.run({ event: 'pre_tool_use', tool: 'write_denied' })).blocked, true);
    assert.equal(audits.length, 2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  }
});
