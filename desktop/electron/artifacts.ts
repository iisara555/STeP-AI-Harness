import { Store } from './store';

export type ArtifactKind = 'markdown' | 'html' | 'mermaid' | 'table' | 'code' | 'json';

export type ArtifactRecord = {
  id: string;
  sessionId: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export class ArtifactStore {
  constructor(private store: Store) {}

  save(sessionId: string, id: string, title: string, kind: ArtifactKind, content: string): ArtifactRecord {
    if (!id || typeof id !== 'string' || id.length > 80 || !/^[a-zA-Z0-9_.-]+$/.test(id)) {
      throw new Error('INVALID_INPUT');
    }
    if (!title || typeof title !== 'string' || title.length > 200) {
      throw new Error('INVALID_INPUT');
    }
    if (!['markdown', 'html', 'mermaid', 'table', 'code', 'json'].includes(kind)) {
      throw new Error('INVALID_INPUT');
    }
    if (typeof content !== 'string' || content.length > 200000) {
      throw new Error('INVALID_INPUT');
    }

    const key = `${sessionId}:${id}`;
    const existing = this.store.get<ArtifactRecord>('artifact', key);
    const now = new Date().toISOString();

    const record: ArtifactRecord = {
      id,
      sessionId,
      title: title.trim(),
      kind,
      content,
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.store.put('artifact', key, record);
    this.store.put('artifact-version', `${key}:v${record.version}`, record);
    return record;
  }

  get(sessionId: string, id: string, version?: number): ArtifactRecord | undefined {
    const key = `${sessionId}:${id}`;
    if (typeof version === 'number' && Number.isSafeInteger(version) && version > 0) {
      const snapshot = this.store.get<ArtifactRecord>('artifact-version', `${key}:v${version}`);
      if (snapshot) return snapshot;
    }
    return this.store.get<ArtifactRecord>('artifact', key);
  }

  list(sessionId: string): ArtifactRecord[] {
    return this.store
      .list<ArtifactRecord>('artifact')
      .filter(a => a.sessionId === sessionId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  delete(sessionId: string, id: string): boolean {
    const key = `${sessionId}:${id}`;
    const existing = this.store.get<ArtifactRecord>('artifact', key);
    if (existing) {
      this.store.remove('artifact', key);
      for (let v = 1; v <= existing.version; v++) this.store.remove('artifact-version', `${key}:v${v}`);
      return true;
    }
    return false;
  }

  deleteBySession(sessionId: string): number {
    let removed = 0;
    for (const artifact of this.list(sessionId)) {
      if (this.delete(sessionId, artifact.id)) removed++;
    }
    return removed;
  }
}
