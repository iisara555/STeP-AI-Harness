import {
  RECEIPT_FIELDS,
  parseVisionReading,
  receiptRuleChecks,
  sameValue,
  type ReceiptField,
  type ReceiptRegion,
} from '../src/receipt-vision';

type Reading = ReturnType<typeof parseVisionReading>;
export type ReceiptVisionResult = Reading & { recheck?: { first: Reading; changedFields: ReceiptField[]; failed: boolean } };

/** Independent image re-reading is bounded to one retry. A matching equation is never proof of transcription. */
export async function readReceiptVision(
  request: (focus?: ReceiptField[], regions?: ReceiptRegion[]) => Promise<string>,
  signal?: AbortSignal,
): Promise<ReceiptVisionResult> {
  signal?.throwIfAborted();
  const first = parseVisionReading(await request());
  signal?.throwIfAborted();
  const issues = receiptRuleChecks(Object.fromEntries(RECEIPT_FIELDS.map(key => [key, first.fields[key]?.value || ''])), first);
  const numeric = issues.filter(issue =>
    [
      'invalid_money',
      'amounts_do_not_add_up',
      'amount_words_differ',
      'tax_id_checksum',
      'invalid_item_number',
      'item_amount_mismatch',
      'items_total_mismatch',
    ].includes(issue.code),
  );
  if (!numeric.length) return first;
  const focus = [
    ...new Set(numeric.flatMap(issue => (issue.field === 'total' ? (['subtotal', 'vat', 'total'] as ReceiptField[]) : [issue.field]))),
  ];
  try {
    const regions = focus
      .map(key => first.fields[key]?.region)
      .filter((region): region is ReceiptRegion => Boolean(region))
      .slice(0, 3);
    const second = parseVisionReading(await request(focus, regions));
    signal?.throwIfAborted();
    const changedFields = RECEIPT_FIELDS.filter(key => {
      const a = first.fields[key]?.value || '',
        b = second.fields[key]?.value || '';
      return a !== b && (!a || !b || !sameValue(key, a, b));
    });
    for (const key of changedFields) if (second.fields[key]) second.fields[key] = { ...second.fields[key]!, needsReview: true };
    return { ...second, recheck: { first, changedFields, failed: false } };
  } catch {
    signal?.throwIfAborted();
    const fields = { ...first.fields };
    for (const key of focus) if (fields[key]) fields[key] = { ...fields[key]!, needsReview: true };
    return { ...first, fields, recheck: { first, changedFields: [], failed: true } };
  }
}
