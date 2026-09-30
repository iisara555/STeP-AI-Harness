// Why an attached file cannot go to the AI, read from the local document check. Each ATTACH_* code has
// plain Thai text in src/messages.ts, shown on the file chip and when sending is refused, so a file is
// never dropped without the person knowing why.
const TOO_LARGE = new Set(['file-size-limit', 'text-size-limit', 'page-limit', 'archive-size-limit', 'archive-entry-limit']);

export function attachmentReason(report: any, limit = 100_000): string | undefined {
  const reasons: string[] = Array.isArray(report?.reviewReasons) ? report.reviewReasons : [];
  if (report?.action === 'block-external') return 'ATTACH_SENSITIVE';
  if (report?.extractionStatus === 'unavailable') {
    const reason = reasons[0] || '';
    if (reason === 'unsupported-file-type') return 'ATTACH_UNSUPPORTED';
    if (TOO_LARGE.has(reason)) return 'ATTACH_TOO_LARGE';
    if (reason === 'no-extractable-text') return 'ATTACH_NO_TEXT';
    if (reason === 'processing-time-limit') return 'ATTACH_TIMEOUT';
    return 'ATTACH_READ_FAILED';
  }
  // The scan withholds text it could not read completely, so the AI never summarizes half a document.
  if (reasons.includes('pages-without-text')) return 'ATTACH_PAGES_WITHOUT_TEXT';
  if (typeof report?.redactedText !== 'string') return report?.extractionStatus === 'partial' ? 'ATTACH_PARTIAL' : 'ATTACH_NEEDS_REVIEW';
  if (report.redactedText.length > limit) return 'ATTACH_TOO_LARGE';
  return undefined;
}
