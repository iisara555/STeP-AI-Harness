import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

export type VaultKind = 'website' | 'api-key' | 'google-oauth' | 'google-client';
export type VaultMetadata = { id: string; label: string; kind: VaultKind; destination: string; revision: number; at: string };
type Record = VaultMetadata & { nonce: string; tag: string; ciphertext: string };
export type KeyProtection = { wrap: (value: string) => Buffer; unwrap: (value: Buffer) => string };
export const vaultOrigin = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || !['', '/'].includes(url.pathname))
      throw new Error();
    return url.origin;
  } catch {
    throw new Error('VAULT_ORIGIN_INVALID');
  }
};
/** The site an employee types when saving an account: a pasted login page address or a bare host keeps only its origin. */
export const websiteOrigin = (value: string) => {
  const text = typeof value === 'string' ? value.trim() : '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : 'https://' + text);
    if (url.username || url.password) throw new Error();
    return vaultOrigin(url.origin);
  } catch {
    throw new Error('VAULT_ORIGIN_INVALID');
  }
};
const string = (value: unknown, max: number) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) throw new Error('INVALID_INPUT');
  return value;
};

/** Plaintext is available only to trusted, purpose-bound sinks; IPC and model callers receive metadata. */
export class Vault {
  private db: DatabaseSync;
  private suspended = false;
  private epoch = 0;
  private locks = new Set<string>();
  private handles = new Map<string, { id: string; context: string; revision: number; expires: number; epoch: number }>();
  private attempts = new Map<string, { id: string; revision: number; expires: number }>();
  private recentNonces = new Set<string>();
  constructor(
    path: string,
    private protection: KeyProtection,
    private profile = 'local',
  ) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS vault_records (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS vault_state (id TEXT PRIMARY KEY, value TEXT NOT NULL);',
    );
    this.suspended = this.db.prepare("SELECT value FROM vault_state WHERE id='suspended'").get()?.value === 'true';
    try {
      chmodSync(path, 0o600);
    } catch {
      /* Windows uses the application-data directory ACL. */
    }
  }
  protected() {
    return Boolean(this.db.prepare("SELECT 1 FROM vault_state WHERE id='key'").get());
  }
  state() {
    return { suspended: this.suspended, protected: this.protected(), entries: this.list() };
  }
  list(): VaultMetadata[] {
    return this.db
      .prepare('SELECT value FROM vault_records ORDER BY id')
      .all()
      .map(row => {
        const { id, label, kind, destination, revision, at } = JSON.parse(String(row.value)) as Record;
        return { id, label, kind, destination, revision, at };
      });
  }
  private record(id: string): Record {
    const row = this.db.prepare('SELECT value FROM vault_records WHERE id=?').get(id);
    if (!row) throw new Error('VAULT_NOT_FOUND');
    return JSON.parse(String(row.value));
  }
  private key(create = false) {
    const row = this.db.prepare("SELECT value FROM vault_state WHERE id='key'").get();
    if (row) {
      try {
        const key = Buffer.from(this.protection.unwrap(Buffer.from(String(row.value), 'base64')), 'base64');
        if (key.length !== 32) throw new Error();
        return key;
      } catch {
        throw new Error('VAULT_UNAVAILABLE');
      }
    }
    if (!create) throw new Error('VAULT_INTEGRITY_ERROR');
    const key = randomBytes(32);
    const wrapped = this.protection.wrap(key.toString('base64'));
    if (this.protection.unwrap(wrapped) !== key.toString('base64')) throw new Error('VAULT_UNAVAILABLE');
    this.db.prepare("INSERT INTO vault_state VALUES ('key',?)").run(wrapped.toString('base64'));
    return key;
  }
  private aad(meta: VaultMetadata) {
    return Buffer.from(JSON.stringify([1, this.profile, meta.id, meta.kind, meta.destination, meta.revision, meta.label, meta.at]));
  }
  private decode(record: Record) {
    const key = this.key();
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.nonce, 'base64'));
      decipher.setAAD(this.aad(record));
      decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
    } catch {
      throw new Error('VAULT_INTEGRITY_ERROR');
    } finally {
      key.fill(0);
    }
  }
  save(input: {
    id?: string;
    revision?: number;
    label: string;
    kind: VaultKind;
    destination: string;
    username?: string;
    password?: string;
    value?: string;
  }): VaultMetadata {
    if (!['website', 'api-key', 'google-oauth', 'google-client'].includes(input.kind)) throw new Error('INVALID_INPUT');
    const previous = input.id ? this.record(string(input.id, 80)) : undefined;
    if (previous && (this.locks.has(previous.id) || previous.revision !== input.revision)) throw new Error('VAULT_REVISION_CHANGED');
    if (previous && previous.kind !== input.kind) throw new Error('VAULT_ACCESS_DENIED');
    const destination = input.kind === 'website' ? websiteOrigin(input.destination) : string(input.destination, 2000);
    const meta: VaultMetadata = {
      id: previous?.id || randomUUID(),
      label: string(input.label, 100),
      kind: input.kind,
      destination,
      revision: (previous?.revision || 0) + 1,
      at: new Date().toISOString(),
    };
    const payload =
      input.kind === 'website'
        ? {
            username: string(input.username, 500),
            password: input.password
              ? string(input.password, 4000)
              : previous
                ? this.decode(previous).password
                : string(input.password, 4000),
          }
        : { value: string(input.value, 20000) };
    if (this.list().length >= 200 && !previous) throw new Error('VAULT_LIMIT');
    this.db.exec('BEGIN IMMEDIATE');
    let key: Buffer | undefined;
    try {
      key = this.key(true);
      let nonce: Buffer;
      do {
        nonce = randomBytes(12);
      } while (
        this.recentNonces.has(nonce.toString('base64')) ||
        this.db.prepare('SELECT 1 FROM vault_state WHERE id=?').get('nonce:' + nonce.toString('base64'))
      );
      this.recentNonces.add(nonce.toString('base64'));
      this.db.prepare('INSERT INTO vault_state VALUES (?,?)').run('nonce:' + nonce.toString('base64'), '1');
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(this.aad(meta));
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
      const record: Record = {
        ...meta,
        nonce: nonce.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      };
      this.db
        .prepare('INSERT INTO vault_records VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value')
        .run(meta.id, JSON.stringify(record));
      this.decode(record);
      this.db.exec('COMMIT');
      this.invalidate();
      return meta;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      key?.fill(0);
    }
  }
  remove(id: string, revision: number) {
    const record = this.record(id);
    if (record.revision !== revision || this.locks.has(id)) throw new Error('VAULT_REVISION_CHANGED');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM vault_records WHERE id=?').run(id);
      this.db
        .prepare('INSERT INTO vault_state VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value')
        .run('deleted:' + id, String(revision + 1));
      this.db.exec('COMMIT');
      this.invalidate();
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  invalidate() {
    this.epoch++;
    this.handles.clear();
  }
  suspend(enabled: boolean) {
    if (typeof enabled !== 'boolean') throw new Error('INVALID_INPUT');
    this.db
      .prepare("INSERT INTO vault_state VALUES ('suspended',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value")
      .run(String(enabled));
    this.suspended = enabled;
    this.invalidate();
  }
  catalog(context: string, origin: string) {
    if (this.suspended) throw new Error('VAULT_SUSPENDED');
    const destination = vaultOrigin(origin);
    const now = Date.now();
    for (const [handle, entry] of this.handles) if (entry.expires < now) this.handles.delete(handle);
    return this.list()
      .filter(entry => entry.kind === 'website' && entry.destination === destination)
      .map(entry => {
        if (this.handles.size >= 500) throw new Error('VAULT_LIMIT');
        const handle = randomUUID();
        this.handles.set(handle, { id: entry.id, context, revision: entry.revision, expires: now + 90000, epoch: this.epoch });
        return { handle, label: entry.label, origin: entry.destination };
      });
  }
  async fill(
    handle: string,
    context: string,
    origin: string,
    approve: (label: string) => Promise<boolean>,
    sink: (payload: { username: string; password: string }) => Promise<unknown>,
  ) {
    const grant = this.handles.get(handle);
    this.handles.delete(handle);
    if (!grant || grant.context !== context || grant.expires < Date.now() || grant.epoch !== this.epoch)
      throw new Error('VAULT_ACCESS_DENIED');
    if (this.locks.has(grant.id)) throw new Error('VAULT_BUSY');
    const entry = this.record(grant.id);
    if (this.attempts.size >= 200 && !this.attempts.has(context)) throw new Error('VAULT_LIMIT');
    const attempt = this.attempts.get(context);
    if (attempt && (attempt.id !== entry.id || attempt.revision !== entry.revision || attempt.expires < Date.now()))
      throw new Error('VAULT_LOGIN_ATTEMPT_CHANGED');
    if (entry.destination !== vaultOrigin(origin)) throw new Error('VAULT_ORIGIN_CHANGED');
    if (!(await approve(entry.label))) throw new Error('CANCELLED');
    if (this.suspended || grant.epoch !== this.epoch || grant.expires < Date.now() || this.record(grant.id).revision !== grant.revision)
      throw new Error('VAULT_REVISION_CHANGED');
    this.locks.add(grant.id);
    try {
      const result = await sink(this.decode(entry));
      if (result && typeof result === 'object' && 'filledFields' in result && Array.isArray(result.filledFields)) {
        if (result.filledFields.includes('password')) this.attempts.delete(context);
        else if (result.filledFields.includes('username')) {
          this.attempts.set(context, { id: entry.id, revision: entry.revision, expires: Date.now() + 300000 });
        }
      }
      return result;
    } finally {
      this.locks.delete(grant.id);
    }
  }
  endAttempt(context: string) {
    this.attempts.delete(context);
  }
  endOwner(owner: string) {
    for (const context of this.attempts.keys()) {
      try {
        if (JSON.parse(context)[0] === owner) this.attempts.delete(context);
      } catch {
        /* Non-browser test contexts have no owner. */
      }
    }
  }
  /** Internal adapter-only access, with a fixed kind/destination; never registered as a tool or IPC method. */
  async use<T>(id: string, kind: Exclude<VaultKind, 'website'>, destination: string, sink: (value: string) => Promise<T>): Promise<T> {
    if (this.suspended) throw new Error('VAULT_SUSPENDED');
    const entry = this.record(id);
    if (entry.kind !== kind || entry.destination !== destination) throw new Error('VAULT_ACCESS_DENIED');
    return sink(this.decode(entry).value);
  }
  close() {
    this.attempts.clear();
    this.invalidate();
    this.db.close();
  }
}
