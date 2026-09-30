import { spawn, execFile } from 'node:child_process';
import type { HookDefinition, HookEvent, Policy } from './policy';
import { globToRegExp } from './permissions';

/**
 * Organization hooks from the managed policy. A hook receives the event as JSON and may block it:
 *   command: stdin JSON; exit code 2 blocks (stderr is the reason), as in Claude Code and OpenHarness;
 *            stdout JSON {"decision":"block","reason":"…"} also blocks.
 *   http:    POST JSON; a JSON reply {"decision":"block","reason":"…"} blocks.
 * A hook that fails (timeout, crash, bad reply) blocks only when `blockOnFailure` is set.
 * Payloads carry metadata only; hooks never receive request text, commands, paths or credentials.
 */
export type HookPayload = { event: HookEvent; sessionId?: string; tool?: string; [key: string]: unknown };
export type HookOutcome = { blocked: boolean; reason: string; results: { hook: string; ok: boolean; blocked: boolean; ms: number }[] };

// Diagnostics identify definitions by event/type/index, never commands, endpoints or replies.
const describe = (hook: HookDefinition, index: number) => `${hook.event}:${hook.type}:${index}`;
const blockReply = (value: unknown) => {
  if (!value || typeof value !== 'object') return undefined;
  const reply = value as { decision?: unknown; reason?: unknown };
  return reply.decision === 'block' ? String(reply.reason || 'blocked by organization hook').slice(0, 500) : undefined;
};

function runCommand(hook: Extract<HookDefinition, { type: 'command' }>, payload: HookPayload) {
  return new Promise<{ ok: boolean; block?: string }>(resolveRun => {
    let out = '',
      err = '',
      settled = false,
      exceeded = false;
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !/token|secret|password|api.?key|authorization/i.test(key)),
    );
    const child = spawn(hook.command, {
      shell: true,
      env,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const done = (result: { ok: boolean; block?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun(result);
    };
    const timer = setTimeout(() => {
      if (child.pid && process.platform === 'win32')
        execFile('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {});
      else if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill();
        }
      }
      done({ ok: false });
    }, hook.timeoutSeconds * 1000);
    child.stdout.on('data', chunk => {
      exceeded ||= out.length + chunk.length > 20000;
      out = (out + chunk).slice(0, 20000);
    });
    child.stderr.on('data', chunk => (err = (err + chunk).slice(-2000)));
    child.on('error', () => done({ ok: false }));
    child.on('close', code => {
      if (exceeded) return done({ ok: false });
      if (code === 2) return done({ ok: true, block: err.trim().slice(0, 500) || 'blocked by organization hook' });
      if (code !== 0) return done({ ok: false });
      let parsed: unknown;
      try {
        parsed = out.trim() ? JSON.parse(out) : undefined;
      } catch {
        return done({ ok: false });
      }
      if (parsed !== undefined && !validReply(parsed)) return done({ ok: false });
      done({ ok: true, block: blockReply(parsed) });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(payload));
  });
}

async function runHttp(hook: Extract<HookDefinition, { type: 'http' }>, payload: HookPayload) {
  try {
    const response = await fetch(hook.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...hook.headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(hook.timeoutSeconds * 1000),
      redirect: 'error',
    });
    if (!response.ok) return { ok: false };
    const reader = response.body?.getReader();
    let body = '',
      bytes = 0;
    if (reader) {
      const decoder = new TextDecoder();
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.length;
        if (bytes > 20_000) {
          await reader.cancel();
          return { ok: false };
        }
        body += decoder.decode(next.value, { stream: true });
      }
      body += decoder.decode();
    }
    let parsed: unknown;
    try {
      parsed = body.trim() ? JSON.parse(body) : undefined;
    } catch {
      return { ok: false };
    }
    if (parsed !== undefined && !validReply(parsed)) return { ok: false };
    return { ok: true, block: blockReply(parsed) };
  } catch {
    return { ok: false };
  }
}

const validReply = (value: any) => value && typeof value === 'object' && ['allow', 'block'].includes(value.decision);
export type PromptHookRunner = (prompt: string, payload: HookPayload, signal: AbortSignal) => Promise<string>;
// Events expose metadata only. Raw prompts, commands, paths and hook responses never leave this boundary.
export function hookMetadata(payload: HookPayload): HookPayload {
  const clean: HookPayload = { event: payload.event };
  for (const key of ['sessionId', 'tool', 'targetHash', 'mode', 'outcome', 'route', 'code'])
    if (typeof payload[key] === 'string' && /^[a-zA-Z0-9_:-]{0,100}$/.test(payload[key] as string)) clean[key] = payload[key];
  for (const key of ['files', 'promptChars', 'beforeTokens', 'afterTokens'])
    if (typeof payload[key] === 'number' && Number.isFinite(payload[key])) clean[key] = payload[key];
  for (const key of ['readOnly', 'ok']) if (typeof payload[key] === 'boolean') clean[key] = payload[key];
  return clean;
}

async function runPrompt(hook: Extract<HookDefinition, { type: 'prompt' }>, payload: HookPayload, run?: PromptHookRunner) {
  if (!run) return { ok: false };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('HOOK_TIMEOUT'));
      }, hook.timeoutSeconds * 1000);
    });
    const text = await Promise.race([run(hook.prompt, payload, controller.signal), timeout]);
    if (text.length > 20_000) return { ok: false };
    const reply = JSON.parse(text);
    return validReply(reply) ? { ok: true, block: blockReply(reply) } : { ok: false };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

export class HookEngine {
  constructor(
    private policy: () => Policy,
    private prompt?: PromptHookRunner,
  ) {}
  /** Hooks for this event whose matcher (a glob on the tool name) fits, highest priority first. */
  hooksFor(event: HookEvent, tool?: string) {
    return this.policy()
      .hooks.map((hook, order) => ({ hook, order }))
      .filter(({ hook }) => hook.event === event && (!hook.matcher || (tool !== undefined && globToRegExp(hook.matcher).test(tool))))
      .sort((a, b) => b.hook.priority - a.hook.priority || a.order - b.order)
      .map(({ hook }) => hook);
  }
  async run(payload: HookPayload): Promise<HookOutcome> {
    payload = hookMetadata(payload);
    const results: HookOutcome['results'] = [];
    for (const [index, hook] of this.hooksFor(payload.event, payload.tool).entries()) {
      const started = Date.now();
      const result =
        hook.type === 'command'
          ? await runCommand(hook, payload)
          : hook.type === 'http'
            ? await runHttp(hook, payload)
            : await runPrompt(hook, payload, this.prompt);
      const blocked = Boolean(result.block) || (!result.ok && hook.blockOnFailure);
      results.push({ hook: describe(hook, index), ok: result.ok, blocked, ms: Date.now() - started });
      if (blocked) return { blocked: true, reason: 'HOOK_BLOCKED', results };
    }
    return { blocked: false, reason: '', results };
  }
}
