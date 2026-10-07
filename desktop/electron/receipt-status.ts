import type { Policy } from './policy';

/** Permission to send images is separate from the selected transport's capability. */
export function receiptReadingMode(policy: Pick<Policy, 'features' | 'checks'>, provider?: string) {
  const permitted = policy.features.vision && policy.features.receiptVision && !policy.checks.privacy;
  const capable = !provider || ['openai', 'claude', 'gemini'].includes(provider);
  return { vision: permitted && capable, textOnly: Boolean(provider) && !(permitted && capable) };
}
