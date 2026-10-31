import { Worker } from 'node:worker_threads';
import ts from 'typescript';

export type ReplResult = {
  sessionId: string;
  output: string;
  result?: string;
  error?: string;
  executionMs: number;
};

const LIMIT = 50_000;

/**
 * Rewrites top-level `let`/`const` declarations to `var` and top-level class declarations to `var Name = class Name`,
 * so they become properties of the context global and stay available on the next turn. Only statements directly in
 * the script body change: declarations inside blocks, functions or loops, and the text of strings, template literals
 * and comments, are left exactly as written, because the edit positions come from the TypeScript parser.
 */
export function persistentScript(code: string): string {
  const file = ts.createSourceFile('repl.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits: { start: number; end: number; text: string }[] = [];
  for (const statement of file.statements) {
    if (ts.isVariableStatement(statement)) {
      const scoped = statement.declarationList.flags & ts.NodeFlags.BlockScoped;
      if (scoped !== ts.NodeFlags.Let && scoped !== ts.NodeFlags.Const) continue;
      const start = statement.declarationList.getStart(file);
      edits.push({ start, end: start + (scoped === ts.NodeFlags.Const ? 5 : 3), text: 'var' });
    } else if (ts.isClassDeclaration(statement) && statement.name && !statement.modifiers?.length) {
      const start = statement.getStart(file);
      edits.push({ start, end: start, text: `var ${statement.name.text} = ` }, { start: statement.end, end: statement.end, text: ';' });
    }
  }
  let output = code;
  for (const edit of edits.reverse()) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  return output;
}

export const REPL_WORKER = 'repl-worker.cjs';

/**
 * A per-task JavaScript session for calculations, run by `repl-worker.cjs` in its own thread with a memory limit. It is
 * not a security boundary (Node's vm module is not one), which is why repl_eval asks the employee before each run like a
 * command. What it keeps out: the context holds no host object, function or module; WebAssembly is off; the script, its
 * promise callbacks and all formatting of its result run under one time limit; and a thread that stops answering, runs
 * out of memory or crashes is ended without touching the app, at the cost of the session's variables.
 */
export class StatefulReplSession {
  private worker?: Worker;
  private queue: Promise<unknown> = Promise.resolve();
  readonly createdAt = Date.now();

  constructor(
    public readonly sessionId: string,
    private workerPath: string,
  ) {}

  private start() {
    const worker = new Worker(this.workerPath, {
      execArgv: [],
      stdout: true,
      stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
    });
    worker.stdout.resume();
    worker.stderr.resume();
    // Out of memory or a crash arrives as 'error' and then 'exit'; the exit handler of the running request answers.
    worker.on('error', () => {});
    worker.once('exit', () => {
      if (this.worker === worker) this.worker = undefined;
    });
    worker.unref();
    this.worker = worker;
    return worker;
  }

  private run(code: string, timeout: number) {
    return new Promise<{ output?: string; result?: string; error?: string }>(resolve => {
      const worker = this.worker || this.start();
      let settled = false;
      const finish = (reply: { output?: string; result?: string; error?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.off('message', message);
        worker.off('exit', exited);
        resolve(reply);
      };
      const message = (reply: { output?: string; result?: string; error?: string }) => finish(reply);
      const exited = () => finish({ error: 'The REPL stopped (out of memory or crashed); its variables were cleared.' });
      // The worker enforces the limit itself. This backstop ends a thread that stops answering, for example near its
      // memory limit, so the employee's task never waits on it.
      const timer = setTimeout(() => {
        finish({ error: `Script execution timed out after ${timeout}ms; the REPL was restarted and its variables were cleared.` });
        this.stop();
      }, timeout + 2000);
      worker.on('message', message);
      worker.once('exit', exited);
      worker.postMessage({ code: persistentScript(code), timeout });
    });
  }

  eval(code: string, timeoutMs = 5000): Promise<ReplResult> {
    const timeout = Math.min(Math.max(timeoutMs, 500), 10000);
    const turn = this.queue.then(async () => {
      const started = Date.now();
      const reply = await this.run(code, timeout);
      return {
        sessionId: this.sessionId,
        output: (reply.output || '').slice(0, LIMIT),
        ...(reply.result !== undefined ? { result: reply.result.slice(0, LIMIT) } : {}),
        ...(reply.error !== undefined ? { error: reply.error.slice(0, LIMIT) } : {}),
        executionMs: Date.now() - started,
      };
    });
    this.queue = turn.catch(() => {});
    return turn;
  }

  /** Ends the thread; the next run starts a fresh session. */
  stop() {
    const worker = this.worker;
    this.worker = undefined;
    if (worker) void worker.terminate();
  }

  reset() {
    this.stop();
  }
}

export class StatefulReplManager {
  private sessions = new Map<string, StatefulReplSession>();

  session(sessionId: string, workerPath: string): StatefulReplSession {
    let sess = this.sessions.get(sessionId);
    if (!sess) {
      if (this.sessions.size >= 8) {
        const oldest = this.sessions.keys().next().value;
        if (oldest) this.clear(oldest);
      }
      sess = new StatefulReplSession(sessionId, workerPath);
      this.sessions.set(sessionId, sess);
    }
    return sess;
  }

  reset(sessionId: string) {
    this.sessions.get(sessionId)?.reset();
  }

  clear(sessionId: string) {
    this.sessions.get(sessionId)?.stop();
    this.sessions.delete(sessionId);
  }

  close() {
    for (const id of [...this.sessions.keys()]) this.clear(id);
  }
}
