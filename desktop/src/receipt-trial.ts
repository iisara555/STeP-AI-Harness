import { RECEIPT_FIELDS, type ReceiptField } from './receipt-vision';

export function trialReading(values: Partial<Record<ReceiptField, string>>, review: string[], elapsedMs: number) {
  return {
    elapsedMs,
    fields: Object.fromEntries(
      RECEIPT_FIELDS.map(key => [
        key,
        {
          value: values[key] || '',
          needsReview: review.includes(key),
          provenance: 'EXTRACTED_UNVERIFIED' as const,
        },
      ]),
    ) as Record<ReceiptField, { value: string; needsReview: boolean; provenance: 'EXTRACTED_UNVERIFIED' }>,
  };
}
export type TrialReading = ReturnType<typeof trialReading>;

/** Conservative exact comparison; blanks count only after the person has checked the entire source. */
export function trialReport(
  ocr: TrialReading,
  vision: TrialReading | null,
  values: Record<string, string>,
  checked: boolean,
  sourceRef = 'receipt:trial',
) {
  const compare = (reading: TrialReading, key: ReceiptField) => {
    const field = reading.fields[key];
    const match = checked ? field.value.normalize('NFC').trim() === (values[key] || '').normalize('NFC').trim() : null;
    return {
      ...field,
      source_ref: sourceRef,
      match,
      reviewOutcome:
        match === null
          ? null
          : match
            ? field.needsReview
              ? 'extra-warning'
              : 'correct-unflagged'
            : field.needsReview
              ? 'caught-error'
              : 'missed-error',
    };
  };
  const fields = Object.fromEntries(
    RECEIPT_FIELDS.map(key => [
      key,
      {
        human: {
          value: values[key] || '',
          source_ref: sourceRef,
          provenance: checked ? 'SOURCE_FACT' : null,
          verification: checked ? 'human-source-comparison' : null,
        },
        ocr: compare(ocr, key),
        vision: vision ? compare(vision, key) : null,
      },
    ]),
  ) as Record<
    ReceiptField,
    {
      human: { value: string; source_ref: string; provenance: string | null; verification: string | null };
      ocr: ReturnType<typeof compare>;
      vision: ReturnType<typeof compare> | null;
    }
  >;
  const summarize = (reading: TrialReading) => {
    const rows = RECEIPT_FIELDS.map(key => ({ key, ...compare(reading, key) }));
    return {
      exact: rows.filter(row => row.match).length,
      errors: rows.filter(row => row.match === false).length,
      potentialCriticalDifferences: rows.filter(row => row.match === false && row.key !== 'merchant').length,
      caughtErrors: rows.filter(row => row.reviewOutcome === 'caught-error').length,
      missedErrors: rows.filter(row => row.reviewOutcome === 'missed-error').length,
      extraWarnings: rows.filter(row => row.reviewOutcome === 'extra-warning').length,
    };
  };
  return {
    schema: 'step-receipt-trial/v1',
    comparison: 'NFC-trim-exact',
    scope: 'single-document-human-reviewed-pilot',
    acceptanceGate: 'OPEN',
    checked,
    source_ref: sourceRef,
    ramBytes: null,
    ocr: { ...ocr, fields: Object.fromEntries(RECEIPT_FIELDS.map(key => [key, { ...ocr.fields[key], source_ref: sourceRef }])) },
    vision: vision
      ? { ...vision, fields: Object.fromEntries(RECEIPT_FIELDS.map(key => [key, { ...vision.fields[key], source_ref: sourceRef }])) }
      : null,
    fields,
    summary: checked ? { ocr: summarize(ocr), vision: vision ? summarize(vision) : null } : null,
  };
}
