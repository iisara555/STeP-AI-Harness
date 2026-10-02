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
