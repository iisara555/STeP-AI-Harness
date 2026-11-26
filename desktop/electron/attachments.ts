// Why an attached file cannot go to the AI, read from the local document check. Each ATTACH_* code has
// plain Thai text in src/messages.ts, shown on the file chip and when sending is refused, so a file is
// never dropped without the person knowing why.
const TOO_LARGE = new Set(['file-size-limit', 'text-size-limit', 'page-limit', 'archive-size-limit', 'archive-entry-limit']);

/** Attachment caps aligned with shipped Antigravity (64 files, 50 MiB file, 10 MiB per image, 20 images / 20 MB total). */
export const MAX_ATTACHMENTS_PER_SEND = 64;
export const MAX_ATTACHMENT_CHARS = 180_000;
export const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES_PER_SEND = 20;
export const MAX_TOTAL_IMAGE_BYTES = 20_000_000;

/** A verified native outline is a separate capability, never permission to send the original source. */
export function attachmentCapabilities(report: unknown, nativeOutlineVerified: boolean) {
  const sourceReason = attachmentReason(report),
    sourceUsable = !sourceReason;
  const usable = sourceUsable || nativeOutlineVerified;
  return { sourceUsable, usable, reason: usable ? undefined : sourceReason };
}

export function attachmentReason(report: any, limit = MAX_ATTACHMENT_CHARS): string | undefined {
  const reasons: string[] = Array.isArray(report?.reviewReasons) ? report.reviewReasons : [];
  if (report?.action === 'block-external') return 'ATTACH_SENSITIVE';
  if (report?.extractionStatus === 'unavailable') {
    const reason = reasons[0] || '';
    if (reason === 'unsupported-file-type') return 'ATTACH_UNSUPPORTED';
    if (TOO_LARGE.has(reason)) return 'ATTACH_TOO_LARGE';
    if (reason === 'no-extractable-text') return 'ATTACH_NO_TEXT';
    if (reason === 'processing-time-limit') return 'ATTACH_TIMEOUT';
    if (reason === 'scanned-needs-vision') return 'ATTACH_SCANNED_NEEDS_VISION';
    return 'ATTACH_READ_FAILED';
  }
  // The scan withholds text it could not read completely, so the AI never summarizes half a document.
  if (reasons.includes('pages-without-text')) return 'ATTACH_PAGES_WITHOUT_TEXT';
  if (typeof report?.redactedText !== 'string') return report?.extractionStatus === 'partial' ? 'ATTACH_PARTIAL' : 'ATTACH_NEEDS_REVIEW';
  if (report.redactedText.length > limit) return 'ATTACH_TOO_LARGE';
  return undefined;
}
