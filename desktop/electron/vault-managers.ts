import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { websiteOrigin } from './vault';

export type ManagerName = 'onepassword' | 'bitwarden';
export type ManagerItem = {
  id: string;
  source: ManagerName;
  label: string;
  identifier: string;
  origins: string[];
  twoFactor: boolean;
  vaultId?: string;
};
type Execute = (file: string, args: string[], env: NodeJS.ProcessEnv, input?: string) => Promise<string>;
const execute: Execute = (file, args, env, input) =>
  new Promise((resolve, reject) => {
    const script = /\.[cm]?js$/i.test(file);
    const child = spawn(script ? process.execPath : file, script ? [file, ...args] : args, {
      env: script ? { ...env, ELECTRON_RUN_AS_NODE: '1' } : env,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '',
      count = 0,
      done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(output);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error('VAULT_MANAGER_TIMEOUT'));
    }, 30000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (bytes: string) => {
      count += Buffer.byteLength(bytes);
      if (count > 8 * 1024 * 1024) {
        child.kill();
        finish(new Error('VAULT_MANAGER_LIMIT'));
      } else output += bytes;
    });
    // Never surface a CLI diagnostic: some clients echo secret values on failure.
    child.stderr.resume();
    child.on('error', () => finish(new Error('VAULT_MANAGER_UNAVAILABLE')));
    child.on('close', code => finish(code === 0 ? undefined : new Error('VAULT_MANAGER_FAILED')));
    child.stdin.on('error', () => {});
    child.stdin.end(input || '');
  });
export const findManagerCli = (name: string, searchPath = process.env.PATH || '', platform: NodeJS.Platform = process.platform) => {
  for (const dir of searchPath.split(platform === 'win32' ? ';' : ':')) {
    if (!dir || !/^(?:[a-z]:[\\/]|\/)/i.test(dir)) continue;
    const file = join(dir, name + (platform === 'win32' ? '.exe' : ''));
    if (existsSync(file)) return file;
    // npm's Windows .cmd shim is not directly executable with shell:false. Run its known package entry
    // through the bundled Node runtime instead; do not invoke cmd.exe or interpret a wrapper script.
    if (platform === 'win32' && name === 'bw') {
      const script = join(dir, 'node_modules', '@bitwarden', 'cli', 'build', 'bw.js');
      if (existsSync(script)) return script;
    }
  }
};
const origins = (urls: string[]) => [
  ...new Set(
    urls.flatMap(url => {
      try {
        return [websiteOrigin(url)];
      } catch {
        return [];
      }
    }),
  ),
];

/** Fixed CLI adapters, no shell or secret argv. Unlock tokens remain in host memory, idle limit30min. */
export class VaultManagers {
  private sessions = new Map<ManagerName, { token: string; used: number }>();
  private items = new Map<string, ManagerItem>();
  private epochs = { onepassword: 0, bitwarden: 0 };
  private locallyLocked = new Set<ManagerName>();
  constructor(
    private enabled: (source: ManagerName) => boolean = () => true,
    private run: Execute = execute,
    private locate = findManagerCli,
    private hostEnvironment: () => NodeJS.ProcessEnv = () => process.env,
  ) {}
  private file(source: ManagerName) {
    return this.locate(source === 'onepassword' ? 'op' : 'bw');
  }
  private environment(source: ManagerName, touch = false) {
    const saved = this.sessions.get(source);
    if (saved && Date.now() - saved.used >= 1800000) this.lock(source);
    const session = this.sessions.get(source);
    if (session && touch) session.used = Date.now();
    const env = { ...this.hostEnvironment() };
    if (source === 'onepassword') {
      for (const key of Object.keys(env)) if (key.startsWith('OP_SESSION')) delete env[key];
      if (session?.token) env.OP_SESSION = session.token;
    } else {
      delete env.BW_SESSION;
      if (session) env.BW_SESSION = session.token;
    }
    return env;
  }
  state() {
    return (['onepassword', 'bitwarden'] as const).map(source => {
      this.environment(source);
      return {
        source,
        enabled: this.enabled(source),
        installed: Boolean(this.file(source)),
        unlocked: !this.locallyLocked.has(source) && (this.sessions.has(source) || this.canUnlockWithoutPassword(source)),
      };
    });
  }
  async unlock(source: ManagerName, master: string) {
    const file = this.file(source);
    if (!this.enabled(source) || !file) throw new Error('VAULT_MANAGER_UNAVAILABLE');
    const env = this.environment(source);
    const epoch = this.epochs[source];
    if (this.canUnlockWithoutPassword(source)) {
      this.locallyLocked.delete(source);
      this.sessions.set(source, { token: '', used: Date.now() });
      return;
    }
    let token: string;
    if (source === 'onepassword') token = await this.run(file, ['signin', '--raw'], env, master + '\n');
    else {
      env.STEP_VAULT_MASTER = master;
      try {
        token = await this.run(file, ['unlock', '--raw', '--nointeraction', '--passwordenv', 'STEP_VAULT_MASTER'], env);
      } finally {
        delete env.STEP_VAULT_MASTER;
      }
    }
    if (!token.trim() || token.length > 20000) throw new Error('VAULT_MANAGER_FAILED');
    if (epoch !== this.epochs[source] || !this.enabled(source)) throw new Error('VAULT_ACCESS_DENIED');
    this.locallyLocked.delete(source);
    this.sessions.set(source, { token: token.trim(), used: Date.now() });
  }
  lock(source?: ManagerName) {
    if (source) {
      this.locallyLocked.add(source);
      this.epochs[source]++;
      this.sessions.delete(source);
      for (const [id, item] of this.items) if (item.source === source) this.items.delete(id);
    } else {
      this.locallyLocked.add('onepassword');
      this.locallyLocked.add('bitwarden');
      this.epochs.onepassword++;
      this.epochs.bitwarden++;
      this.sessions.clear();
      this.items.clear();
    }
  }
  canUnlockWithoutPassword(source: ManagerName) {
    return source === 'onepassword' && Boolean(this.hostEnvironment().OP_SERVICE_ACCOUNT_TOKEN);
  }
  private async command(source: ManagerName, args: string[]) {
    const state = this.state().find(item => item.source === source)!;
    if (!state.enabled || !state.installed) throw new Error('VAULT_MANAGER_UNAVAILABLE');
    if (this.locallyLocked.has(source)) throw new Error('VAULT_MANAGER_LOCKED');
    // Signed-in CLI integrations may work without a token (e.g. 1Password desktop integration).
    const epoch = this.epochs[source];
    const result = await this.run(this.file(source)!, args, this.environment(source, true));
    if (epoch !== this.epochs[source] || !this.enabled(source)) throw new Error('VAULT_ACCESS_DENIED');
    if (!this.sessions.has(source)) this.sessions.set(source, { token: '', used: Date.now() });
    return result;
  }
  async list(): Promise<{ items: ManagerItem[]; locked: ManagerName[] }> {
    const result: ManagerItem[] = [],
      locked: ManagerName[] = [];
    for (const state of this.state()) {
      if (!state.enabled || !state.installed) continue;
      try {
        const rows = JSON.parse(
          await this.command(
            state.source,
            state.source === 'onepassword'
              ? ['item', 'list', '--categories', 'Login', '--format', 'json']
              : ['list', 'items', '--nointeraction'],
          ),
        );
        if (!Array.isArray(rows) || rows.length > 1000) throw new Error('VAULT_MANAGER_LIMIT');
        for (const row of rows.slice(0, 200)) {
          if (state.source === 'bitwarden' && (row.type !== 1 || !row.login)) continue;
          // 1Password exposes the identifier as list metadata; never fetch every password just to list accounts.
          const item: ManagerItem =
            state.source === 'onepassword'
              ? {
                  id: String(row.id),
                  source: state.source,
                  vaultId: String(row.vault?.id || ''),
                  label: String(row.title || '1Password'),
                  identifier: typeof row.additional_information === 'string' ? row.additional_information : '',
                  origins: origins((row.urls || []).map((url: any) => String(url.href || ''))),
                  twoFactor: false,
                }
              : {
                  id: String(row.id),
                  source: state.source,
                  label: String(row.name || 'Bitwarden'),
                  identifier: String(row.login.username || ''),
                  origins: origins((row.login.uris || []).filter((url: any) => url.match !== 5).map((url: any) => String(url.uri || ''))),
                  twoFactor: Boolean(row.login.totp),
                };
          if (!/^[a-zA-Z0-9-]{1,100}$/.test(item.id) || !item.origins.length) continue;
          item.label = item.label.slice(0, 100);
          item.identifier = item.identifier.slice(0, 500);
          this.items.set(state.source + ':' + item.id, item);
          result.push(item);
        }
      } catch {
        locked.push(state.source);
      }
    }
    return { items: result, locked };
  }
  async resolve(item: ManagerItem, otp = false): Promise<{ username: string; password: string; code?: string }> {
    const current = this.items.get(item.source + ':' + item.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(item)) throw new Error('VAULT_ACCESS_DENIED');
    if (item.source === 'bitwarden') {
      const row = JSON.parse(await this.command(item.source, ['get', 'item', item.id, '--nointeraction']));
      const currentOrigins = origins(
        (row.login?.uris || []).filter((url: any) => url.match !== 5).map((url: any) => String(url.uri || '')),
      );
      if (
        row.type !== 1 ||
        row.id !== item.id ||
        JSON.stringify(currentOrigins) !== JSON.stringify(item.origins) ||
        String(row.login?.username || '') !== item.identifier
      )
        throw new Error('VAULT_REVISION_CHANGED');
      if (!otp) {
        if (typeof row.login.password !== 'string') throw new Error('VAULT_MANAGER_FAILED');
        return { username: item.identifier, password: row.login.password };
      }
      const value = (
        await this.command(item.source, ['get', 'totp', item.id, '--nointeraction']).catch(error => {
          if (error.message === 'VAULT_MANAGER_FAILED') return '';
          throw error;
        })
      ).trim();
      return { username: item.identifier, password: '', code: /^\d{6,8}$/.test(value) ? value : undefined };
    }
    const selector = ['item', 'get', item.id, ...(item.vaultId ? ['--vault', item.vaultId] : [])];
    const row = JSON.parse(await this.command(item.source, [...selector, '--format', 'json']));
    if (
      row.id !== item.id ||
      JSON.stringify(origins((row.urls || []).map((url: any) => String(url.href || '')))) !== JSON.stringify(item.origins)
    )
      throw new Error('VAULT_REVISION_CHANGED');
    if (otp) {
      const code = (
        await this.command(item.source, [...selector, '--otp']).catch(error => {
          if (error.message === 'VAULT_MANAGER_FAILED') return '';
          throw error;
        })
      ).trim();
      return { username: item.identifier, password: '', code: /^\d{6,8}$/.test(code) ? code : undefined };
    }
    const fields = row.fields || [];
    const password = fields.find((field: any) => field.purpose === 'PASSWORD' || field.id === 'password')?.value;
    const username = fields.find((field: any) => field.purpose === 'USERNAME' || field.id === 'username')?.value || '';
    if (typeof password !== 'string' || typeof username !== 'string') throw new Error('VAULT_MANAGER_FAILED');
    if (item.identifier && item.identifier !== username) throw new Error('VAULT_REVISION_CHANGED');
    return { username, password };
  }
}
