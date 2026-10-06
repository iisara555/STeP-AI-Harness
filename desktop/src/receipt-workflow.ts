import { parseReceiptDate, type ClaimCategory, type ComplianceItem, type DocumentType } from './receipt-compliance';
import { amount, RECEIPT_FIELDS, type ReceiptField } from './receipt-vision';
import { formatThaiDate } from './thai-date';

const digits = (value: string) => value.replace(/[๐-๙]/g, d => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)));

/** Format values already read from the source. Never calculate an absent amount or repair an identifier. */
export function formValues(input: Partial<Record<ReceiptField, string>>): Record<ReceiptField, string> {
  return Object.fromEntries(
    RECEIPT_FIELDS.map(key => {
      let value = digits(input[key] || '').trim();
      if (key === 'date' && value) {
        const date = parseReceiptDate(value);
        if (date) value = formatThaiDate(date);
      }
      if (['subtotal', 'vat', 'total'].includes(key) && value) {
        const number = amount(value);
        // Only format whole amounts or up to two decimal places; preserve other readings for review.
        if (Number.isFinite(number) && Math.abs(number) < 1e12 && /^-?[\d,\s]+(?:\.\d{1,2})?(?:\s*(?:บาท|฿|THB))?$/i.test(value))
          value = number.toFixed(2);
      }
      if (key === 'taxId' && /^[\d\s-]+$/.test(value)) value = value.replace(/[\s-]/g, '');
      return [key, value];
    }),
  ) as Record<ReceiptField, string>;
}

/** Only explicit item labels qualify: shop names and unrelated receipt text are never expense-purpose evidence. */
export function expenseDescriptionFromText(text: string) {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  for (let index = 0; index < lines.length; index++) {
    const match = /^(?:รายการ(?:\s*DESCRIPTION)?|description)\s*[:：]?\s*(.*)$/i.exec(lines[index]);
    if (!match) continue;
    const next = match[1] || lines[index + 1] || '';
    if (
      !next ||
      /^(?:จำนวน|quantity|หน่วย|unit|ยอด|total|amount|ผู้|ชื่อ|name|ที่อยู่|address|เลข|วันที่|date)\b/i.test(next) ||
      /^(?:จำนวน|หน่วย|ยอด|ผู้|ชื่อ|ที่อยู่|เลข|วันที่)/.test(next)
    )
      return '';
    return next.slice(0, 300);
  }
  return '';
}

// Names from the AFP circular table (docs/afp-operational-circulars.md §3), so a person who does not know the codes
// can read the suggestion.
const EXPENSE_CODE_NAMES: Record<string, string> = {
  B1: 'จัดประชุม อบรม สัมมนา หรือจัดงาน',
  B3: 'ค่าโล่ ใบประกาศนียบัตร กรอบใบประกาศ',
  B6: 'ค่ากำจัดสัตว์พาหะ เชื้อโรค เชื้อรา',
  B7: 'สมาชิก หนังสือ วารสาร สื่ออิเล็กทรอนิกส์',
  B8: 'ค่ากำจัดสิ่งปฏิกูล จัดเก็บขยะ',
  'B9.2': 'วัตถุดิบสำหรับกิจกรรม',
  B10: 'ค่าน้ำดื่ม',
  BV: 'ค่าพาหนะ',
  BV1: 'ค่าพาหนะรวมน้ำมันเชื้อเพลิง',
  BV2: 'ค่าพาหนะไม่รวมน้ำมันเชื้อเพลิง',
};
/** "B10 · ค่าน้ำดื่ม": the code AFP uses plus its plain name. */
export function expenseCodeLabel(code: string) {
  return EXPENSE_CODE_NAMES[code] ? `${code} · ${EXPENSE_CODE_NAMES[code]}` : code;
}

/** Suggestions reference the registered AFP circular; receipt transcription cannot prove eligibility or budget. */
export function expenseCategorySuggestion(description: string, purpose = '', date = '') {
  const evidence = `${description} ${purpose}`.trim();
  const candidates: string[] = [];
  if (
    /น้ำดื่ม|drinking water|bottled water/i.test(description) &&
    !/เครื่องดื่ม|กาแฟ|ชา|สมูทตี้|น้ำผลไม้|เบียร์|ไวน์|สุรา|coffee|smoothie|beer|wine/i.test(description)
  )
    candidates.push('B10');
  if (/หนังสือ|จุลสาร|วารสาร|shutterstock|line\s*oa/i.test(description)) candidates.push('B7');
  if (/ค่าโล่|ใบประกาศนียบัตร|กรอบใบประกาศ/.test(description)) candidates.push('B3');
  if (/กำจัด(?:สัตว์พาหะ|เชื้อโรค|เชื้อรา)|พ่นฆ่าเชื้อ/.test(description)) candidates.push('B6');
  if (/กำจัดสิ่งปฏิกูล|จัดเก็บขยะ/.test(description)) candidates.push('B8');
  if (/วัตถุดิบ|อาหารสด|ผลไม้|ของไหว้/.test(description) && /พิธีกรรม|ไหว้ศาล|ของไหว้|ทางศาสนา/.test(purpose)) candidates.push('B9.2');
  if (/เช่า(?:สถานที่|อุปกรณ์)|ช่างภาพ|พิธีกร/.test(description) && /ประชุม|อบรม|สัมมนา|จัดงาน/.test(purpose)) candidates.push('B1');
  if (/จ้างเหมารถ|เช่ารถ/.test(description)) {
    const issued = parseReceiptDate(date);
    if (issued && issued >= new Date(Date.UTC(2026, 8, 1)))
      candidates.push(/ไม่รวม(?:น้ำมัน|เชื้อเพลิง)/.test(description) ? 'BV2' : /รวมน้ำมัน|รวมเชื้อเพลิง/.test(description) ? 'BV1' : 'BV');
  }
  const unique = [...new Set(candidates)];
  const parts = description.split(/\s*(?:;|และ|\n)\s*/).filter(part => part.trim());
  // A recognized line must not assign the full receipt to its category when other items remain unknown.
  const partCodes: string[] = parts.length > 1 ? parts.map(part => expenseCategorySuggestion(part, purpose, date).code) : [];
  const code = unique.length === 1 && (!partCodes.length || partCodes.every(part => part === unique[0])) ? unique[0] : '';
  const nextSteps: string[] = [];
  if (code.startsWith('BV')) {
    nextSteps.push('ดำเนินการค่าพาหนะผ่านกระบวนการจัดซื้อจัดจ้าง และตรวจยอดรวมไม่เกิน 10,000 บาทต่อคนขับรถต่อกิจกรรม');
  } else if (code.startsWith('B')) {
    nextSteps.push('ตรวจผลรวมทุกรายการในหมวดเดียวกัน ไม่เกิน 10,000 บาทต่อหมวด ไม่ใช่ตรวจเฉพาะใบนี้');
  }
  if (code === 'B9.2') nextSteps.push('ดำเนินการผ่าน 5/10000 และแนบรูปถ่ายของไหว้ที่วางหน้าศาลเรียบร้อยแล้ว');
  if (code === 'B7' && /shutterstock|line\s*oa/i.test(description))
    nextSteps.push('หากเป็นการซื้อโปรแกรมหรือสิทธิ์เว็บไซต์ ต้องได้รับอนุมัติ ICT Committee ก่อน ผ่านทีม IQI ที่ cmu.to/it-request');
  return {
    category: (code.startsWith('BV') ? 'BV' : code.startsWith('B') ? 'B' : 'unsure') as ClaimCategory,
    code,
    candidates: unique,
    evidence,
    provenance: 'AI_RECOMMENDATION',
    sourceRef: 'docs/afp-operational-circulars.md#3',
    sourceStatus: 'registered-circular-not-live-policy-verification',
    budget: null,
    nextSteps,
  };
}

export function receiptAssessment(input: {
  type: DocumentType | '';
  values: Record<string, string>;
  items: ComplianceItem[];
  hasRuleWarnings: boolean;
  checked: boolean;
}) {
  let status: 'needs-document' | 'needs-correction' | 'needs-policy' | 'needs-actions' | 'awaiting-confirmation' | 'prepared';
  if (input.type === 'invoice_or_quotation' || input.type === 'transfer_slip') status = 'needs-document';
  else if (
    !input.values.merchant?.trim() ||
    !parseReceiptDate(input.values.date || '') ||
    !input.values.total?.trim() ||
    !Number.isFinite(amount(input.values.total || '')) ||
    amount(input.values.total || '') <= 0 ||
    input.items.some(item => item.status === 'missing' && !item.ifCategoryB) ||
    input.hasRuleWarnings
  )
    status = 'needs-correction';
  else if (!input.type || input.type === 'other' || input.items.some(item => item.source === 'need-source' && item.id !== 'buyer'))
    status = 'needs-policy';
  else if (input.items.some(item => (item.status === 'warn' || item.status === 'todo') && !item.ifCategoryB)) status = 'needs-actions';
  else status = input.checked ? 'prepared' : 'awaiting-confirmation';
  return { status, paymentApproved: false, policyVerified: false };
}
