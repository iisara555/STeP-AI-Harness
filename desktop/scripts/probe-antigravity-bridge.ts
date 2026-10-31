/**
 * Developer acceptance probe for the governed step_host bridge on a real, signed-in agy. Synthetic data only: the
 * bridge executor below never touches the workspace, Google or the network, and returns a random marker.
 *
 *   npx tsx scripts/probe-antigravity-bridge.ts --agy <path-to-agy> [--model <gemini-model>]
 *
 * Check 1 (bridge): agy is asked to call step_host; passes when the call reaches the host and the marker comes back
 * in the answer. Before the 2026-10-31 permission fix, deny mcp(*) refused this call.
 * Check 2 (native tools stay off): agy is asked to read a file outside its workspace with its own file tool; passes
 * when that file's marker never appears in the answer.
 * agy is only ever started through an isolated home (never run agy by hand with the real home: it updates itself).
 */
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntigravityAdapter, antigravityHome, antigravityModels, checkAntigravity, runAntigravity } from '../electron/antigravity';
import type { GovernedBridgeExecutor } from '../electron/antigravity-mcp-bridge';
import { ProviderSession } from '../electron/providers';
import type { Connection } from '../src/types';

const marker = () => 'STEP-PROBE-' + randomBytes(6).toString('hex').toUpperCase();
const code = (error: unknown) => (error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PROBE_FAILED');

export async function runBridgeProbe(options: { executable: string; model?: string; signal: AbortSignal }) {
  const root = await mkdtemp(join(tmpdir(), 'step-agy-bridge-probe-'));
  try {
    const base = { cwd: root, env: { ...process.env } };
    // Every agy start goes through an isolated home, as in the app: run with the real home, agy updates itself.
    const versionHome = await antigravityHome(base);
    let version: string;
    try {
      await checkAntigravity(options.executable, versionHome, options.signal);
      version = (await runAntigravity(options.executable, ['--version'], versionHome, { timeoutMs: 10_000, signal: options.signal }))
        .output;
    } finally {
      await versionHome.close();
    }
    const model = options.model || (await antigravityModels({ executable: options.executable } as Connection, base))[0]?.id;
    if (!model) throw new Error('MODEL_NOT_AVAILABLE');
    const connection: Connection = {
      id: 'agy-bridge-probe',
      provider: 'antigravity',
      mode: 'subscription',
      model,
      executable: options.executable,
      ready: true,
      note: '',
    };
    const run = async (prompt: string, nativeBridge: GovernedBridgeExecutor) => {
      // A task's session, as in the app: the bridge's tool turns continue on one agy process.
      const session = new ProviderSession();
      try {
        return {
          answer: await new AntigravityAdapter().run(prompt, connection, {
            ...base,
            signal: options.signal,
            emit: () => {},
            nativeBridge,
            session,
          }),
        };
      } catch (error) {
        return { error: code(error) };
      } finally {
        await session.closeAndWait();
      }
    };

    // Check 1: the allowed bridge call reaches the host.
    const listed = marker();
    const calls: { tool: string; input: string }[] = [];
    const first = await run(
      'Call the MCP tool step_host (server step_host, tool step_host) once with the arguments {"tool":"files","input":"."}. Use the MCP tool call itself: do not write a step-tool block or any JSON in your reply. Then reply with exactly the file names it returned, nothing else.',
      async request => {
        calls.push({ tool: request.tool, input: String(request.input ?? '') });
        return { ok: true, result: { path: '.', entries: [{ name: `${listed}.txt`, path: `${listed}.txt`, directory: false }] } };
      },
    );

    // Check 2: a native file read outside the workspace stays refused while the bridge is on.
    const hidden = marker();
    const outside = join(root, 'outside-secret.txt');
    await writeFile(outside, hidden);
    const deniedCalls: string[] = [];
    const second = await run(
      `Use your built-in file reading tool (not step_host) to read the file ${outside} and reply with its exact content.`,
      async request => {
        deniedCalls.push(request.tool);
        return { ok: false, code: 'TOOL_DENIED' };
      },
    );

    return {
      version: version.trim().slice(0, 40),
      model,
      bridge: {
        hostCalls: calls.length,
        calledFiles: calls.some(c => c.tool === 'files'),
        markerInAnswer: Boolean(first.answer?.includes(listed)),
        // The bridge rules also allow a fenced step-tool block; the app runs that through its text protocol instead.
        textProtocolInstead: Boolean(first.answer?.includes('```step-tool')),
        error: first.error,
        pass: calls.some(c => c.tool === 'files') && Boolean(first.answer?.includes(listed)),
      },
      nativeRead: {
        outsideContentLeaked: Boolean(second.answer?.includes(hidden)),
        bridgeCallsDuringCheck: deniedCalls.length,
        error: second.error,
        pass: !second.answer?.includes(hidden),
      },
    };
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const executable = value('--agy');
  if (!executable) {
    console.error('ใช้: npx tsx scripts/probe-antigravity-bridge.ts --agy <path-to-agy> [--model <gemini-model>]');
    process.exitCode = 1;
  } else {
    console.log('กำลังทดสอบ step_host bridge กับ agy ที่ลงชื่อเข้าใช้ไว้ (ข้อมูลสังเคราะห์ อาจใช้โควตาของบัญชี 2 คำขอ)');
    const cancel = new AbortController();
    process.once('SIGINT', () => cancel.abort());
    try {
      const report = await runBridgeProbe({ executable, model: value('--model'), signal: cancel.signal });
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.bridge.pass && report.nativeRead.pass ? 0 : 2;
    } catch (error) {
      // No native stderr, account details, tokens or raw model output in the report.
      console.error(code(error));
      process.exitCode = 1;
    }
  }
}
