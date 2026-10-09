/** Reuse deterministic router/retrieval rankings. Uncertain discovery keeps the complete compact index. */
export function selectDiscovery<T>(entries: T[], id: (entry: T) => string, rankedIds: string[], requiredIds: string[] = []) {
  const byId = new Map(entries.map(entry => [id(entry), entry]));
  const matches = [...new Set(rankedIds)].filter(key => byId.has(key)).slice(0, 3);
  if (!matches.length) return { entries, scope: 'full' as const };
  const keys = [...new Set([...requiredIds.filter(key => byId.has(key)), ...matches])];
  return { entries: keys.map(key => byId.get(key)!), scope: 'top3' as const };
}
