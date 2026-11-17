// What the AI did and thought on the way to an answer, kept with the answer instead of vanishing when it arrives (as
// Gemini Enterprise and Claude show it). Main records it while a run works and saves it on the assistant message; the
// window records the same events to show it live. It stays on this computer and is never sent back to a model.

/** One thought: a model's reasoning summary often comes as a bold heading and a paragraph. */
export type ThinkingNote = { title?: string; text: string };
/** One stage of the run (a Skill read, a web search, a plan step); an untitled stage holds thoughts before the first one. */
export type ThinkingStep = { title: string; ms: number; notes: ThinkingNote[] };
export type Thinking = { ms: number; steps: ThinkingStep[] };

/** A long run keeps its latest stages and reasoning, so a saved conversation never grows without bound. */
export const THINKING_STEPS = 40,
  THINKING_CHARS = 20000;

/** Splits reasoning into thoughts at `**Heading**` lines (Gemini and Codex summaries); plain reasoning is one thought. */
export function splitThoughts(text: string): ThinkingNote[] {
  const notes: ThinkingNote[] = [];
  let current: ThinkingNote = { text: '' };
  const close = () => {
    current.text = current.text.replace(/\n{3,}/g, '\n\n').trim();
    if (current.title || current.text) notes.push(current);
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = /^\s*\*\*([^*\n]{1,160})\*\*\s*$/.exec(line);
    if (heading) {
      close();
      current = { title: heading[1].trim(), text: '' };
    } else current.text += line + '\n';
  }
  close();
  return notes;
}

/** Collects a run's stages and reasoning as they arrive; `result` is what the answer keeps. */
export class ThinkingLog {
  private stages: { title: string; at: number; reasoning: string }[] = [];
  private chars = 0;
  constructor(private started = Date.now()) {}

  /** A new stage; the same title twice in a row is one stage (a retry or a repeated status). */
  step(title: string, at = Date.now()) {
    const clean = title.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!clean || this.stages.at(-1)?.title === clean) return false;
    this.stages.push({ title: clean, at, reasoning: '' });
    if (this.stages.length > THINKING_STEPS) this.chars -= this.stages.shift()!.reasoning.length;
    return true;
  }

  /** Reasoning text streamed by the model; it belongs to the stage in progress. */
  reason(text: string) {
    if (!text) return false;
    if (!this.stages.length) this.stages.push({ title: '', at: this.started, reasoning: '' });
    this.stages.at(-1)!.reasoning += text;
    this.chars += text.length;
    // Over the limit, the oldest reasoning goes first: the latest thoughts explain the answer best.
    for (const stage of this.stages) {
      if (this.chars <= THINKING_CHARS) break;
      const cut = Math.min(stage.reasoning.length, this.chars - THINKING_CHARS);
      stage.reasoning = stage.reasoning.slice(cut);
      this.chars -= cut;
    }
    return true;
  }

  /** A model turn ended: the next reasoning starts a new paragraph instead of running on. */
  turn() {
    const last = this.stages.at(-1);
    if (last?.reasoning.trim() && !last.reasoning.endsWith('\n\n')) last.reasoning += '\n\n';
  }

  get empty() {
    return !this.stages.some(stage => stage.title || stage.reasoning.trim());
  }

  /** The stages with their durations, or nothing when the run neither thought aloud nor did anything worth showing. */
  result(end = Date.now()): Thinking | undefined {
    const steps = this.stages
      .map((stage, i) => ({
        title: stage.title,
        ms: Math.max(0, (this.stages[i + 1]?.at ?? end) - stage.at),
        notes: splitThoughts(stage.reasoning),
      }))
      .filter(step => step.title || step.notes.length);
    return steps.length ? { ms: Math.max(0, end - this.started), steps } : undefined;
  }
}

/** Only well-formed thinking from a saved conversation is shown (older or edited records may hold anything). */
export function savedThinking(value: unknown): Thinking | undefined {
  const raw = value as Thinking | undefined;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.steps)) return undefined;
  const steps = raw.steps
    .filter(step => step && typeof step.title === 'string' && Array.isArray(step.notes))
    .map(step => ({
      title: step.title,
      ms: Number.isFinite(step.ms) ? step.ms : 0,
      notes: step.notes.filter(
        note => note && typeof note.text === 'string' && (note.title === undefined || typeof note.title === 'string'),
      ),
    }));
  return steps.length ? { ms: Number.isFinite(raw.ms) ? raw.ms : 0, steps } : undefined;
}
