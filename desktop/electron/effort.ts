import type { Connection, EffortOption, ModelOption } from '../src/types';

// Reasoning effort by task size (rules/learning-and-verification.md, step 5 of the agent-learning plan). When the
// employee has not picked a level, a short question gets a light level, an ordinary task keeps the model's own default,
// and a large task (several steps, a plan, a long request or many files) gets a deeper level. The employee's choice
// always wins, only levels the model advertises are sent, and IT can turn this off with `features.autoEffort: false`.

export type TaskSize = 'small' | 'medium' | 'large';
export type TaskSignals = {
  chat: boolean;
  /** The employee's latest message. */
  text: string;
  /** Characters of attached or carried source text. */
  sourceChars: number;
  /** Attached files and images. */
  files: number;
  /** Model steps planned for this run (a Playbook has several). */
  steps: number;
  /** Plan permission mode: the AI must think the whole task through before acting. */
  plan: boolean;
  /** A follow-up that revises earlier work. */
  revising: boolean;
};

const SHORT = 200,
  LONG = 1500,
  BIG_SOURCE = 20_000,
  MANY_FILES = 3;

export function taskSize(s: TaskSignals): TaskSize {
  const text = s.text.trim();
  if (s.steps > 1 || s.plan || text.length > LONG || s.sourceChars > BIG_SOURCE || s.files >= MANY_FILES) return 'large';
  // Documents are never "small": a draft needs the model's normal care even when the request is short.
  if (s.chat && !s.revising && !s.files && !s.sourceChars && text.length <= SHORT && text.split('\n').length <= 3) return 'small';
  return 'medium';
}

const PREFERRED: Record<TaskSize, string | undefined> = { small: 'low', medium: undefined, large: 'high' };

/** The level to send for this size, or undefined for the model's default (also when the model lacks that level). */
export function autoEffort(efforts: EffortOption[] | undefined, size: TaskSize) {
  const wanted = PREFERRED[size];
  return wanted && efforts?.some(e => e.id === wanted) ? wanted : undefined;
}

/**
 * Antigravity model ids such as `gemini-3.8-flash-medium` already fix the reasoning level. agy rejects any extra
 * `--effort` for them ("--model ... conflicts with --effort=low"), so such a model offers no levels and gets no flag.
 */
export function effortInModel(model?: string) {
  return /-(?:low|medium|high|xhigh|max)$/.test(model || '');
}

/**
 * The connection for the first Skill selection attempt. agy takes no `--effort` with an id that names its level, so for
 * `gemini-3.8-flash-medium` (or -high, -xhigh, -max) it is the same model's `-low` id when agy lists it; otherwise the
 * connection is unchanged. The caller asks the chosen model again when the -low reply is malformed or fails. Only Skill
 * selection is measured (eval:selection, 2026-11-01); the answer, summary, check and repair keep the chosen model.
 */
export function auxiliaryConnection<T extends Pick<Connection, 'model' | 'models'> & { provider?: Connection['provider'] }>(
  connection: T,
): T {
  if (connection.provider !== 'antigravity') return connection;
  const base = /^(.+)-(?:medium|high|xhigh|max)$/.exec(connection.model || '')?.[1];
  const low = base && `${base}-low`;
  return low && connection.models?.some(m => m.id === low) ? { ...connection, model: low } : connection;
}

const ANTIGRAVITY_DEFAULT_EFFORTS: EffortOption[] = [{ id: 'low' }, { id: 'medium' }, { id: 'high' }];

/** The catalog entry of the model this connection will run, if the provider listed one. */
export function modelOption(
  connection?: Pick<Connection, 'model' | 'models'> & { provider?: Connection['provider'] },
): ModelOption | undefined {
  if (!connection) return undefined;
  const found =
    connection.models?.find(m => m.id === connection.model) || (!connection.model ? connection.models?.find(m => m.isDefault) : undefined);
  if (found?.efforts?.length || connection.provider !== 'antigravity' || !connection.model || effortInModel(connection.model)) return found;
  return { id: connection.model, label: found?.label || connection.model, efforts: ANTIGRAVITY_DEFAULT_EFFORTS };
}
