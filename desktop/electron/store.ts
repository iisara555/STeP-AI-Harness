import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Session, Connection, Settings } from '../src/types';
import { documentText, markdownDocument, validateDocument } from '../src/draft';

export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id)); PRAGMA user_version=1;',
    );
    // Interrupted jobs are never replayed automatically.
    for (const session of this.list<Session>('session')) {
      if (session.status === 'running') {
        session.status = 'interrupted';
        this.put('session', session.id, session);
      }
    }
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind, id);
    return row ? JSON.parse(String(row.value)) : undefined;
  }
  put(kind: string, id: string, value: unknown) {
    this.db
      .prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value')
      .run(kind, id, JSON.stringify(value));
  }
  list<T>(kind: string): T[] {
    return this.db
      .prepare('SELECT value FROM records WHERE kind=?')
      .all(kind)
      .map(r => JSON.parse(String(r.value)));
  }
  settings(): Settings {
    return this.get('settings', 'main') ?? { team: '', assistant: 'STeP Mate', workspace: '', theme: 'system', onboarding: false };
  }
  session(id: string): Session {
    const session = this.get<Session>('session', id);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    return session;
  }
  create(connectionId: string, team: string, project = '') {
    const session: Session = {
      id: randomUUID(),
      title: 'งานใหม่',
      project,
      team,
      connectionId,
      messages: [],
      draft: '',
      revision: 0,
      versions: [],
      proposals: [],
      originalQuery: '',
      answers: [],
      clarification: false,
      status: 'idle',
      updatedAt: new Date().toISOString(),
      sources: [],
    };
    this.save(session);
    return session;
  }
  save(session: Session) {
    session.updatedAt = new Date().toISOString();
    this.put('session', session.id, session);
  }
  edit(id: string, text: string, baseRevision: number, document?: unknown) {
    const session = this.session(id);
    if (session.revision !== baseRevision) throw new Error('DRAFT_CONFLICT');
    const normalized = document === undefined ? undefined : validateDocument(document);
    if (normalized) text = documentText(normalized);
    if (text !== session.draft || JSON.stringify(normalized) !== JSON.stringify(session.document)) {
      session.versions.push({ revision: session.revision, text: session.draft, document: session.document, at: new Date().toISOString() });
      session.draft = text;
      session.document = normalized;
      session.revision++;
      this.save(session);
    }
    return session;
  }
  accept(id: string, proposalId: string) {
    const session = this.session(id),
      proposal = session.proposals.find(p => p.id === proposalId);
    if (!proposal) throw new Error('PROPOSAL_NOT_FOUND');
    // Proposals are Markdown from the model; keep their headings, lists, and emphasis in the editable draft.
    const edited = this.edit(id, proposal.text, proposal.baseRevision, markdownDocument(proposal.text));
    edited.proposals = edited.proposals.filter(p => p.id !== proposalId);
    edited.sources = proposal.sources;
    this.save(edited);
    return edited;
  }
  remove(kind: string, id: string) {
    this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id);
  }
  connections() {
    return this.list<Connection>('connection');
  }
  close() {
    this.db.close();
  }
}
