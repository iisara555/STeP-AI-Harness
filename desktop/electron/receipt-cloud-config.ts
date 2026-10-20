export type ReceiptCloudConfig = { url: string; model: string };
/** Public organization routing only. No credential, arbitrary path or redirect can enter this configuration. */
export function parseReceiptCloudConfig(value: unknown): ReceiptCloudConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(k => !['url', 'model'].includes(k)) ||
    typeof v.url !== 'string' ||
    v.url.length > 500 ||
    typeof v.model !== 'string' ||
    !/^gemini-[a-zA-Z0-9._-]{1,120}$/.test(v.model)
  )
    return undefined;
  try {
    const url = new URL(v.url);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(url.hostname)
    )
      return undefined;
    return { url: url.origin, model: v.model };
  } catch {
    return undefined;
  }
}
