/** Exact values and common encodings only; this is not a sandbox against hostile host code. */
export class VaultRedaction {
  private values = new Set<string>();
  register(...values: (string | undefined)[]) {
    for (const value of values)
      if (value) {
        if (this.values.size > 4000) throw new Error('VAULT_REDACTION_LIMIT');
        this.values.add(value);
        this.values.add(encodeURIComponent(value));
        this.values.add(Buffer.from(value).toString('base64'));
      }
  }
  mask(text: string, trustedMetadata = false) {
    const values = [...this.values].sort((a, b) => b.length - a.length);
    const mask = (value: string) => {
      for (const secret of values) value = value.split(secret).join('[credential-redacted]');
      return value;
    };
    // Keep the host's opaque identifiers and numeric status fields usable. A short card field must not
    // corrupt a snapshot UUID or turn a numeric JSON count into invalid JSON. Page text is always scrubbed.
    const walk = (value: unknown, key = ''): unknown => {
      if (typeof value === 'string') {
        if (
          trustedMetadata &&
          !this.values.has(value) &&
          ['handle', 'id', 'tab', 'snapshot', 'traceId'].includes(key) &&
          /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
        )
          return value;
        if (trustedMetadata && key === 'origin' && /^https:\/\/[^/?#@]+$/.test(value)) return value;
        return mask(value);
      }
      if (Array.isArray(value)) return value.map(item => walk(item));
      if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, walk(item, name)]));
      return value;
    };
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') return JSON.stringify(walk(parsed));
    } catch {}
    return mask(text);
  }
}
