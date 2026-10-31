import type { Policy } from './policy';
import type { Connection } from '../src/types';

export function isReceiptGeminiApi(connection?: Connection): connection is Connection {
  return Boolean(
    connection?.ready &&
    !connection.policyBlocked &&
    !connection.customRuntime &&
    connection.provider === 'gemini' &&
    connection.mode === 'api' &&
    /^gemini-[a-zA-Z0-9._-]{1,120}$/.test(connection.model),
  );
}

/** OCR account is independent of chat; a ready native Gemini API profile takes priority over local OCR. */
export function receiptGeminiConnection(connections: Connection[], preferredId?: string) {
  return (
    connections.find(connection => connection.id === preferredId && isReceiptGeminiApi(connection)) || connections.find(isReceiptGeminiApi)
  );
}

/** Permission to send images is separate from the selected transport's capability. */
export function receiptReadingMode(policy: Pick<Policy, 'features' | 'checks' | 'receiptLocalOnly'>, provider?: string) {
  if (policy.receiptLocalOnly !== false) return { vision: false, textOnly: false };
  const permitted = policy.features.vision && policy.features.receiptVision && !policy.checks.privacy;
  const capable = !provider || ['openai', 'claude', 'gemini', 'antigravity'].includes(provider);
  return { vision: permitted && capable, textOnly: Boolean(provider) && !(permitted && capable) };
}
