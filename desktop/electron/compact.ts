import { estimateTextTokens } from '../../src/modules/context-budget/index.js';
import { section } from './prompt';

/** The budget when the model's context window is not known (a custom endpoint, a local Ollama model). */
export const CONTEXT_TOKENS = 48_000;
/** Cap host context even on a 1M-token model; retained sessions may still bill the full conversation. */
export const MAX_CONTEXT_TOKENS = 160_000;

/**
 * Context window, in tokens, of the models this app connects to, from the providers' published limits. The first match
 * wins; a model not listed uses its provider's default; anything else keeps the conservative CONTEXT_TOKENS.
 */
const WINDOWS: [RegExp, number][] = [
  [/gemini/i, 1_000_000],
  [/claude|opus|sonnet|haiku|fable/i, 200_000],
  [/gpt-4\.1/i, 1_000_000],
  [/gpt-[5-9]|codex/i, 400_000],
  [/\bo[134]\b|\bo[134]-/i, 200_000],
  [/gpt-4o|gpt-4-turbo/i, 128_000],
  [/minimax/i, 200_000],
  [/grok/i, 256_000],
  [/qwen|deepseek|mistral|llama|kimi|glm/i, 128_000],
];
const PROVIDER_WINDOWS: Record<string, number> = {
  claude: 200_000,
  gemini: 1_000_000,
  antigravity: 1_000_000,
  openai: 400_000,
  copilot: 128_000,
};
const PRESET_WINDOWS: Record<string, number> = {
  deepseek: 128_000,
  qwen: 128_000,
  minimax: 200_000,
  groq: 128_000,
  mistral: 128_000,
  xai: 256_000,
};

/**
 * How many prompt tokens to send before compacting: 60% of the model's window (the rest is for the answer, the system
 * prompt and estimation error), between CONTEXT_TOKENS and MAX_CONTEXT_TOKENS. Unknown models and custom runtimes keep CONTEXT_TOKENS.
 */
export function contextBudget(connection: {
  provider?: string;
  model?: string;
  preset?: string;
  customRuntime?: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
}) {
  if (Number.isSafeInteger(connection.contextWindow) && connection.contextWindow! >= 512 && connection.contextWindow! <= 2_000_000) {
    const window = connection.contextWindow!;
    const output = connection.maxOutputTokens || Math.min(8192, Math.floor(window * 0.4));
    return Math.min(MAX_CONTEXT_TOKENS, Math.floor(window * 0.6), Math.max(1, window - output - Math.ceil(window * 0.05)));
  }
  // A runtime the organization points at its own executable may run any model.
  if (connection.customRuntime) return CONTEXT_TOKENS;
  const model = String(connection.model || '');
  const window =
    WINDOWS.find(([pattern]) => model && pattern.test(model))?.[1] ??
    (connection.preset ? PRESET_WINDOWS[connection.preset] : undefined) ??
    (connection.provider && connection.provider !== 'compatible' ? PROVIDER_WINDOWS[connection.provider] : undefined);
  if (!window) return CONTEXT_TOKENS;
  const budget = Math.min(MAX_CONTEXT_TOKENS, Math.max(CONTEXT_TOKENS, Math.floor(window * 0.6)));
  return connection.maxOutputTokens
    ? Math.min(budget, Math.max(1, window - connection.maxOutputTokens - Math.ceil(window * 0.05)))
    : budget;
}
type Part = { tag: string; text: string };
export type CompactResult = { prompt: string; before: number; after: number; method: 'none' | 'micro' | 'summary' };
export type CompactOptions = {
  system: string;
  state: string;
  budget?: number;
  reactive?: boolean;
  signal: AbortSignal;
  summarize: (data: string) => Promise<string>;
  privacy: (text: string) => string;
  hook?: (event: 'pre_compact' | 'post_compact', before: number, after: number) => Promise<void>;
};
export const tokens = (text: string): number => estimateTextTokens(text).estimatedTokens;
export function promptTooLong(error: unknown) {
  return (
    error instanceof Error &&
    /CONTEXT_LIMIT|PROMPT_TOO_LONG|context.{0,20}(?:length|window|exceed)|prompt.{0,15}too long|maximum.{0,15}tokens/i.test(error.message)
  );
}
const parts = (prompt: string): Part[] => [...prompt.matchAll(/<([a-z_]+)>\n([\s\S]*?)\n<\/\1>/g)].map(m => ({ tag: m[1], text: m[2] }));
const render = (items: Part[]) => items.map(p => section(p.tag, p.text)).join('\n\n');
const preview = (text: string, limit: number) =>
  text.length > limit ? text.slice(0, limit) + '\n[Compacted preview; full content remains in local session/tool cache.]' : text;

/** Never shorten standing governance, the current request, route, or the host task-state envelope. */
export async function compact(prompt: string, options: CompactOptions): Promise<CompactResult> {
  const before = tokens(options.system + prompt);
  const budget = options.budget ?? CONTEXT_TOKENS;
  if (!options.reactive && before <= budget) return { prompt, before, after: before, method: 'none' };
  if (options.signal.aborted) throw new Error('CANCELLED');
  await options.hook?.('pre_compact', before, before);
  const items = parts(prompt).filter(p => p.tag !== 'task_state');
  // Keep non-tagged host text verbatim (including retrieval citation requirements).
  const outside = prompt.replace(/<([a-z_]+)>\n[\s\S]*?\n<\/\1>/g, '').trim();
  const lastResult = items.map(p => p.tag).lastIndexOf('tool_results');
  for (const [index, p] of items.entries()) {
    if (p.tag === 'conversation_files') {
      const chunks = p.text.split(/\n--- /);
      p.text = chunks.map((chunk, i) => (i && i < chunks.length - 1 ? preview(chunk, 1500) : chunk)).join('\n--- ');
    }
    if (p.tag === 'tool_results' && index !== lastResult) {
      try {
        const results = JSON.parse(p.text);
        if (Array.isArray(results))
          p.text = JSON.stringify(results.map(r => ({ ...r, ...(typeof r.text === 'string' ? { text: preview(r.text, 500) } : {}) })));
      } catch {
        /* Invalid result text stays inert. */
      }
    }
  }
  const build = () => render(items) + '\n\n' + outside + '\n\n' + section('task_state', options.state);
  let value = build();
  let method: CompactResult['method'] = 'micro';
  if (options.reactive || tokens(options.system + value) > budget) {
    const conversation = items.find(p => p.tag === 'conversation');
    let messages: any[] = [];
    try {
      messages = JSON.parse(conversation?.text || '[]');
    } catch {
      /* Invalid history is discarded, never treated as instructions. */
    }
    if (Array.isArray(messages) && messages.length > 2 && conversation) {
      const old = messages.slice(0, -2);
      // Several bounded calls avoid asking an already over-full provider to summarize its oversized prompt.
      const chunks: string[] = [];
      let batch = '';
      for (const m of old) {
        const line = JSON.stringify({ role: m.role, text: preview(String(m.text || ''), 6000) });
        if (tokens(batch + line) > 6000 && batch) {
          chunks.push(batch);
          batch = '';
        }
        batch += line + '\n';
      }
      if (batch) chunks.push(batch);
      const summaries: string[] = [];
      if (chunks.length > 12)
        summaries.push('[Some older turns omitted from this bounded summary. The complete transcript remains local.]');
      for (const chunk of chunks.slice(-12)) {
        if (options.signal.aborted) throw new Error('CANCELLED');
        summaries.push(preview(options.privacy(await options.summarize(chunk)), 2500));
      }
      conversation.text = JSON.stringify(messages.slice(-2));
      items.push({ tag: 'context_summary', text: summaries.join('\n\n') });
      method = 'summary';
      value = build();
    }
    // Reactive retry also makes old file/tool previews smaller. The latest source remains complete.
    if (options.reactive) {
      for (const p of items) {
        if (p.tag === 'tool_history') p.text = preview(p.text, 1500);
      }
      value = build();
    }
  }
  const after = tokens(options.system + value);
  if (after > budget || (options.reactive && after >= before)) throw new Error('CONTEXT_LIMIT');
  if (options.signal.aborted) throw new Error('CANCELLED');
  await options.hook?.('post_compact', before, after);
  return { prompt: value, before, after, method };
}
