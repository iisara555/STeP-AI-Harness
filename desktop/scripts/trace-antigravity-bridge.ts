/**
 * Developer trace for the governed step_host bridge on a real, signed-in agy: records the shape of agy's events (tool
 * names, field names, step states, paths relative to the isolated home) so the bridge can be fitted to how agy offers
 * MCP tools. Synthetic data only. Never records text, tokens, account details or file contents outside agy's own MCP
 * schema folder.
 *
 *   npx tsx scripts/trace-antigravity-bridge.ts --agy <path-to-agy> [--model <gemini-model>] [--variant <name>]
 *
 * Variants (default: the three read-* ones, about three model requests):
 *   baseline     stop at the first tool step that is not call_mcp_tool (what the app does today)
 *   schema-read  also let agy read files inside its own MCP schema folder (<home>/.gemini/antigravity-cli/mcp/step_host/)
 *   schema-up    stop like baseline, but give the step_host schema in the system prompt
 *   read-exact   like schema-read, and agy's settings stop denying read_file(*) and allow reading exactly that schema
 *                file (any other read matches no rule, which strict mode soft-denies in a headless run)
 *   read-exact-mcp-any  read-exact, with every MCP tool allowed instead of only mcp(step_host/step_host)
 *   read-folder  like read-exact, with the schema folder allowed as read_file(<folder>/*) and mcp(step_host/*)
 * agy's own error and denial messages are kept (with the isolated home path shortened to <home>): they are the CLI's
 * text, not user data.
 * agy is only ever started through an isolated home (never run agy by hand with the real home: it updates itself).
 */
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { antigravityHome, antigravityModels, checkAntigravity, runAntigravity } from '../electron/antigravity';
import { NATIVE_STEP_HOST_SCHEMA } from '../electron/antigravity-mcp-bridge';
import type { Connection } from '../src/types';

const VARIANTS = ['baseline', 'schema-read', 'schema-up', 'read-exact', 'read-exact-mcp-any', 'read-folder'] as const;
const DEFAULT_VARIANTS: Variant[] = ['read-exact', 'read-exact-mcp-any', 'read-folder'];
/** agy's own messages, kept with the home path shortened. */
const AGY_TEXT_KEYS = new Set(['message', 'action', 'display_name', 'reason']);
type Variant = (typeof VARIANTS)[number];
const SAFE_VALUE_KEYS = new Set([
  'event',
  'step_type',
  'state',
  'status',
  'tool_name',
  'name',
  'server_name',
  'server',
  'tool',
  'type',
  'agent',
  'permission_mode',
  'model',
  'ServerName',
  'ToolName',
]);
const code = (error: unknown) => (error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'TRACE_FAILED');

/** A string that holds a JSON object or array (agy may send tool arguments as JSON text), parsed; else undefined. */
function parsedJson(value: string): unknown {
  if (!/^\s*[[{]/.test(value)) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function shortenHome(value: string, home: string) {
  const forms = [home, home.split('\\').join('/'), home.split('/').join('\\')];
  let out = value;
  for (const form of forms) out = out.split(form).join('<home>');
  const lower = home.toLowerCase();
  let at;
  while ((at = out.toLowerCase().indexOf(lower)) >= 0) out = out.slice(0, at) + '<home>' + out.slice(at + home.length);
  return out;
}

/** Replaces every value with its shape; keeps short identifiers under known keys and paths inside the isolated home. */
export function redact(value: unknown, home: string, key = '', depth = 0): unknown {
  if (depth > 8) return '<deep>';
  if (Array.isArray(value)) return value.slice(0, 40).map(item => redact(item, home, key, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 60)
        .map(([k, v]) => [k, redact(v, home, k, depth + 1)]),
    );
  if (typeof value !== 'string') return value;
  const json = parsedJson(value);
  if (json !== undefined) return { '<json>': redact(json, home, key, depth + 1) };
  if (AGY_TEXT_KEYS.has(key)) return shortenHome(value, home).slice(0, 800);
  const at = value.toLowerCase().indexOf(home.toLowerCase());
  if (at >= 0) {
    const rest = value.slice(at + home.length).replace(/^[\\/]+/, '');
    const inside = rest.split(/[\\/]/).slice(0, 6).join('/');
    return `<home>/${/^\.gemini[\\/]antigravity-cli[\\/]mcp[\\/]/i.test(rest) || /^workspace\b/i.test(rest) ? inside : '…'}`;
  }
  if (SAFE_VALUE_KEYS.has(key) && value.length <= 80 && /^[\w:.\/()\-]*$/.test(value)) return value;
  return `<string ${value.length}>`;
}

/** Every string in a step that names a path, as a path relative to the home (undefined when outside it). */
function pathsIn(value: unknown, home: string, found: (string | undefined)[] = []) {
  if (Array.isArray(value)) value.forEach(item => pathsIn(item, home, found));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => pathsIn(item, home, found));
  else if (typeof value === 'string' && parsedJson(value) !== undefined) pathsIn(parsedJson(value), home, found);
  else if (typeof value === 'string' && /^(file:|([a-z]:)?[\\/])/i.test(value.trim())) {
    let path = value.trim();
    try {
      if (/^file:/i.test(path)) path = fileURLToPath(path);
    } catch {
      return (found.push(undefined), found);
    }
    const inside = relative(home, resolve(path));
    found.push(inside.startsWith('..') || resolve(inside) === inside ? undefined : inside);
  }
  return found;
}

async function schemaFolder(home: string) {
  const folder = join(home, '.gemini', 'antigravity-cli', 'mcp');
  const files: Record<string, unknown> = {};
  const walk = async (dir: string, depth: number): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, entry.name);
      const name = relative(folder, path).split(sep).join('/');
      if (entry.isDirectory() && depth < 3) await walk(path, depth + 1);
      else if (entry.isFile()) {
        const text = await readFile(path, 'utf8').catch(() => '');
        // agy writes these from the step_host server's own tools/list answer; nothing private is in them.
        try {
          files[name] = JSON.parse(text);
        } catch {
          files[name] = `<${text.length} chars, not JSON>`;
        }
      }
    }
  };
  await walk(folder, 0);
  return files;
}

async function traceOnce(executable: string, model: string, variant: Variant, root: string, signal: AbortSignal) {
  const listed = 'STEP-TRACE-' + randomBytes(6).toString('hex').toUpperCase();
  const hostCalls: unknown[] = [];
  const schemaUp =
    variant === 'schema-up'
      ? `\n\nThe step_host MCP tool (server step_host, tool step_host) is available through call_mcp_tool. Its input schema is ${JSON.stringify(NATIVE_STEP_HOST_SCHEMA)}. You already have this schema: do not read any schema file, call call_mcp_tool directly.`
      : '';
  const system =
    'Built-in native tools (direct file access, shell commands, web fetch, browser) are disabled. When the host supplies tools, call the governed MCP bridge tool step_host (mcp(step_host/step_host)). Every tool call is checked by STeP host permissions.' +
    schemaUp;
  const home = await antigravityHome({
    cwd: root,
    env: { ...process.env },
    signal,
    system,
    nativeBridge: async request => {
      hostCalls.push({ tool: request.tool, input: typeof request.input === 'string' ? request.input.slice(0, 40) : typeof request.input });
      return { ok: true, result: { path: '.', entries: [{ name: `${listed}.txt`, path: `${listed}.txt`, directory: false }] } };
    },
  });
  const homeRoot = resolve(home.cwd, '..');
  let permissions: unknown;
  if (variant.startsWith('read-')) {
    const settingsPath = join(homeRoot, '.gemini', 'antigravity-cli', 'settings.json');
    const settings = JSON.parse(await readFile(settingsPath, 'utf8'));
    const folder = join(homeRoot, '.gemini', 'antigravity-cli', 'mcp', 'step_host');
    const reads =
      variant === 'read-folder'
        ? [`read_file(${folder}/*)`, `read_file(${folder}${sep}*)`]
        : [`read_file(${join(folder, 'step_host.json')})`];
    const mcp =
      variant === 'read-exact-mcp-any' ? ['mcp(*)'] : variant === 'read-folder' ? ['mcp(step_host/*)'] : ['mcp(step_host/step_host)'];
    settings.permissions = {
      allow: [...new Set([...mcp, ...reads])],
      ask: [],
      deny: settings.permissions.deny.filter((rule: string) => rule !== 'read_file(*)' && rule !== 'mcp(*)'),
    };
    await writeFile(settingsPath, JSON.stringify(settings), { mode: 0o600 });
    permissions = Object.fromEntries(
      Object.entries(settings.permissions).map(([k, rules]) => [k, (rules as string[]).map(rule => shortenHome(rule, homeRoot))]),
    );
  }
  const events: unknown[] = [];
  let tools: unknown;
  let stoppedOn: unknown;
  let answer = '';
  let schemaFiles: Record<string, unknown> = {};
  let error: string | undefined;
  try {
    await runAntigravity(
      executable,
      [
        '--agent',
        'step-draft',
        '--disable-slash-commands',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--print-timeout',
        '3m',
        '--model',
        model,
      ],
      home,
      {
        signal,
        timeoutMs: 4 * 60_000,
        holdInput: true,
        keepInput: true,
        line: (line, send) => {
          const event = JSON.parse(line);
          if (event.event === 'init') {
            const list = Array.isArray(event.init?.tools) ? event.init.tools : [];
            tools = list.map((tool: any) =>
              typeof tool === 'string' ? tool : /mcp/i.test(String(tool?.name)) ? tool : (tool?.name ?? redact(tool, homeRoot)),
            );
            events.push(redact({ ...event, init: { ...event.init, tools: `<${list.length} tools>` } }, homeRoot));
            void schemaFolder(homeRoot).then(files => (schemaFiles = { ...files, ...schemaFiles }));
            send({
              event: 'user',
              message: {
                content:
                  'Call the MCP tool step_host (server step_host, tool step_host) once with the arguments {"tool":"files","input":"."}. Use the MCP tool call itself: do not write a step-tool block or any JSON in your reply. Then reply with exactly the file names it returned, nothing else.',
              },
            });
            return;
          }
          if (event.event === 'result') {
            answer = typeof event.result?.response === 'string' ? event.result.response : '';
            events.push(redact(event, homeRoot));
            throw new Error('TRACE_DONE');
          }
          events.push(redact(event, homeRoot));
          const step = event.step_update;
          if (!step || !(step.step_type === 'tool' || step.tool_name !== undefined || step.tool_call !== undefined)) return;
          const name = String(step.tool_name ?? step.tool_call?.name ?? '');
          if (name === 'call_mcp_tool' || /step_host/.test(name)) return;
          const paths = pathsIn(step, homeRoot);
          const schemaRead =
            (variant === 'schema-read' || variant.startsWith('read-')) &&
            /view_file|read_file/i.test(name) &&
            paths.length > 0 &&
            paths.every(path => path !== undefined && /^\.gemini[\\/]antigravity-cli[\\/]mcp[\\/]step_host([\\/]|$)/i.test(path));
          if (schemaRead) return;
          stoppedOn = { name, paths: paths.map(path => (path === undefined ? '<outside home>' : path.split(sep).join('/'))) };
          throw new Error('TRACE_STOPPED');
        },
      },
    );
  } catch (failure) {
    error = code(failure);
  } finally {
    schemaFiles = { ...(await schemaFolder(homeRoot)), ...schemaFiles };
    await home.close();
  }
  return {
    variant,
    permissions,
    outcome: error === 'TRACE_DONE' ? 'result' : error,
    stoppedOn,
    hostCalls,
    markerInAnswer: answer.includes(listed),
    textProtocolInstead: answer.includes('```step-tool'),
    mcpToolsInInit: Array.isArray(tools) ? tools.filter(tool => /mcp|step_host/i.test(JSON.stringify(tool))) : tools,
    toolNamesInInit: Array.isArray(tools) ? tools.map(tool => (typeof tool === 'string' ? tool : (tool as any)?.name)) : undefined,
    schemaFiles,
    events: events.slice(0, 80),
  };
}

export async function runBridgeTrace(options: { executable: string; model?: string; variants: Variant[]; signal: AbortSignal }) {
  const root = await mkdtemp(join(tmpdir(), 'step-agy-bridge-trace-'));
  try {
    const versionHome = await antigravityHome({ cwd: root, env: { ...process.env } });
    let version: string;
    try {
      await checkAntigravity(options.executable, versionHome, options.signal);
      version = (await runAntigravity(options.executable, ['--version'], versionHome, { timeoutMs: 10_000, signal: options.signal }))
        .output;
    } finally {
      await versionHome.close();
    }
    const model =
      options.model ||
      (await antigravityModels({ executable: options.executable } as Connection, { cwd: root, env: { ...process.env } }))[0]?.id;
    if (!model) throw new Error('MODEL_NOT_AVAILABLE');
    const runs = [];
    for (const variant of options.variants) runs.push(await traceOnce(options.executable, model, variant, root, options.signal));
    return { version: version.trim().slice(0, 40), model, runs };
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const executable = value('--agy');
  const variant = value('--variant');
  if (!executable || (variant && !VARIANTS.includes(variant as Variant))) {
    console.error(`ใช้: npx tsx scripts/trace-antigravity-bridge.ts --agy <path-to-agy> [--model <id>] [--variant ${VARIANTS.join('|')}]`);
    process.exitCode = 1;
  } else {
    console.error('กำลังบันทึกรูปแบบเหตุการณ์ของ agy (ข้อมูลสังเคราะห์ อาจใช้โควตาของบัญชีไม่เกิน 3 คำขอ)');
    const cancel = new AbortController();
    process.once('SIGINT', () => cancel.abort());
    try {
      const report = await runBridgeTrace({
        executable,
        model: value('--model'),
        variants: variant ? [variant as Variant] : DEFAULT_VARIANTS,
        signal: cancel.signal,
      });
      console.log(JSON.stringify(report, null, 2));
    } catch (error) {
      console.error(code(error));
      process.exitCode = 1;
    }
  }
}
