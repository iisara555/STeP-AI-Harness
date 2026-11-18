/**
 * Developer probe: why a newer agy (1.4+) refuses STeP's isolated agent, and whether a variant of the agent file makes
 * it load with the native tools still off. Synthetic prompts only; nothing from the workspace is sent.
 *
 *   npx tsx scripts/probe-antigravity-version.ts --agy <path-to-any-agy> [--model <gemini-model>]
 *
 * For each variant of the `step-draft` agent it reports: whether `agy agents` lists it, whether a one-line text turn
 * with `--agent step-draft` answers, and (for a variant that answers) whether agy's own file tool can read a file
 * outside its workspace (it must not). The adapter's version check is not used, so a refused version can be probed.
 *
 * Then a mode matrix: the agent as the app writes it for a plain chat and for a chat with the step_host bridge, each
 * started as `-p` print and as the app's stream-json (one NDJSON user message on stdin). On 2026-11-18, 1.5.10 answered
 * the plain agent in print mode but refused it ("unknown agent") through the app's stream-json bridge path.
 * agy is only ever started through an isolated home with a fresh update stamp, as in the app: started with the real
 * home, agy updates itself.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { antigravityHome } from '../electron/antigravity';

type Home = Awaited<ReturnType<typeof antigravityHome>>;
type Variant = { name: string; apply: (home: string, agent: string) => Promise<void> };
type Mode = 'print' | 'stream-json';

const marker = () => 'STEP-PROBE-' + randomBytes(6).toString('hex').toUpperCase();
const frontmatter = (text: string) => /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] || '';
const body = (text: string) => text.replace(/^---\n[\s\S]*?\n---\n/, '');
const withHeader = (text: string, keep: (line: string) => boolean) =>
  `---\n${frontmatter(text).split('\n').filter(keep).join('\n')}\n---\n${body(text)}`;

/** Variants, from "as the app writes it" to the documented minimum (name, description, tools, excludeDefaultComponents). */
export const VARIANTS: Variant[] = [
  { name: 'as-app', apply: async () => {} },
  {
    name: 'no-empty-lists',
    // `skills: []`, `plugins: []` and `mcpServers: []` are not documented agent keys; a stricter loader may skip the file.
    apply: async (_home, agent) => {
      const text = await readFile(agent, 'utf8');
      await writeFile(
        agent,
        withHeader(text, line => !/^(skills|plugins|mcpServers): \[\]$/.test(line)),
      );
    },
  },
  {
    name: 'documented-keys-only',
    apply: async (_home, agent) => {
      const text = await readFile(agent, 'utf8');
      const keys = ['name', 'description', 'tools', 'excludeDefaultComponents', 'mainAgent', 'subagent', 'commandExecutionPolicy'];
      await writeFile(
        agent,
        withHeader(text, line => keys.some(key => line.startsWith(key + ':'))),
      );
    },
  },
  {
    name: 'flat-file',
    // `agents/step-draft.md` instead of `agents/step-draft/agent.md`.
    apply: async (_home, agent) => {
      const text = await readFile(agent, 'utf8');
      await rm(join(agent, '..'), { recursive: true, force: true });
      await writeFile(join(agent, '..', '..', 'step-draft.md'), text);
    },
  },
  {
    name: 'workspace-agent',
    // Also in the workspace (`.agents/agents/`), in case the global folder is no longer read in print mode.
    apply: async (home, agent) => {
      const text = await readFile(agent, 'utf8');
      await mkdir(join(home, 'workspace', '.agents', 'agents'), { recursive: true });
      await writeFile(join(home, 'workspace', '.agents', 'agents', 'step-draft.md'), text);
    },
  },
];

/**
 * One agy process in the isolated home. Unlike the app's runner this keeps the last lines of stderr: the probe is
 * about agy's own refusal text (synthetic prompts only, so nothing private can be in it).
 */
function agy(executable: string, args: string[], home: Home, timeoutMs: number, signal: AbortSignal, input?: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(done => {
    const script = /\.[cm]?js$/i.test(executable);
    const child = spawn(script ? process.execPath : executable, script ? [executable, ...args] : args, {
      cwd: home.cwd,
      env: home.env,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '',
      stderr = '';
    // As the app does: the NDJSON user message goes in only after agy's init event, then stdin closes.
    let sent = false;
    child.stdout.on('data', chunk => {
      stdout = (stdout + chunk).slice(-20_000);
      if (input !== undefined && !sent && /"event"\s*:\s*"init"/.test(stdout)) {
        sent = true;
        child.stdin!.end(input);
      }
    });
    child.stderr.on('data', chunk => (stderr = (stderr + chunk).slice(-4_000)));
    const stop = () => child.kill();
    const timer = setTimeout(stop, timeoutMs);
    signal.addEventListener('abort', stop, { once: true });
    child.once('error', error => (stderr += error.message));
    child.once('close', code => {
      clearTimeout(timer);
      done({ code, stdout, stderr: stderr.trim().split(/\r?\n/).slice(-6).join('\n') });
    });
  });
}

export async function runVersionProbe(options: { executable: string; model?: string; signal: AbortSignal }) {
  const root = await mkdtemp(join(tmpdir(), 'step-agy-version-probe-'));
  const base = { cwd: root, env: { ...process.env } };
  const run = (home: Home, args: string[], timeoutMs = 150_000, input?: string) =>
    agy(options.executable, args, home, timeoutMs, options.signal, input);
  const fresh = async (variant: Variant) => {
    const home = await antigravityHome(base);
    await variant.apply(home.env.HOME!, join(home.env.HOME!, '.gemini', 'config', 'agents', 'step-draft', 'agent.md'));
    return home;
  };
  const results: Record<string, unknown>[] = [];
  let version = '';
  try {
    const first = await antigravityHome(base);
    try {
      const answer = await run(first, ['--version'], 10_000);
      version = answer.stdout.trim() || `exit ${answer.code}: ${answer.stderr}`;
    } finally {
      await first.close();
    }
    const model = options.model ? ['--model', options.model] : [];
    for (const variant of VARIANTS) {
      const home = await fresh(variant);
      try {
        const listed = await run(home, ['agents'], 30_000);
        const ok = marker();
        const turn = await run(home, [
          '-p',
          `Reply with exactly ${ok} and nothing else.`,
          '--agent',
          'step-draft',
          '--print-timeout',
          '2m',
          ...model,
        ]);
        const answered = turn.stdout.includes(ok);
        let nativeRead: string | undefined;
        if (answered) {
          // Native tools must stay off: agy's own file tool must not read a file outside its workspace.
          const hidden = marker();
          const outside = join(root, `outside-${variant.name}.txt`);
          await writeFile(outside, hidden);
          const read = await run(home, [
            '-p',
            `Use your built-in file reading tool to read the file ${outside} and reply with its exact content.`,
            '--agent',
            'step-draft',
            '--print-timeout',
            '2m',
            ...model,
          ]);
          nativeRead = read.stdout.includes(hidden) ? 'READ (unsafe)' : 'refused';
        }
        results.push({
          variant: variant.name,
          listed: /step-draft/.test(listed.stdout),
          answered,
          ...(answered ? {} : { exit: turn.code, stderr: turn.stderr }),
          ...(nativeRead ? { nativeRead } : {}),
        });
      } finally {
        await home.close();
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return { version, results, modes: await runModeMatrix(options) };
}

/** Tool names from init (names only, never descriptions or schemas). */
const toolNames = (list: unknown[] | undefined) =>
  list?.map(tool => (typeof tool === 'string' ? tool : String((tool as { name?: unknown })?.name ?? '?'))).slice(0, 80);

type BridgeEdit = { name: string; edit?: (header: string, config: { step_host: unknown }) => string };

/**
 * Edits of the bridge agent's header. agy 1.5 documents `mcpServers` as `object[]`
 * (https://antigravity.google/docs/subagents.md); STeP writes a list of names (`[step_host]`), which 1.3.2 accepts.
 * Run 3 (2026-11-18, 1.5.10) with the edits below: with `mcpServers: [step_host]` the agent is unknown; without that
 * line, or with server objects, it loads but `mcp:step_host:step_host` is "not found in registry". The init event's
 * tool names show what 1.5 registered.
 */
const objects = (header: string, config: { step_host: unknown }) =>
  header.replace(/^mcpServers: .*$/m, `mcpServers: ${JSON.stringify([{ name: 'step_host', ...(config.step_host as object) }])}`);
const tools = (list: string) => (header: string) => header.replace(/^tools: .*$/m, `tools: [${list}]`);

export const BRIDGE_EDITS: BridgeEdit[] = [
  { name: 'bridge' },
  { name: 'objects+finish', edit: (header, config) => tools('finish')(objects(header, config)) },
  { name: 'objects+call_mcp_tool', edit: (header, config) => tools('finish, call_mcp_tool')(objects(header, config)) },
  {
    name: 'objects+mcp__step_host__step_host',
    edit: (header, config) => tools('finish, mcp__step_host__step_host')(objects(header, config)),
  },
  { name: 'objects+step_host', edit: (header, config) => tools('finish, step_host')(objects(header, config)) },
  { name: 'no-mcpServers+finish', edit: header => tools('finish')(header.replace(/^mcpServers: .*\n/m, '')) },
];

/**
 * The one-line turn as print and as the app's stream-json with the plain agent, then the bridge agent (as the app
 * writes it, and edited) as stream-json, asked to call step_host once. The bridge executor only counts calls.
 */
async function runModeMatrix(options: { executable: string; model?: string; signal: AbortSignal }) {
  const root = await mkdtemp(join(tmpdir(), 'step-agy-version-modes-'));
  const base = { cwd: root, env: { ...process.env } };
  const model = options.model ? ['--model', options.model] : [];
  const rows: Record<string, unknown>[] = [];
  const cases: { agent: string; mode: Mode; bridge?: BridgeEdit }[] = [
    { agent: 'plain', mode: 'print' },
    { agent: 'plain', mode: 'stream-json' },
    ...BRIDGE_EDITS.map(bridge => ({ agent: bridge.name, mode: 'stream-json' as Mode, bridge })),
  ];
  try {
    for (const { agent, mode, bridge } of cases) {
      let hostCalls = 0;
      const home = await antigravityHome({
        ...base,
        signal: options.signal,
        ...(bridge
          ? {
              nativeBridge: async () => {
                hostCalls++;
                return { ok: false, code: 'PROBE_ONLY' };
              },
            }
          : {}),
      });
      try {
        if (bridge?.edit) {
          const file = join(home.env.HOME!, '.gemini', 'config', 'agents', 'step-draft', 'agent.md');
          const config = JSON.parse(await readFile(join(home.env.HOME!, '.gemini', 'config', 'mcp_config.json'), 'utf8')).mcpServers;
          const text = await readFile(file, 'utf8');
          await writeFile(file, `---\n${bridge.edit(frontmatter(text) + '\n', config).replace(/\n$/, '')}\n---\n${body(text)}`);
        }
        const listed = await agy(options.executable, ['agents'], home, 30_000, options.signal);
        const ok = marker();
        const prompt = bridge
          ? `Call the MCP tool step_host (server step_host, tool step_host) once with the arguments {"tool":"files","input":"."}. Whatever it returns, then reply with exactly ${ok} and nothing else.`
          : `Reply with exactly ${ok} and nothing else.`;
        const turn =
          mode === 'print'
            ? await agy(
                options.executable,
                ['-p', prompt, '--agent', 'step-draft', '--print-timeout', '2m', ...model],
                home,
                150_000,
                options.signal,
              )
            : await agy(
                options.executable,
                [
                  '--agent',
                  'step-draft',
                  '--disable-slash-commands',
                  '--input-format',
                  'stream-json',
                  '--output-format',
                  'stream-json',
                  '--print-timeout',
                  '2m',
                  ...model,
                ],
                home,
                150_000,
                options.signal,
                JSON.stringify({ event: 'user', message: { content: prompt } }) + '\n',
              );
        const init = turn.stdout
          .split(/\r?\n/)
          .map(line => {
            try {
              return JSON.parse(line) as { event?: string; init?: { agent?: string; permission_mode?: string; tools?: unknown[] } };
            } catch {
              return undefined;
            }
          })
          .find(event => event?.event === 'init');
        rows.push({
          agent,
          mode,
          listed: /step-draft/.test(listed.stdout),
          answered: turn.stdout.includes(ok),
          ...(mode === 'stream-json'
            ? {
                init: Boolean(init),
                initAgent: init?.init?.agent,
                permission: init?.init?.permission_mode,
                initTools: toolNames(init?.init?.tools),
              }
            : {}),
          ...(bridge ? { hostCalls } : {}),
          ...(turn.stdout.includes(ok) ? {} : { exit: turn.code, stderr: turn.stderr }),
        });
      } finally {
        await home.close();
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return rows;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name: string) => {
    const index = process.argv.indexOf(name);
    return index > 0 ? process.argv[index + 1] : undefined;
  };
  const executable = arg('--agy');
  if (!executable) {
    console.error('usage: npx tsx scripts/probe-antigravity-version.ts --agy <path-to-agy> [--model <gemini-model>]');
    process.exit(2);
  }
  const controller = new AbortController();
  process.on('SIGINT', () => controller.abort());
  console.log(JSON.stringify(await runVersionProbe({ executable, model: arg('--model'), signal: controller.signal }), null, 2));
}
