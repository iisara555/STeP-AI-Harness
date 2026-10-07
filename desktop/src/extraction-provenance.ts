export type ExtractionMethod = 'ocr' | 'vision' | 'ai-candidate-filter' | 'manual';

/** Derive provenance from explicit review state, never from confidence or model agreement.
 * This records transcription review only: it does not establish document authenticity or financial authority.
 */
export function receiptProvenance(input: unknown): any {
  const draft: any = input && typeof input === 'object' && !Array.isArray(input) ? JSON.parse(JSON.stringify(input)) : {};
  const sourceRef = 'receipt:' + (typeof draft.source_id === 'string' && draft.source_id ? draft.source_id : 'legacy');
  const unverified = (record: any, method = 'ocr') => ({
    ...record,
    provenance: 'EXTRACTED_UNVERIFIED',
    sourceRef,
    sourceLocation: record?.page ? `page ${record.page}` : 'document',
    extractionMethod: record?.engine || method,
    verification: null,
    reviewed_value: null,
    reviewed_source_ref: null,
  });
  const selectedValue = (value: any) => {
    const field: any = value && typeof value === 'object' ? value : { value: '' };
    const checked =
      field.checked === true &&
      typeof field.value === 'string' &&
      Boolean(field.value.trim()) &&
      (field.reviewed_value === undefined || field.reviewed_value === field.value) &&
      (field.reviewed_source_ref === undefined || field.reviewed_source_ref === sourceRef);
    return {
      ...unverified(field, field.input_origin || 'ocr'),
      checked,
      provenance: checked ? 'SOURCE_FACT' : field.input_origin === 'manual' ? 'USER_INPUT' : 'EXTRACTED_UNVERIFIED',
      verification: checked ? 'human-source-comparison' : null,
      reviewed_value: checked ? field.value : null,
      reviewed_source_ref: checked ? sourceRef : null,
    };
  };
  draft.fields = Object.fromEntries(Object.entries(draft.fields || {}).map(([key, value]) => [key, selectedValue(value)]));
  if (draft.expense_description) draft.expense_description = selectedValue(draft.expense_description);
  if (draft.afp_mapping) {
    draft.afp_mapping.fields = Object.fromEntries(
      Object.entries(draft.afp_mapping.fields || {}).map(([key, value]) => {
        const field: any = value || {};
        const selected = draft.fields[key];
        const verified = selected?.checked && selected.value === field.selected_value;
        return [
          key,
          {
            ...unverified(field),
            provenance: verified ? 'SOURCE_FACT' : 'EXTRACTED_UNVERIFIED',
            verification: verified ? 'human-source-comparison' : null,
            candidates: (field.candidates || []).map((candidate: any) => unverified(candidate)),
          },
        ];
      }),
    );
    for (const key of ['unresolved_field_lines', 'unmapped_ocr_lines']) {
      if (Array.isArray(draft.afp_mapping[key])) draft.afp_mapping[key] = draft.afp_mapping[key].map((line: any) => unverified(line));
    }
  }
  if (draft.ocr) draft.ocr = { ...unverified(draft.ocr), lines: (draft.ocr.lines || []).map((line: any) => unverified(line)) };
  if (draft.vision_check)
    draft.vision_check = {
      ...unverified(draft.vision_check, 'vision'),
      fields: Object.fromEntries(Object.entries(draft.vision_check.fields || {}).map(([key, value]) => [key, unverified(value, 'vision')])),
      ...(draft.vision_check.expense_description
        ? { expense_description: unverified(draft.vision_check.expense_description, 'vision') }
        : {}),
    };
  if (draft.ai_filter)
    draft.ai_filter = {
      ...unverified(draft.ai_filter, 'ai-candidate-filter'),
      decisions: (draft.ai_filter.decisions || []).map((decision: any) => unverified(decision, 'ai-candidate-filter')),
    };
  draft.notice =
    'Only selected values marked SOURCE_FACT with human-source-comparison were checked against the source. Raw OCR/AI readings and alternatives remain unverified. This is not a reimbursement approval.';
  return draft;
}
