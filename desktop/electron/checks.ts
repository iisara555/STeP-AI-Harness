/**
 * What the privacy scan reports when the organization turned privacy checks off (policy `checks.privacy: false`):
 * the text passes unchanged, so nothing is masked, blocked or asked about on privacy grounds.
 */
export function unscanned(text: string) {
  return {
    classification: 'internal',
    action: 'pass',
    containsPersonalData: false,
    findings: [],
    sensitiveKeywordsCount: 0,
    detectionScope: 'not-scanned',
    unresolvedIdentifiers: false,
    redactedText: text,
    redactionApplied: false,
    requiresHumanConfirmation: false,
  };
}

const CREDENTIAL_FINDING = { type: 'credential', label: 'ข้อมูลรับรองตัวตน', classification: 'sensitive', count: 1 };
/**
 * With privacy checks off, credentials (passwords, tokens, API keys, signed URL parameters) are still masked before
 * anything reaches an AI or a web service: they have no business there and a prompt-injected page could otherwise send
 * them out. Masked text goes on as 'auto-mask'; text whose credential cannot be masked completely is withheld.
 */
export function credentialsOnly(text: string, scan: (text: string) => any, pattern: RegExp): any {
  const found = (value: string) => (scan(value).findings || []).some((f: any) => f.type === 'credential');
  if (!found(text)) return unscanned(text);
  const masked = text.replace(
    new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'),
    '[credential-redacted]',
  );
  if (found(masked))
    return {
      ...unscanned(text),
      classification: 'sensitive',
      action: 'block-external',
      findings: [CREDENTIAL_FINDING],
      redactedText: null,
    };
  return {
    ...unscanned(masked),
    classification: 'sensitive',
    action: 'auto-mask',
    findings: [CREDENTIAL_FINDING],
    detectionScope: 'credentials-only',
    redactionApplied: true,
  };
}
