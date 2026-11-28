import type { ModelPricing } from '../src/types';

export type CatalogModelInfo = {
  contextWindow: number;
  maxOutputTokens: number;
  pricing?: ModelPricing;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
};

type CatalogRule = {
  match: RegExp;
  info: CatalogModelInfo;
};

/**
 * Offline baseline specifications and published API list prices (USD per 1M tokens) for well-known models,
 * inspired by models.dev / Pi's static model catalog. Used only as fallback when neither administrator policy
 * nor live provider `/models` metadata supplies limits or prices. Unknown/synthetic models return undefined.
 */
const CATALOG_RULES: CatalogRule[] = [
  // Google Gemini
  {
    match: /^gemini-2\.5-pro(?:$|[-.])/,
    info: {
      contextWindow: 1_048_576,
      maxOutputTokens: 65_536,
      pricing: { input: 1.25, output: 10, cachedInput: 0.31 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },
  {
    match: /^gemini-2\.5-flash-lite(?:$|[-.])/,
    info: {
      contextWindow: 1_048_576,
      maxOutputTokens: 65_536,
      pricing: { input: 0.1, output: 0.4, cachedInput: 0.025 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },
  {
    match: /^gemini-2\.5-flash(?:$|[-.])/,
    info: {
      contextWindow: 1_048_576,
      maxOutputTokens: 65_536,
      pricing: { input: 0.3, output: 2.5, cachedInput: 0.075 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },
  {
    match: /^gemini-2\.0-flash-lite(?:$|[-.])/,
    info: {
      contextWindow: 1_048_576,
      maxOutputTokens: 8_192,
      pricing: { input: 0.075, output: 0.3 },
      supportsVision: true,
      supportsReasoning: false,
    },
  },
  {
    match: /^gemini-2\.0-flash(?:$|[-.])/,
    info: {
      contextWindow: 1_048_576,
      maxOutputTokens: 8_192,
      pricing: { input: 0.1, output: 0.4, cachedInput: 0.025 },
      supportsVision: true,
      supportsReasoning: false,
    },
  },
  {
    match: /^gemini-[3-9](?:$|[-.])/,
    info: {
      contextWindow: 1_048_576,
      maxOutputTokens: 65_536,
      pricing: { input: 1.25, output: 10, cachedInput: 0.31 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },

  // Anthropic Claude
  {
    match: /^claude-opus-4(?:[-.]5|[-.]6|[-.]7)?(?:$|[-.])/,
    info: {
      contextWindow: 200_000,
      maxOutputTokens: 32_000,
      pricing: { input: 15, output: 75, cachedInput: 1.5, cacheWriteInput: 18.75 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },
  {
    match: /^claude-sonnet-4(?:[-.][0-9])?(?:$|[-.])/,
    info: {
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
      pricing: { input: 3, output: 15, cachedInput: 0.3, cacheWriteInput: 3.75 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },
  {
    match: /^claude-haiku-4(?:[-.][0-9])?(?:$|[-.])/,
    info: {
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
      pricing: { input: 0.8, output: 4, cachedInput: 0.08, cacheWriteInput: 1 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },
  {
    match: /^claude-3[-.]7-sonnet(?:$|[-.])/,
    info: {
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
      pricing: { input: 3, output: 15, cachedInput: 0.3, cacheWriteInput: 3.75 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },
  {
    match: /^claude-3[-.]5-sonnet(?:$|[-.])/,
    info: {
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      pricing: { input: 3, output: 15, cachedInput: 0.3, cacheWriteInput: 3.75 },
      supportsVision: true,
      supportsReasoning: false,
    },
  },
  {
    match: /^claude-3[-.]5-haiku(?:$|[-.])/,
    info: {
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      pricing: { input: 0.8, output: 4, cachedInput: 0.08, cacheWriteInput: 1 },
      supportsVision: true,
      supportsReasoning: false,
    },
  },

  // OpenAI GPT / o-series / Codex
  {
    match: /^gpt-5(?:\.[0-9]+)?-mini(?:$|[-.])/,
    info: {
      contextWindow: 400_000,
      maxOutputTokens: 128_000,
      pricing: { input: 0.25, output: 2, cachedInput: 0.025 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },
  {
    match: /^gpt-5(?:\.[0-9]+)?-nano(?:$|[-.])/,
    info: {
      contextWindow: 400_000,
      maxOutputTokens: 128_000,
      pricing: { input: 0.05, output: 0.4, cachedInput: 0.005 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },
  {
    match: /^gpt-5(?:\.[0-9]+)?(?:$|[-.])/,
    info: {
      contextWindow: 400_000,
      maxOutputTokens: 128_000,
      pricing: { input: 1.25, output: 10, cachedInput: 0.125 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },
  {
    match: /^gpt-4\.1-mini(?:$|[-.])/,
    info: {
      contextWindow: 1_047_576,
      maxOutputTokens: 32_768,
      pricing: { input: 0.4, output: 1.6, cachedInput: 0.1 },
      supportsVision: true,
      supportsReasoning: false,
    },
  },
  {
    match: /^gpt-4\.1-nano(?:$|[-.])/,
    info: {
      contextWindow: 1_047_576,
      maxOutputTokens: 32_768,
      pricing: { input: 0.1, output: 0.4, cachedInput: 0.025 },
      supportsVision: true,
      supportsReasoning: false,
    },
  },
  {
    match: /^gpt-4\.1(?:$|[-.])/,
    info: {
      contextWindow: 1_047_576,
      maxOutputTokens: 32_768,
      pricing: { input: 2, output: 8, cachedInput: 0.5 },
      supportsVision: true,
      supportsReasoning: false,
    },
  },
  {
    match: /^gpt-4o-mini(?:$|[-.])/,
    info: {
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      pricing: { input: 0.15, output: 0.6, cachedInput: 0.075 },
      supportsVision: true,
      supportsReasoning: false,
    },
  },
  {
    match: /^gpt-4o(?:$|[-.])/,
    info: {
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      pricing: { input: 2.5, output: 10, cachedInput: 1.25 },
      supportsVision: true,
      supportsReasoning: false,
    },
  },
  {
    match: /^o4-mini(?:$|[-.])/,
    info: {
      contextWindow: 200_000,
      maxOutputTokens: 100_000,
      pricing: { input: 1.1, output: 4.4, cachedInput: 0.275 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },
  {
    match: /^o3-mini(?:$|[-.])/,
    info: {
      contextWindow: 200_000,
      maxOutputTokens: 100_000,
      pricing: { input: 1.1, output: 4.4, cachedInput: 0.55 },
      supportsVision: false,
      supportsReasoning: true,
    },
  },
  {
    match: /^o3(?:$|[-.])/,
    info: {
      contextWindow: 200_000,
      maxOutputTokens: 100_000,
      pricing: { input: 2, output: 8, cachedInput: 0.5 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },

  // DeepSeek
  {
    match: /^deepseek-(?:reasoner|r1)(?:$|[-.])/,
    info: {
      contextWindow: 128_000,
      maxOutputTokens: 64_000,
      pricing: { input: 0.55, output: 2.19, cachedInput: 0.14 },
      supportsVision: false,
      supportsReasoning: true,
    },
  },
  {
    match: /^deepseek-(?:chat|v3)(?:$|[-.])/,
    info: {
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
      pricing: { input: 0.27, output: 1.1, cachedInput: 0.07 },
      supportsVision: false,
      supportsReasoning: false,
    },
  },

  // Qwen / Alibaba DashScope
  {
    match: /^qwen(?:-max|3-max)(?:$|[-.])/,
    info: {
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      pricing: { input: 1.6, output: 6.4 },
      supportsVision: false,
      supportsReasoning: true,
    },
  },
  {
    match: /^qwen(?:-plus|3-235b|3-coder|3)(?:$|[-.])/,
    info: {
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      pricing: { input: 0.4, output: 1.2 },
      supportsVision: false,
      supportsReasoning: true,
    },
  },

  // MiniMax, Z.AI (GLM), Kimi (Moonshot), xAI (Grok), Mistral, Llama (Groq)
  {
    match: /^minimax-m[12](?:$|[-.])/,
    info: {
      contextWindow: 200_000,
      maxOutputTokens: 16_384,
      pricing: { input: 0.3, output: 1.2 },
      supportsVision: false,
      supportsReasoning: true,
    },
  },
  {
    match: /^glm-4\.[5-9](?:$|[-.])/,
    info: {
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      pricing: { input: 0.6, output: 2.2 },
      supportsVision: false,
      supportsReasoning: true,
    },
  },
  {
    match: /^kimi-k2(?:$|[-.])/,
    info: {
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      pricing: { input: 0.6, output: 2.5 },
      supportsVision: false,
      supportsReasoning: true,
    },
  },
  {
    match: /^grok-[34](?:$|[-.])/,
    info: {
      contextWindow: 256_000,
      maxOutputTokens: 32_768,
      pricing: { input: 3, output: 15, cachedInput: 0.75 },
      supportsVision: true,
      supportsReasoning: true,
    },
  },
  {
    match: /^mistral-large(?:$|[-.])/,
    info: {
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      pricing: { input: 2, output: 6 },
      supportsVision: false,
      supportsReasoning: false,
    },
  },
  {
    match: /^llama-3\.3-70b(?:$|[-.])/,
    info: {
      contextWindow: 128_000,
      maxOutputTokens: 32_768,
      pricing: { input: 0.59, output: 0.79 },
      supportsVision: false,
      supportsReasoning: false,
    },
  },
];

/** Strip OpenRouter/Google prefixes and variant suffixes (`:free`, `:thinking`) for clean catalog lookup. */
export function normalizeCatalogModelId(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let id = raw.trim().toLowerCase();
  if (!id) return '';
  if (id.startsWith('models/')) id = id.slice('models/'.length);
  const slash = id.indexOf('/');
  if (slash > 0) id = id.slice(slash + 1);
  const colon = id.indexOf(':');
  if (colon > 0) id = id.slice(0, colon);
  return id;
}

export function lookupCatalogModel(modelId?: string): CatalogModelInfo | undefined {
  const normalized = normalizeCatalogModelId(modelId);
  if (!normalized) return undefined;
  const hit = CATALOG_RULES.find(rule => rule.match.test(normalized));
  if (!hit) return undefined;
  return {
    ...hit.info,
    ...(hit.info.pricing ? { pricing: { ...hit.info.pricing } } : {}),
  };
}
