import vm from 'node:vm';

export type ReplResult = {
  sessionId: string;
  output: string;
  result?: string;
  error?: string;
  executionMs: number;
};

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'function') {
    return `[Function: ${value.name || 'anonymous'}]`;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Rewrites top-level 'const ' and 'let ' into 'var ' so that variables
 * attach to the context global object and remain accessible across turns.
 */
function normalizeReplScript(code: string): string {
  return code.replace(/(?:^|\n)\s*(const|let)\s+/g, (match, keyword) => match.replace(keyword, 'var'));
}

export class StatefulReplSession {
  private context: vm.Context;
  private logs: string[] = [];
  readonly createdAt = Date.now();

  constructor(public readonly sessionId: string) {
    this.context = this.createSandbox();
  }

  private createSandbox(): vm.Context {
    this.logs = [];
    const sandbox: Record<string, unknown> = {
      console: {
        log: (...args: unknown[]) => this.logs.push(args.map(formatValue).join(' ')),
        error: (...args: unknown[]) => this.logs.push('[ERROR] ' + args.map(formatValue).join(' ')),
        warn: (...args: unknown[]) => this.logs.push('[WARN] ' + args.map(formatValue).join(' ')),
        info: (...args: unknown[]) => this.logs.push(args.map(formatValue).join(' ')),
      },
      Math,
      JSON,
      Date,
      Buffer,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURI,
      decodeURI,
      encodeURIComponent,
      decodeURIComponent,
    };

    const ctx = vm.createContext(sandbox);
    // Protect prototype against constructor escape
    try {
      vm.runInContext('try { this.constructor.constructor = undefined; } catch(e) {}', ctx);
    } catch {
      // Ignore in restrictive environments
    }
    return ctx;
  }

  reset() {
    this.context = this.createSandbox();
  }

  eval(code: string, timeoutMs = 5000): ReplResult {
    const started = Date.now();
    this.logs = [];
    const sanitized = normalizeReplScript(code);

    try {
      const result = vm.runInContext(sanitized, this.context, {
        timeout: Math.min(Math.max(timeoutMs, 500), 10000),
        displayErrors: true,
      });

      return {
        sessionId: this.sessionId,
        output: this.logs.join('\n').slice(0, 50000),
        result: result !== undefined ? formatValue(result).slice(0, 50000) : undefined,
        executionMs: Date.now() - started,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        sessionId: this.sessionId,
        output: this.logs.join('\n').slice(0, 50000),
        error: message,
        executionMs: Date.now() - started,
      };
    }
  }
}

export class StatefulReplManager {
  private sessions = new Map<string, StatefulReplSession>();

  session(sessionId: string): StatefulReplSession {
    let sess = this.sessions.get(sessionId);
    if (!sess) {
      if (this.sessions.size >= 20) {
        const oldest = this.sessions.keys().next().value;
        if (oldest) this.sessions.delete(oldest);
      }
      sess = new StatefulReplSession(sessionId);
      this.sessions.set(sessionId, sess);
    }
    return sess;
  }

  reset(sessionId: string) {
    const sess = this.sessions.get(sessionId);
    if (sess) sess.reset();
  }

  clear(sessionId: string) {
    this.sessions.delete(sessionId);
  }
}
