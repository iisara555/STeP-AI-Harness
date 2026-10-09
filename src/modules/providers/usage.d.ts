export type TokenCount = {
  input: number;
  output: number;
  total: number;
  cachedInput?: number;
  cacheWriteInput?: number;
};
export function providerUsage(protocol: string, raw?: any): TokenCount;
