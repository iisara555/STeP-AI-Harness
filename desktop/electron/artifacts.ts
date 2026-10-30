import { Store } from './store';

export type ArtifactKind = 'markdown' | 'html' | 'mermaid' | 'table' | 'code' | 'json';

export type ArtifactRecord = {
  id: string;
  sessionId: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  version: number;
  uri: string;
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
      uri: `sidecar://artifact/${encodeURIComponent(id)}`,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.store.put('artifact', key, record);
    return record;
  }

  get(sessionId: string, id: string): ArtifactRecord | undefined {
    return this.store.get<ArtifactRecord>('artifact', `${sessionId}:${id}`);
  }

  list(sessionId: string): ArtifactRecord[] {
    return this.store
      .list<ArtifactRecord>('artifact')
      .filter(a => a.sessionId === sessionId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  delete(sessionId: string, id: string): boolean {
    const key = `${sessionId}:${id}`;
    if (this.store.get('artifact', key)) {
      this.store.remove('artifact', key);
      return true;
    }
    return false;
  }
}
