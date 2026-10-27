import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Session, Connection, Settings } from '../src/types';
import { documentText, markdownDocument, validateDocument, documentImageIds } from '../src/draft';
import { parseDocumentOutput } from '../src/document-output';
import { resolvePresentation } from '../src/document-presentation';
import type { DocumentAssetRecord } from './document-assets';

export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id)); CREATE VIRTUAL TABLE IF NOT EXISTS session_search USING fts5(id UNINDEXED, content, tokenize="trigram"); PRAGMA user_version=2;',
    );
    // Interrupted jobs are never replayed automatically.
    for (const session of this.list<Session>('session')) {
      const longInterrupted = session.longTask?.status === 'running';
      if (longInterrupted) session.longTask!.status = 'interrupted';
      const sideInterrupted = session.sideQuestions?.some(question => question.status === 'running');
      for (const question of session.sideQuestions || [])
        if (question.status === 'running') {
          question.status = 'error';
          question.code = 'RUN_INTERRUPTED';
        }
      if (session.status === 'running' || session.status === 'queued') {
        session.status = 'interrupted';
        this.put('session', session.id, session);
      } else if (sideInterrupted || longInterrupted) this.put('session', session.id, session);
    }
    // Rebuild at startup to backfill older databases and recover an interrupted index update.
    this.db.exec('DELETE FROM session_search');
    for (const session of this.list<Session>('session')) this.index(session);
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind, id);
    return row ? JSON.parse(String(row.value)) : undefined;
  }
  put(kind: string, id: string, value: unknown) {
    this.db
      .prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value')
      .run(kind, id, JSON.stringify(value));
    if (kind === 'session') this.index(value as Session);
  }
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private index(s: Session) {
    this.db.prepare('DELETE FROM session_search WHERE id=?').run(s.id);
    this.db
      .prepare('INSERT INTO session_search(id,content) VALUES (?,?)')
      .run(
        s.id,
        [
          s.title,
          s.project,
          s.draft,
          ...s.messages.filter(m => m.role !== 'status').map(m => m.text),
          ...(s.files || []).map(f => f.name + '\n' + f.text),
        ].join('\n'),
      );
  }
  search(query: string) {
    const text = query.trim().slice(0, 200);
    if (!text) return this.list<Session>('session').map(s => s.id);
    // Quote the literal phrase: user input can never become FTS query operators or SQL.
    if ([...text].length >= 3)
      return this.db
        .prepare('SELECT id FROM session_search WHERE session_search MATCH ? LIMIT 200')
        .all('"' + text.replace(/"/g, '""') + '"')
        .map(r => String(r.id));
    return this.db
      .prepare('SELECT id FROM session_search WHERE instr(lower(content),lower(?)) > 0 LIMIT 200')
      .all(text)
      .map(r => String(r.id));
  }
  fork(id: string) {
    const source = this.session(id);
    if (['running', 'queued'].includes(source.status)) throw new Error('RUN_ALREADY_ACTIVE');
    const s = structuredClone(source);
    s.id = randomUUID();
    s.parentId = source.id;
    s.title = source.title + ' (fork)';
    s.status = 'idle';
    delete s.checkpoint;
    delete s.contextCheckpoint;
    delete s.longTask;
    delete s.sideQuestions;
    delete s.lastRun;
    delete s.consentedAt;
    delete s.allowedIdentifiers;
    delete s.usage;
    delete s.images;
    delete s.runs;
    delete s.approvedPlan;
    delete s.workPlan;
    delete s.documentTemplate;
    return this.transaction(() => {
      const replacements = new Map<string, string>();
      for (const asset of this.list<DocumentAssetRecord>('document-asset')) {
        if (asset.sessionId !== id) continue;
        const key = randomUUID();
        replacements.set(asset.key, key);
        this.put('document-asset', key, { ...asset, key, sessionId: s.id });
      }
      // Remap structured nodes and opaque Markdown tokens in all retained versions and proposals.
      const remap = (value: unknown): unknown => {
        if (typeof value === 'string')
          return (
            replacements.get(value) ??
            value.replace(/step-asset:([0-9a-f-]{36})/gi, (token, key) =>
              replacements.has(key) ? 'step-asset:' + replacements.get(key) : token,
            )
          );
        if (Array.isArray(value)) return value.map(remap);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item)]));
        return value;
      };
      const forked = remap(s) as Session;
      this.save(forked);
      return forked;
    });
  }
  resume(id: string) {
    const s = this.session(id);
    if (['running', 'queued'].includes(s.status)) throw new Error('RUN_ALREADY_ACTIVE');
    // Opening a session does not replay a model request or authorize a previous effect.
    return s;
  }
  exportSession(id: string, format: string) {
    const s = this.session(id);
    if (format === 'json') {
      const {
        consentedAt: _consent,
        allowedIdentifiers: _ids,
        connectionId: _connection,
        lastRun: _run,
        checkpoint: _checkpoint,
        contextCheckpoint: _contextCheckpoint,
        documentTemplate: _template,
        ...data
      } = s;
      return JSON.stringify({ schema_version: 1, ...data }, null, 2);
    }
    if (format !== 'md') throw new Error('INVALID_EXPORT');
    return (
      '# ' +
      s.title +
      '\n\n' +
      s.messages.map(m => `## ${m.role}\n\n${m.text}`).join('\n\n') +
      (s.files?.length ? '\n\n## Files\n\n' + s.files.map(f => `### ${f.name}\n\n${f.text}`).join('\n\n') : '') +
      (s.draft ? '\n\n## Draft\n\n' + s.draft : '')
    );
  }
  list<T>(kind: string): T[] {
    return this.db
      .prepare('SELECT value FROM records WHERE kind=?')
      .all(kind)
      .map(r => JSON.parse(String(r.value)));
  }
  templateRecords(): { key: string; sessionId: string }[] {
    return this.db
      .prepare('SELECT id,value FROM records WHERE kind=?')
      .all('document-template')
      .map(row => ({ key: String(row.id), sessionId: JSON.parse(String(row.value)).sessionId }));
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
  edit(id: string, text: string, baseRevision: number, document?: unknown, presentation?: unknown) {
    const session = this.session(id);
    if (session.revision !== baseRevision) throw new Error('DRAFT_CONFLICT');
    const normalized = document === undefined ? undefined : validateDocument(document);
    if (normalized)
      for (const key of documentImageIds(normalized)) {
        if (this.get<{ sessionId: string }>('document-asset', key)?.sessionId !== id) throw new Error('DOCUMENT_IMAGE_NOT_FOUND');
      }
    const appearanceInput = presentation === undefined ? session.presentation : presentation;
    const appearance = appearanceInput === undefined ? undefined : resolvePresentation(appearanceInput, session.documentTool || false);
    if (session.documentTemplate && appearance) {
      const original = resolvePresentation(session.presentation, session.documentTool || true);
      if (
        (['preset', 'toc', 'headerText', 'footerText', 'pageNumber', 'pageNumberPosition'] as const).some(
          key => appearance[key] !== original[key],
        )
      )
        throw new Error('DOCUMENT_TEMPLATE_LAYOUT_LOCKED');
    }
    if (normalized) text = documentText(normalized);
    if (
      text !== session.draft ||
      JSON.stringify(normalized) !== JSON.stringify(session.document) ||
      JSON.stringify(appearance) !== JSON.stringify(session.presentation)
    ) {
      session.versions.push({
        revision: session.revision,
        text: session.draft,
        document: session.document,
        presentation: session.presentation,
        at: new Date().toISOString(),
      });
      session.draft = text;
      session.document = normalized;
      session.presentation = appearance;
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
    const output = session.documentTool ? parseDocumentOutput(proposal.text, session.documentTool) : { draft: proposal.text, review: '' };
    const edited = this.edit(id, output.draft, proposal.baseRevision, proposal.document || markdownDocument(output.draft));
    const review = [proposal.review, output.review].filter(Boolean).join('\n\n');
    if (review) edited.documentReview = { text: review, revision: edited.revision };
    else delete edited.documentReview;
    edited.proposals = edited.proposals.filter(p => p.id !== proposalId);
    edited.sources = proposal.sources;
    this.save(edited);
    return edited;
  }
  /**
   * "เปิดใน Output" on an answer. In a document task the answer becomes a proposal to compare and accept, without the
   * conversation around it; elsewhere it opens as structured Markdown. Neither overwrites a document's draft directly.
   */
  stageMessage(id: string, index: number) {
    const session = this.session(id),
      message = Number.isInteger(index) ? session.messages[index] : undefined;
    if (!message || message.role !== 'assistant' || message.draftSummary) throw new Error('MESSAGE_NOT_FOUND');
    if (!session.documentTool) return this.edit(id, message.text, session.revision, markdownDocument(message.text));
    const output = parseDocumentOutput(message.text, session.documentTool);
    session.proposals.push({
      id: randomUUID(),
      text: output.draft,
      ...(output.review ? { review: output.review } : {}),
      baseRevision: session.revision,
      sources: session.sources || [],
      at: new Date().toISOString(),
    });
    this.save(session);
    return session;
  }
  remove(kind: string, id: string) {
    this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id);
    if (kind === 'session') this.db.prepare('DELETE FROM session_search WHERE id=?').run(id);
  }
  connections() {
    return this.list<Connection>('connection');
  }
  close() {
    this.db.close();
  }
}
