import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Store } from './store';
import { safeMemory } from './memory';
import type { LessonContent, LearningCandidate, LearningSnapshot, LearnedLesson } from '../src/learning-types';

type Saved = Omit<LearningSnapshot, 'context'>;
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const current = (lesson: LearnedLesson) => lesson.revisions[lesson.revisions.length - 1];
const checkedText = (value: unknown, max: number) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('LEARNING_INVALID');
  return value.trim();
};

/** User-reviewed local lessons, never executable Skills or organization policy. A single
 * SQLite record atomically commits each candidate + release, with optimistic revisions. */
export class Learning {
  constructor(
    private store: Store,
    private data: string,
    private privacy: (text: string) => any,
  ) {}
  context() {
    const s = this.store.settings();
    return digest(JSON.stringify([resolve(s.workspace || this.data), s.team]));
  }
  snapshot(): LearningSnapshot {
    const context = this.context();
    return { context, ...(this.store.get<Saved>('learning', context) || { generation: 0, candidates: [], lessons: [] }) };
  }
  private check(context: unknown) {
    if (context !== this.context()) throw new Error('WORKSPACE_CHANGED');
    return this.snapshot();
  }
  private commit(state: LearningSnapshot) {
    if (state.context !== this.context()) throw new Error('WORKSPACE_CHANGED');
    const { context, ...saved } = state;
    saved.generation++;
    if (Buffer.byteLength(JSON.stringify(saved), 'utf8') > 8_000_000) throw new Error('LEARNING_LIMIT');
    this.store.put('learning', context, saved);
  }
  private content(raw: any): LessonContent {
    if (!raw || !['preference', 'procedure'].includes(raw.kind)) throw new Error('LEARNING_INVALID');
    const value: LessonContent = {
      name: checkedText(raw.name, 120),
      kind: raw.kind,
      trigger: raw.kind === 'procedure' ? checkedText(raw.trigger, 160) : '',
      text: checkedText(raw.text, 4000),
    };
    if (value.kind === 'procedure' && !value.trigger.split(/[,\n]/).some(t => t.trim().length >= 2)) throw new Error('LEARNING_INVALID');
    // Learning keeps durable data: use the full scanner supplied by the host even
    // when ordinary chat privacy checks are disabled.
    safeMemory([value.name, value.trigger, value.text].join('\n'), this.privacy);
    return value;
  }
  propose(context: unknown, raw: any, source: LearningCandidate['source'] = 'manual', sessionId?: string) {
    const state = this.check(context),
      content = this.content(raw?.content);
    const evidence = safeMemory(checkedText(raw?.evidence, 2000), this.privacy);
    if (state.candidates.filter(c => c.status === 'pending').length >= 20) throw new Error('LEARNING_LIMIT');
    const lesson = raw.lessonId ? state.lessons.find(l => l.id === raw.lessonId) : undefined;
    if (raw.lessonId && !lesson) throw new Error('LEARNING_NOT_FOUND');
    if (lesson && current(lesson).revision !== raw.baseRevision) throw new Error('LEARNING_CONFLICT');
    if (!lesson && state.lessons.length >= 100) throw new Error('LEARNING_LIMIT');
    const duplicate = state.candidates.find(
      c =>
        c.status === 'pending' &&
        (lesson ? c.lessonId === lesson.id : c.baseRevision === 0) &&
        JSON.stringify(c.content) === JSON.stringify(content) &&
        c.evidence === evidence,
    );
    if (duplicate) return duplicate;
    const candidate: LearningCandidate = {
      id: randomUUID(),
      lessonId: lesson?.id || randomUUID(),
      baseRevision: lesson ? current(lesson).revision : 0,
      content,
      evidence,
      source,
      ...(sessionId ? { sessionId } : {}),
      at: new Date().toISOString(),
      status: 'pending',
    };
    // Bound decision history while keeping candidates referenced by a release.
    const referenced = new Set(state.lessons.flatMap(l => l.revisions.map(r => r.candidateId)));
    state.candidates = state.candidates.filter(c => c.status === 'pending' || referenced.has(c.id)).concat(candidate);
    this.commit(state);
    return candidate;
  }
  importFeedback(context: unknown, proposal: import('../src/types').MemoryProposal) {
    this.check(context);
    const s = this.store.settings();
    const saved = this.store.get<import('../src/types').MemoryProposal>('memory-proposal', proposal.id);
    if (!saved || saved.context !== digest([resolve(s.workspace || this.data), s.team].join('\0'))) throw new Error('LEARNING_NOT_FOUND');
    proposal = saved;
    return this.store.transaction(() => {
      const candidate = this.propose(
        context,
        { content: { name: proposal.name, kind: 'preference', trigger: '', text: proposal.text }, evidence: proposal.evidence },
        'feedback',
        proposal.sessionId,
      );
      this.store.remove('memory-proposal', proposal.id);
      return candidate;
    });
  }
  revise(context: unknown, id: unknown, content: unknown) {
    const candidate = this.check(context).candidates.find(c => c.id === id && c.status === 'pending');
    if (!candidate) throw new Error('LEARNING_NOT_FOUND');
    return this.store.transaction(() => {
      this.decide(context, id, false);
      return this.propose(
        context,
        {
          content,
          evidence: candidate.evidence,
          ...(candidate.baseRevision ? { lessonId: candidate.lessonId, baseRevision: candidate.baseRevision } : {}),
        },
        candidate.source,
        candidate.sessionId,
      );
    });
  }
  decide(context: unknown, id: unknown, approve: boolean) {
    const state = this.check(context),
      candidate = state.candidates.find(c => c.id === id && c.status === 'pending');
    if (!candidate) throw new Error('LEARNING_NOT_FOUND');
    if (approve) {
      this.content(candidate.content);
      safeMemory(candidate.evidence, this.privacy);
      let lesson = state.lessons.find(l => l.id === candidate.lessonId);
      if ((lesson ? current(lesson).revision : 0) !== candidate.baseRevision) throw new Error('LEARNING_CONFLICT');
      if (!lesson) {
        if (state.lessons.length >= 100) throw new Error('LEARNING_LIMIT');
        lesson = { id: candidate.lessonId, revisions: [] };
        state.lessons.push(lesson);
      }
      if (lesson.revisions.length >= 100) throw new Error('LEARNING_LIMIT');
      lesson.revisions.push({
        revision: candidate.baseRevision + 1,
        content: candidate.content,
        candidateId: candidate.id,
        at: new Date().toISOString(),
      });
    }
    candidate.status = approve ? 'approved' : 'rejected';
    this.commit(state);
  }
  restore(context: unknown, id: unknown, expected: unknown, target: unknown) {
    const state = this.check(context),
      lesson = state.lessons.find(l => l.id === id);
    if (!lesson) throw new Error('LEARNING_NOT_FOUND');
    if (current(lesson).revision !== expected) throw new Error('LEARNING_CONFLICT');
    if (target === 0 && !current(lesson).content) return;
    // The history cap must never prevent disabling an active lesson.
    if (target !== 0 && lesson.revisions.length >= 100) throw new Error('LEARNING_LIMIT');
    const previous = target === 0 ? null : lesson.revisions.find(r => r.revision === target);
    if (target !== 0 && !previous) throw new Error('LEARNING_NOT_FOUND');
    const content = previous?.content ? this.content(previous.content) : null;
    lesson.revisions.push({
      revision: current(lesson).revision + 1,
      content,
      restoredFrom: target as number,
      at: new Date().toISOString(),
    });
    this.commit(state);
  }
  relevant(query: string) {
    const selected: { id: string; revision: number; name: string; text: string; type: string; scope: string }[] = [];
    let chars = 0;
    for (const lesson of this.snapshot().lessons) {
      const revision = current(lesson),
        content = revision.content;
      if (!content) continue;
      if (
        content.kind === 'procedure' &&
        !content.trigger
          .split(/[,\n]/)
          .map(s => s.trim().toLowerCase())
          .filter(t => t.length >= 2)
          .some(t => query.toLowerCase().includes(t))
      )
        continue;
      try {
        this.content(content);
      } catch {
        continue;
      }
      if (selected.length >= 5 || chars + content.text.length > 8000) continue;
      chars += content.text.length;
      selected.push({
        id: lesson.id,
        revision: revision.revision,
        name: content.name,
        text: content.text,
        type: content.kind,
        scope: 'workspace-team',
      });
    }
    return selected;
  }
}
