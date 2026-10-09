import type { TokenCount } from './providers';
const fields = ['input', 'output', 'total', 'cachedInput', 'cacheWriteInput'] as const;
/** Keep optional cache observations absent until a provider actually reports them. */
export function combineUsage(a: TokenCount, b: TokenCount, operation: 'sum' | 'max' | 'delta' = 'sum'): TokenCount {
  const result: TokenCount = { input: 0, output: 0, total: 0 };
  for (const key of fields) {
    if (key === 'cachedInput' || key === 'cacheWriteInput') {
      if (a[key] === undefined && b[key] === undefined) continue;
    }
    const left = a[key] ?? 0,
      right = b[key] ?? 0;
    result[key] = operation === 'sum' ? left + right : operation === 'max' ? Math.max(left, right) : Math.max(0, left - right);
  }
  return result;
}
