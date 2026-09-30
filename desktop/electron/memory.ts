import { mkdir, readdir, lstat, realpath, open, writeFile, unlink, rename } from 'node:fs/promises';
import { join, resolve, dirname, basename, relative, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Store } from './store';
import type { PathRule, Policy } from './policy';
import type { MemoryEntry, MemoryProposal, Session } from '../src/types';
import { deniedPath, sensitivePath } from './permissions';
import { ensureGitignored } from '../../src/modules/user-memory.js';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const TYPES = ['user', 'feedback', 'project', 'reference'];
const SCOPES = ['private', 'project', 'team'];
async function canonicalPathRules(rules: PathRule[]) {
  const aliases = await Promise.all(
    rules
      .filter(rule => !rule.allow && isAbsolute(rule.pattern))
      .map(async rule => {
        const wildcard = rule.pattern.search(/[*?]/);
        let parent = dirname(wildcard < 0 ? rule.pattern : rule.pattern.slice(0, wildcard) + '_'),
          suffix = relative(parent, rule.pattern);
        for (;;) {
          try {
            return { ...rule, pattern: join(await realpath(parent), suffix) };
          } catch (e: any) {
            if (!['ENOENT', 'ENOTDIR'].includes(e.code)) throw new Error('PATH_RULE_DENIED');
            const next = dirname(parent);
            if (next === parent) return rule;
            suffix = join(basename(parent), suffix);
            parent = next;
          }
        }
      }),
  );
  return [...rules, ...aliases];
}
export function safeMemory(text: string, privacy: (text: string) => any) {
  const scan = privacy(text);
  if (
    scan.action !== 'pass' ||
    scan.containsPersonalData ||
    scan.classification === 'restricted' ||
    scan.classification === 'secret' ||
    scan.redactedText !== text
  )
    throw new Error('MEMORY_PRIVACY_BLOCKED');
  return text;
}
function normalize(raw: any): MemoryEntry {
  if (
    !raw ||
    !TYPES.includes(raw.type) ||
    !SCOPES.includes(raw.scope) ||
    typeof raw.text !== 'string' ||
    !raw.text.trim() ||
    raw.text.length > 4000 ||
    typeof raw.name !== 'string' ||
    !raw.name.trim() ||
    raw.name.length > 120 ||
    !Number.isFinite(raw.importance) ||
    raw.importance < 0 ||
    raw.importance > 1 ||
    !Number.isInteger(raw.ttl_days) ||
    raw.ttl_days < 0 ||
    raw.ttl_days > 3650
  )
    throw new Error('MEMORY_INVALID');
  return {
    schema_version: 1,
    id: randomUUID(),
    name: raw.name.trim(),
    text: raw.text.trim(),
    type: raw.type,
    scope: raw.scope,
    importance: raw.importance,
    ttl_days: raw.ttl_days,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source: 'user-confirmed',
  };
}
export function memoryMarkdown(m: MemoryEntry) {
  const { text, ...metadata } = m;
  return (
    '---\n' +
    Object.entries(metadata)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join('\n') +
    '\n---\n\n' +
    text +
    '\n'
  );
}
export function parseMemory(text: string): MemoryEntry {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!match) throw new Error('MEMORY_INVALID');
  const raw: any = {};
  for (const line of match[1].split('\n')) {
    const item = /^([a-z_]+): (.*)$/.exec(line);
    if (!item || Object.hasOwn(raw, item[1])) throw new Error('MEMORY_INVALID');
    raw[item[1]] = JSON.parse(item[2]);
  }
  const checked = normalize({ ...raw, text: match[2].trim() });
  if (
    raw.schema_version !== 1 ||
    !/^[a-f0-9-]{36}$/.test(raw.id) ||
    !Number.isFinite(Date.parse(raw.updated_at)) ||
    !Number.isFinite(Date.parse(raw.created_at)) ||
    raw.source !== 'user-confirmed'
  )
    throw new Error('MEMORY_INVALID');
  return { ...checked, id: raw.id, created_at: raw.created_at, updated_at: raw.updated_at };
}
/** Conservative, evidence-bound extraction. Assistant claims, paths, names and budgets are never learned. */
export function extractPreferences(session: Session) {
  const found: { text: string; evidence: string }[] = [];
  for (const m of session.messages.slice(-30)) {
    if (m.role !== 'user') continue;
    const candidates: [RegExp, string][] = [
      [/(?:ตอบ|สรุป).{0,12}(?:สั้น|กระชับ)|prefer concise|keep (?:answers|responses) short/i, 'Prefer concise responses.'],
      [/(?:ตอบ|เขียน|สรุป)เป็นภาษาไทย|respond in Thai/i, 'Respond in Thai.'],
      [/(?:ใช้|ชอบ).{0,12}(?:ตาราง|table)|prefer tables/i, 'Use tables for comparisons when useful.'],
      [/วางแผนก่อน|plan before (?:implementing|coding)/i, 'Present an implementation plan before changing code.'],
    ];
    for (const [pattern, text] of candidates) {
      const evidence = pattern.exec(m.text)?.[0];
      if (evidence && !found.some(f => f.text === text)) found.push({ text, evidence });
    }
  }
  return found;
}

export class Memories {
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private store: Store,
    private data: string,
    private policy: () => Policy,
    private privacy: (text: string) => any,
  ) {}
  private context() {
    const s = this.store.settings();
    return hash([resolve(s.workspace || this.data), s.team].join('\0'));
  }
  private async directory(scope: MemoryEntry['scope'], create = false) {
    const s = this.store.settings();
    let base = this.data,
      segments = ['memory'];
    if (scope === 'project') {
      if (!s.workspace) throw new Error('WORKSPACE_REQUIRED');
      base = s.workspace;
      segments = ['.step', 'memory'];
    } else if (scope === 'team') {
      const folder = this.policy().memory?.teamDirectories[s.team];
      if (!this.policy().features.memoryTeam || !folder) throw new Error('MEMORY_TEAM_DISABLED');
      base = folder;
      segments = [];
    }
    // Reject junction/symlink components; nothing may redirect a memory operation.
    const absolute = resolve(base);
    let check = absolute;
    for (;;) {
      const info = await lstat(check);
      if (info.isSymbolicLink()) throw new Error('INVALID_PATH');
      const sensitive = scope === 'private' ? undefined : sensitivePath(check);
      if (sensitive && !sensitive.includes('/.step/memory')) throw new Error('INVALID_PATH');
      const parent = resolve(check, '..');
      if (parent === check) break;
      check = parent;
    }
    let path = await realpath(absolute);
    if (scope !== 'private') {
      // Windows 8.3 aliases must not make a workspace-relative denial miss its canonical target.
      const configuredRoot = s.workspace || absolute,
        canonicalRoot = scope === 'project' ? path : await realpath(resolve(configuredRoot)),
        rules = await canonicalPathRules(this.policy().permission.pathRules);
      if (deniedPath(join(absolute, ...segments), rules, configuredRoot) || deniedPath(join(path, ...segments), rules, canonicalRoot))
        throw new Error('PATH_RULE_DENIED');
    }
    for (const segment of segments) {
      path = join(path, segment);
      if (create)
        await mkdir(path).catch(e => {
          if (e.code !== 'EEXIST') throw e;
        });
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('INVALID_PATH');
    }
    return path;
  }
  async list() {
    const entries: MemoryEntry[] = [];
    for (const scope of SCOPES as MemoryEntry['scope'][]) {
      try {
        const directory = await this.directory(scope);
        for (const file of (await readdir(directory)).filter(f => /^[a-f0-9-]{36}\.md$/.test(f)).slice(0, 200)) {
          try {
            const path = join(directory, file),
              info = await lstat(path);
            if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1 || info.size > 12_000) continue;
            const handle = await open(path, 'r');
            let source: string;
            try {
              const bytes = Buffer.alloc(12_001),
                result = await handle.read(bytes, 0, bytes.length, 0);
              if (result.bytesRead > 12_000 || result.bytesRead !== info.size) continue;
              source = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, result.bytesRead));
            } finally {
              await handle.close();
            }
            const m = parseMemory(source);
            if (m.scope !== scope || file !== m.id + '.md') continue;
            safeMemory(m.name + '\n' + m.text, this.privacy);
            entries.push({ ...m, expired: Boolean(m.ttl_days && Date.parse(m.updated_at) + m.ttl_days * 86400_000 <= Date.now()) });
          } catch {
            /* Malformed, sensitive or redirected entries never enter prompts. */
          }
        }
      } catch (e: any) {
        if (!['ENOENT', 'MEMORY_TEAM_DISABLED', 'WORKSPACE_REQUIRED', 'PATH_RULE_DENIED', 'EACCES'].includes(e.code || e.message)) throw e;
      }
    }
    return entries.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  async save(raw: any) {
    const context = this.context(),
      policy = this.policy();
    const m = normalize(raw);
    safeMemory(m.name + '\n' + m.text, this.privacy);
    const existing = raw.id ? (await this.list()).find(e => e.id === raw.id && e.scope === m.scope) : undefined;
    if (raw.id && !existing) throw new Error('MEMORY_NOT_FOUND');
    if (existing) {
      m.id = existing.id;
      m.created_at = existing.created_at;
    }
    const directory = await this.directory(m.scope, true);
    if (m.scope === 'project') {
      const workspace = this.store.settings().workspace,
        canonicalWorkspace = await realpath(resolve(workspace)),
        rules = await canonicalPathRules(this.policy().permission.pathRules);
      if (
        deniedPath(join(workspace, '.gitignore'), rules, workspace) ||
        deniedPath(join(canonicalWorkspace, '.gitignore'), rules, canonicalWorkspace)
      )
        throw new Error('PATH_RULE_DENIED');
      await ensureGitignored(workspace, { strict: true });
    }
    if (!existing && (await readdir(directory)).filter(f => /^[a-f0-9-]{36}\.md$/.test(f)).length >= 200) throw new Error('MEMORY_LIMIT');
    if (context !== this.context() || policy !== this.policy()) throw new Error('WORKSPACE_CHANGED');
    const path = join(directory, m.id + '.md');
    if (existing) {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('INVALID_PATH');
    }
    const temp = join(directory, `.${randomUUID()}.tmp`);
    await writeFile(temp, memoryMarkdown(m), { flag: 'wx', mode: 0o600 });
    try {
      await rename(temp, path);
    } finally {
      await unlink(temp).catch(() => {});
    }
    return m;
  }
  async remove(id: string) {
    const entry = (await this.list()).find(m => m.id === id);
    if (!entry) throw new Error('MEMORY_NOT_FOUND');
    const path = join(await this.directory(entry.scope), entry.id + '.md');
    if ((await lstat(path)).isSymbolicLink()) throw new Error('INVALID_PATH');
    await unlink(path);
  }
  proposals() {
    return this.store.list<MemoryProposal>('memory-proposal').filter(m => m.context === this.context());
  }
  async confirm(id: string, changes: any) {
    const proposal = this.proposals().find(p => p.id === id);
    if (!proposal) throw new Error('MEMORY_NOT_FOUND');
    const saved = await this.save({ ...proposal, ...changes, id: undefined });
    this.store.remove('memory-proposal', id);
    return saved;
  }
  dismiss(id: string) {
    if (!this.proposals().some(p => p.id === id)) throw new Error('MEMORY_NOT_FOUND');
    this.store.remove('memory-proposal', id);
  }
  /** Autodream is a local background queue, never a provider call or automatic memory write. */
  dream(session: Session) {
    const context = this.context();
    this.queue = this.queue
      .then(async () => {
        if (context !== this.context() || session.status !== 'review') return;
        const existing = await this.list();
        for (const candidate of extractPreferences(session)) {
          try {
            safeMemory(candidate.evidence, this.privacy);
            safeMemory(candidate.text, this.privacy);
            if (existing.some(m => m.text === candidate.text) || this.proposals().some(m => m.text === candidate.text)) continue;
            if (this.proposals().length >= 20) break;
            const id = randomUUID();
            const p: MemoryProposal = {
              id,
              name: 'Response preference',
              text: candidate.text,
              type: 'user',
              scope: 'private',
              importance: 0.7,
              ttl_days: 0,
              evidence: candidate.evidence,
              sessionId: session.id,
              context,
              at: new Date().toISOString(),
            };
            this.store.put('memory-proposal', id, p);
          } catch {
            /* Evidence failing classification is discarded, not retained for review. */
          }
        }
      })
      .catch(() => {});
    return this.queue;
  }
  async relevant(query: string) {
    const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}|[\u0E00-\u0E7F]{2,}/g) || [])];
    return (await this.list())
      .filter(m => !m.expired)
      .map(m => ({
        m,
        score: terms.filter(t => (m.name + ' ' + m.text).toLowerCase().includes(t)).length + m.importance + (m.type === 'user' ? 2 : 0),
      }))
      .filter(v => v.m.type === 'user' || v.score > 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(v => v.m);
  }
}
