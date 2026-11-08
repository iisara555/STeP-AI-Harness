import type { ProviderUsageData } from './types';

/** Preserve reported sub-cent costs; display precision never changes accounting values. */
export function formatUsd(value: number) {
  return Number.isFinite(value) ? value.toFixed(value !== 0 && Math.abs(value) < 0.01 ? 4 : 2) : '—';
}

export function usageSourceName(source: ProviderUsageData['source'] | string) {
  const names: Record<ProviderUsageData['source'], string> = {
    codex: 'ChatGPT',
    claude: 'Claude',
    copilot: 'GitHub Copilot',
    antigravity: 'Antigravity',
    openrouter: 'OpenRouter',
    deepseek: 'DeepSeek',
    minimax: 'MiniMax',
    zai: 'Z.AI (GLM)',
    kimi: 'Kimi (Moonshot AI)',
  };
  return Object.hasOwn(names, source) ? names[source as ProviderUsageData['source']] : '—';
}
