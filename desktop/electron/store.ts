import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Connection, DraftMeta, Session, Settings } from '../src/types';
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
    delete s.coordination;
    delete s.subtask;
    delete s.sideQuestions;
    delete s.lastRun;
    delete s.resumeReads;
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
  /**
   * Start a different document from the conversation in the same task: a conversation is one task, so it never splits.
   * The current draft (and an AI draft still waiting for review) go to the version history with their own document type
   * and request, so they can be restored; the new document then starts from a blank page with its own Skill and layout.
   */
  startConversationDocument(id: string) {
    const session = this.session(id);
    if (['running', 'queued'].includes(session.status)) throw new Error('RUN_ALREADY_ACTIVE');
    this.shelveDocument(session);
    delete session.documentTool;
    delete session.documentVariant;
    this.save(session);
    return session;
  }
  /** Restore a version. One drafted as another document type brings back its own type, layout and request too. */
  restore(id: string, revision: number) {
    const session = this.session(id),
      version = session.versions.find(v => v.revision === revision);
    if (!version) throw new Error('VERSION_NOT_FOUND');
    const restoredMeta: DraftMeta = {
      origin: 'restore',
      ...(version.label ? { label: version.label } : {}),
      restoredFrom: version.restoredFrom ?? version.revision,
    };
    const sameDocument =
      (version.documentTool || undefined) === (session.documentTool || undefined) &&
      (version.documentVariant || undefined) === (session.documentVariant || undefined);
    if (sameDocument) return this.edit(id, version.text, session.revision, version.document, version.presentation || {}, restoredMeta);
    if (['running', 'queued'].includes(session.status)) throw new Error('RUN_ALREADY_ACTIVE');
    if (version.document)
      for (const key of documentImageIds(validateDocument(version.document))) {
        if (this.get<{ sessionId: string }>('document-asset', key)?.sessionId !== id) throw new Error('DOCUMENT_IMAGE_NOT_FOUND');
      }
    this.shelveDocument(session);
    session.draft = version.text;
    session.draftMeta = restoredMeta;
    if (version.document) session.document = version.document;
    if (version.presentation) session.presentation = version.presentation;
    if (version.documentTool) session.documentTool = version.documentTool;
    else delete session.documentTool;
    if (version.documentVariant) session.documentVariant = version.documentVariant;
    else delete session.documentVariant;
    if (version.task) {
      session.originalQuery = version.task.originalQuery;
      session.answers = [...version.task.answers];
      session.followUps = [...version.task.followUps];
      session.skill = version.task.skill;
      session.contextStart = version.task.contextStart;
    }
    this.save(session);
    return session;
  }
  /** Move the current document, and its latest pending AI draft, into the version history and leave a blank page. */
  private shelveDocument(session: Session) {
    const at = new Date().toISOString();
    const task = session.documentTask || {
      originalQuery: session.originalQuery,
      answers: [...session.answers],
      followUps: [...(session.followUps || [])],
      ...(session.skill ? { skill: session.skill } : {}),
      ...(session.contextStart !== undefined ? { contextStart: session.contextStart } : {}),
    };
    const kind = {
      ...(session.documentTool ? { documentTool: session.documentTool } : {}),
      ...(session.documentVariant ? { documentVariant: session.documentVariant } : {}),
    };
    // Legacy untagged versions of the current document get tagged once; already-shelved generic drafts stay untyped.
    if (session.documentTool)
      for (const version of session.versions)
        if (
          (!version.documentTool && !version.task && version.origin !== 'shelved') ||
          (version.documentTool === session.documentTool && version.documentVariant === session.documentVariant && !version.task)
        )
          Object.assign(version, kind, { task });
    const keep = (text: string, document: Session['document'], meta?: DraftMeta) => {
      session.versions.push({
        revision: session.revision,
        text,
        document,
        presentation: session.presentation,
        ...kind,
        ...(meta?.origin ? { origin: meta.origin } : {}),
        ...(meta?.label ? { label: meta.label } : {}),
        ...(meta?.restoredFrom !== undefined ? { restoredFrom: meta.restoredFrom } : {}),
        task,
        at,
      });
      session.revision++;
    };
    if (session.draft.trim() || session.document)
      keep(session.draft, session.document, {
        origin: session.draftMeta?.origin ?? 'shelved',
        ...(session.draftMeta?.label ? { label: session.draftMeta.label } : {}),
        ...(session.draftMeta?.restoredFrom !== undefined ? { restoredFrom: session.draftMeta.restoredFrom } : {}),
      });
    const pending = session.proposals.at(-1);
    if (pending?.text.trim()) {
      const output = session.documentTool ? parseDocumentOutput(pending.text, session.documentTool) : { draft: pending.text };
      keep(output.draft, pending.document || markdownDocument(output.draft), {
        origin: 'ai',
        ...(pending.prompt ? { label: pending.prompt } : {}),
      });
    }
    session.draft = '';
    session.proposals = [];
    delete session.draftMeta;
    delete session.document;
    delete session.presentation;
    delete session.documentReview;
    delete session.documentTemplate;
    delete session.documentTask;
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
  saveResumeReads(id: string, reads: NonNullable<Session['resumeReads']>) {
    // This changes only recovery metadata. The transcript and its search index stay intact.
    this.db
      .prepare(
        "UPDATE records SET value=json_set(value,'$.resumeReads',json(?)) WHERE kind='session' AND id=? AND json_extract(value,'$.status')='running'",
      )
      .run(JSON.stringify(reads), id);
  }
  edit(id: string, text: string, baseRevision: number, document?: unknown, presentation?: unknown, meta?: DraftMeta) {
    const session = this.session(id);
    if (session.revision !== baseRevision) throw new Error('DRAFT_CONFLICT');
    const normalized = document === undefined ? undefined : validateDocument(document);
    if (normalized)
      for (const key of documentImageIds(normalized)) {
        if (this.get<{ sessionId: string }>('document-asset', key)?.sessionId !== id) throw new Error('DOCUMENT_IMAGE_NOT_FOUND');
      }
    const appearanceInput = presentation === undefined ? session.presentation : presentation;
    const appearance = appearanceInput === undefined ? undefined : resolvePresentation(appearanceInput, session.documentTool || false);
    if (
      appearance?.invitation &&
      (session.documentTool !== 'letter' || session.documentVariant !== 'invitation' || session.documentTemplate)
    )
      throw new Error('INVALID_DOCUMENT_PRESENTATION');
    if (session.documentVariant === 'invitation' && !appearance?.invitation) throw new Error('INVALID_DOCUMENT_PRESENTATION');
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
        ...(session.documentTool ? { documentTool: session.documentTool } : {}),
        ...(session.documentVariant ? { documentVariant: session.documentVariant } : {}),
        ...(session.draftMeta?.origin ? { origin: session.draftMeta.origin } : {}),
        ...(session.draftMeta?.label ? { label: session.draftMeta.label } : {}),
        ...(session.draftMeta?.restoredFrom !== undefined ? { restoredFrom: session.draftMeta.restoredFrom } : {}),
        at: new Date().toISOString(),
      });
      session.draft = text;
      session.document = normalized;
      session.presentation = appearance;
      session.draftMeta = meta ?? { origin: 'manual' };
      session.revision++;
      this.save(session);
    }
    return session;
  }
  accept(id: string, proposalId: string, replaceRevision?: number) {
    const session = this.session(id),
      proposal = session.proposals.find(p => p.id === proposalId);
    if (!proposal) throw new Error('PROPOSAL_NOT_FOUND');
    // A reviewed replacement names the exact current revision; ordinary acceptance still rejects stale proposals.
    if (replaceRevision !== undefined && (!Number.isSafeInteger(replaceRevision) || replaceRevision < 0)) throw new Error('DRAFT_CONFLICT');
    // Proposals are Markdown from the model; keep their headings, lists, and emphasis in the editable draft.
    const output = session.documentTool ? parseDocumentOutput(proposal.text, session.documentTool) : { draft: proposal.text, review: '' };
    const edited = this.edit(
      id,
      output.draft,
      replaceRevision ?? proposal.baseRevision,
      proposal.document || markdownDocument(output.draft),
      undefined,
      { origin: 'ai', ...(proposal.prompt ? { label: proposal.prompt } : {}) },
    );
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
    const prevUser = session.messages
      .slice(0, index)
      .reverse()
      .find(m => m.role === 'user')?.text;
    const prompt = prevUser ? prevUser.replace(/\s+/g, ' ').trim().slice(0, 120) : undefined;
    if (!session.documentTool)
      return this.edit(id, message.text, session.revision, markdownDocument(message.text), undefined, {
        origin: 'ai',
        ...(prompt ? { label: prompt } : {}),
      });
    const output = parseDocumentOutput(message.text, session.documentTool);
    session.proposals = [
      {
        id: randomUUID(),
        text: output.draft,
        ...(output.review ? { review: output.review } : {}),
        baseRevision: session.revision,
        ...(prompt ? { prompt } : {}),
        sources: session.sources || [],
        at: new Date().toISOString(),
      },
    ];
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
