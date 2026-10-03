// What kind of document a receipt is, and what the claim still needs. The document type comes from the vision model's
// reading or, without it, from the printed heading; the checklist itself is fixed rules, each tied to where it comes
// from, so no rule is made up by the AI. AFP rules come from its circulars (docs/afp-operational-circulars.md); items
// whose source is not in the harness say so and send the person to AFP.

export const DOCUMENT_TYPES = [
  'tax_invoice',
  'abbreviated_tax_invoice',
  'receipt',
  'cash_bill',
  'payment_voucher',
  'invoice_or_quotation',
  'transfer_slip',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  tax_invoice: 'ใบกำกับภาษี (เต็มรูป)',
  abbreviated_tax_invoice: 'ใบกำกับภาษีอย่างย่อ',
  receipt: 'ใบเสร็จรับเงิน',
  cash_bill: 'บิลเงินสด',
  payment_voucher: 'ใบสำคัญรับเงิน',
  invoice_or_quotation: 'ใบแจ้งหนี้ / ใบเสนอราคา / ใบส่งของ',
  transfer_slip: 'สลิปโอนเงิน',
  other: 'ไม่แน่ใจประเภท',
};

/** What the vision model saw on the document, beyond the field values. */
export type DocumentFeatures = {
  handwritten?: boolean;
  thermalPaper?: boolean;
  foreignLanguage?: boolean;
  receiverSigned?: boolean;
  buyerNamed?: boolean;
  itemsListed?: boolean;
  inappropriateDrinks?: boolean;
};
export const FEATURE_KEYS = [
  'handwritten',
  'thermalPaper',
  'foreignLanguage',
  'receiverSigned',
  'buyerNamed',
  'itemsListed',
  'inappropriateDrinks',
] as const;

export function parseDocumentType(value: unknown): DocumentType | '' {
  return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value) ? (value as DocumentType) : '';
}

/** The document type from its printed heading, for when there is no vision reading. The most specific match wins. */
export function classifyFromText(text: string): DocumentType | '' {
  const t = text.replace(/\s+/g, ' ');
  if (/ใบกำกับภาษีอย่างย่อ|abb\.?|tax invoice\s*\(abb/i.test(t)) return 'abbreviated_tax_invoice';
  if (/ใบกำกับภาษี|tax invoice/i.test(t)) return 'tax_invoice';
  if (/ใบสำคัญรับเงิน|FM-AF-014/i.test(t)) return 'payment_voucher';
  if (/บิลเงินสด|cash sale|cash bill/i.test(t)) return 'cash_bill';
  if (/ใบเสร็จรับเงิน|ใบเสร็จ|receipt/i.test(t)) return 'receipt';
  if (/ใบแจ้งหนี้|ใบเสนอราคา|ใบส่งของ|ใบวางบิล|invoice|quotation|delivery order/i.test(t)) return 'invoice_or_quotation';
  if (/โอนเงินสำเร็จ|รายการสำเร็จ|transfer successful|เลขที่รายการ|promptpay|พร้อมเพย์/i.test(t)) return 'transfer_slip';
  return '';
}

const THAI_MONTHS = [
  ['ม.ค', 'มกราคม', 'jan'],
  ['ก.พ', 'กุมภาพันธ์', 'feb'],
  ['มี.ค', 'มีนาคม', 'mar'],
  ['เม.ย', 'เมษายน', 'apr'],
  ['พ.ค', 'พฤษภาคม', 'may'],
  ['มิ.ย', 'มิถุนายน', 'jun'],
  ['ก.ค', 'กรกฎาคม', 'jul'],
  ['ส.ค', 'สิงหาคม', 'aug'],
  ['ก.ย', 'กันยายน', 'sep'],
  ['ต.ค', 'ตุลาคม', 'oct'],
  ['พ.ย', 'พฤศจิกายน', 'nov'],
  ['ธ.ค', 'ธันวาคม', 'dec'],
];
const thaiDigits = (value: string) => value.replace(/[๐-๙]/g, d => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)));
/** A year as printed: Buddhist (2569, or 69) or Christian (2026, or 26 when it cannot be Buddhist). */
function fullYear(raw: string) {
  let year = Number(raw);
  if (raw.length <= 2) year += year >= 40 ? 2500 : 2000; // 69 → 2569, 26 → 2026
  return year > 2400 ? year - 543 : year;
}
/** A receipt date as printed (2 ต.ค. 2569, 02/10/2569, 2026-10-02, 2 October 2026); null when it cannot be read. */
export function parseReceiptDate(value: string): Date | null {
  const text = thaiDigits(value).toLowerCase().replace(/\s+/g, ' ').trim();
  let day: number, month: number, year: number;
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (m) [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})/.exec(text))) {
    [day, month, year] = [Number(m[1]), Number(m[2]), fullYear(m[3])];
  } else {
    const named = /(\d{1,2})\s*([ก-๙a-z.]+)\s*(\d{2,4})/.exec(text);
    if (!named) return null;
    const word = named[2].replace(/\.$/, '');
    const index = THAI_MONTHS.findIndex(([abbr, full, en]) => word === abbr.replace(/\.$/, '') || word === full || word.startsWith(en));
    if (index < 0) return null;
    [day, month, year] = [Number(named[1]), index + 1, fullYear(named[3])];
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day && year > 1990 && year < 2200 ? date : null;
}
/** The day `count` working days after `from` (Monday to Friday; public holidays are not known here). */
export function addWorkingDays(from: Date, count: number) {
  const date = new Date(from);
  for (let left = count; left > 0;) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) left--;
  }
  return date;
}
const THAI_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const thaiDate = (date: Date) => `${date.getUTCDate()} ${THAI_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear() + 543}`;

/** The expense category the person will claim under; it decides which AFP rules apply. */
export type ClaimCategory = 'unsure' | 'B' | 'BV' | 'emergency' | 'other';

export type CheckStatus = 'ok' | 'missing' | 'warn' | 'todo' | 'info';
/** afp: AFP circulars in the harness · general: what a payment document shows, to confirm with AFP · need-source: no source in the harness yet. */
export type CheckSource = 'afp' | 'general' | 'need-source';
export type ComplianceItem = {
  id: string;
  status: CheckStatus;
  text: string;
  source: CheckSource;
  vars?: (string | number)[];
  /** Applies only if the claim goes under category B; shown as "ถ้าเบิกหมวด B:" while the category is not chosen. */
  ifCategoryB?: boolean;
};

const AMOUNT = (value: string) => {
  const n = Number(thaiDigits(value).replace(/บาท|฿|,|\s/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * The checklist for one receipt: what the document shows, what the claim still needs, and the AFP deadlines that
 * apply. Texts are Thai keys for t(); {0} placeholders take `vars`.
 */
export function complianceChecklist(input: {
  type: DocumentType | '';
  features: DocumentFeatures;
  values: Partial<Record<string, string>>;
  amountInWords?: string;
  category: ClaimCategory;
  today?: Date;
}): ComplianceItem[] {
  const { type, features: f, values, category } = input;
  const items: ComplianceItem[] = [];
  const has = (key: string) => Boolean(String(values[key] || '').trim());
  const notPayment = type === 'invoice_or_quotation' || type === 'transfer_slip';

  // 1. Is this a proof of payment at all?
  if (notPayment)
    items.push({
      id: 'not_proof_of_payment',
      status: 'missing',
      source: 'afp',
      text:
        type === 'transfer_slip'
          ? 'สลิปโอนเงินไม่ใช่ใบเสร็จ ชุดเคลียร์เงินของ AFP ใช้ใบเสร็จรับเงิน หรือใบสำคัญรับเงิน (FM-AF-014) ขอใบเสร็จจากผู้รับเงิน หรือใช้ใบสำคัญรับเงินพร้อมสำเนาบัตรประชาชนผู้รับเงิน'
          : 'ใบแจ้งหนี้หรือใบเสนอราคาเป็นเอกสารก่อนจ่ายเงิน ใช้ประกอบตอนยืมเงินได้ แต่ตอนเคลียร์เงินต้องมีใบเสร็จรับเงิน หรือใบสำคัญรับเงิน (FM-AF-014)',
    });

  // 2. What a payment document shows (general; confirm the exact list with AFP).
  if (!notPayment) {
    items.push({
      id: 'payee',
      status: has('merchant') ? 'ok' : 'missing',
      source: 'general',
      text: has('merchant') ? 'มีชื่อผู้รับเงิน / ร้าน' : 'ยังไม่เห็นชื่อผู้รับเงิน / ร้าน',
    });
    items.push({
      id: 'date',
      status: has('date') ? 'ok' : 'missing',
      source: 'general',
      text: has('date') ? 'มีวันที่รับเงิน' : 'ยังไม่เห็นวันที่รับเงิน',
    });
    if (f.itemsListed !== undefined)
      items.push({
        id: 'items',
        status: f.itemsListed ? 'ok' : 'missing',
        source: 'general',
        text: f.itemsListed ? 'มีรายการว่าจ่ายค่าอะไร' : 'ยังไม่เห็นรายการว่าจ่ายค่าอะไร',
      });
    items.push({
      id: 'amount',
      status: has('total') && input.amountInWords ? 'ok' : has('total') ? 'warn' : 'missing',
      source: 'general',
      text:
        has('total') && input.amountInWords
          ? 'มีจำนวนเงินทั้งตัวเลขและตัวอักษร'
          : has('total')
            ? 'มีจำนวนเงินตัวเลข แต่ยังไม่เห็นจำนวนเงินตัวอักษร'
            : 'ยังไม่เห็นจำนวนเงิน',
    });
    if (f.receiverSigned !== undefined)
      items.push({
        id: 'signature',
        status: f.receiverSigned ? 'ok' : 'missing',
        source: 'general',
        text: f.receiverSigned ? 'มีลายมือชื่อผู้รับเงิน' : 'ยังไม่เห็นลายมือชื่อผู้รับเงิน ขอให้ผู้รับเงินลงชื่อ (ห้ามลงชื่อแทนผู้อื่น)',
      });
    items.push({
      id: 'buyer',
      status: f.buyerNamed ? 'ok' : 'info',
      source: 'need-source',
      text: f.buyerNamed
        ? 'ระบุชื่อผู้ซื้อแล้ว ชื่อและที่อยู่ผู้ซื้อที่ต้องใช้ ยังไม่มีแหล่งยืนยันในระบบ โปรดถาม AFP'
        : 'ยังไม่เห็นชื่อผู้ซื้อ ชื่อและที่อยู่ผู้ซื้อที่ต้องใช้ ยังไม่มีแหล่งยืนยันในระบบ โปรดถาม AFP',
    });
  }

  // 3. AFP's own rules (docs/afp-operational-circulars.md).
  if (f.thermalPaper || type === 'abbreviated_tax_invoice')
    items.push({
      id: 'thermal_copy',
      status: 'todo',
      source: 'afp',
      text: 'เอกสารกระดาษความร้อน (เช่น ใบเสร็จอย่างย่อ สลิป) ต้องถ่ายสำเนาแนบทุกครั้ง เพราะตัวหนังสือจะจางหาย',
    });
  if (f.foreignLanguage)
    items.push({
      id: 'translation',
      status: 'todo',
      source: 'afp',
      text: 'เอกสารภาษาต่างประเทศ ต้องแนบต้นฉบับพร้อมคำแปลภาษาไทยที่มีผู้แปลลงชื่อและวันที่ (ห้ามใช้ Google Translate)',
    });
  if (f.inappropriateDrinks)
    items.push({
      id: 'drinks',
      status: 'warn',
      source: 'afp',
      text: 'มีรายการที่อาจเป็นเครื่องดื่มที่ไม่เหมาะสม AFP ห้ามซื้อเครื่องดื่มที่ไม่เหมาะสม โปรดตรวจรายการ',
    });
  if (f.handwritten)
    items.push({
      id: 'handwritten',
      status: 'info',
      source: 'general',
      text: 'ใบเสร็จเขียนด้วยลายมือ ตรวจว่าไม่มีรอยขูดลบหรือแก้ไขตัวเลข ถ้ามีการแก้ ควรให้ผู้รับเงินลงชื่อกำกับ',
    });
  if (type === 'cash_bill')
    items.push({
      id: 'cash_bill',
      status: 'info',
      source: 'need-source',
      text: 'บิลเงินสดจากร้านที่ไม่ได้จดทะเบียนภาษีมูลค่าเพิ่มไม่มีภาษีแยก ใช้เป็นหลักฐานการจ่ายได้หรือไม่ในกรณีนี้ ยังไม่มีแหล่งยืนยันในระบบ โปรดถาม AFP',
    });

  const total = AMOUNT(values.total || '');
  const date = parseReceiptDate(values.date || '');
  const withinB = category === 'B' || category === 'unsure';
  if (category === 'B' || category === 'BV' || category === 'emergency' || category === 'unsure') {
    const ifCategoryB = category === 'unsure' || undefined;
    const cap = 10_000;
    if (Number.isFinite(total) && total > cap)
      items.push({
        id: 'over_cap',
        ifCategoryB,
        status: 'warn',
        source: 'afp',
        vars: [total.toLocaleString('th-TH')],
        text:
          category === 'BV'
            ? 'ยอด {0} บาท เกินเพดานหมวด BV (ไม่เกิน 10,000 บาท/คนขับรถ/กิจกรรม)'
            : category === 'emergency'
              ? 'ยอด {0} บาท เกินวงเงินหมวดฉุกเฉิน (ไม่เกิน 10,000 บาท)'
              : 'ยอด {0} บาท เกินเพดานหมวด B (ไม่เกิน 10,000 บาทต่อหมวดย่อย) งานที่เกิน 10,000 บาทต้องผ่านพัสดุ (หมวด C)',
      });
    if (withinB || category === 'emergency') {
      const days = category === 'emergency' ? 5 : 3;
      if (date) {
        const due = addWorkingDays(date, days);
        const today = input.today || new Date();
        const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
        const late = todayUtc > due.getTime();
        items.push({
          id: 'report_deadline',
          ifCategoryB,
          status: late ? 'warn' : 'todo',
          source: 'afp',
          vars: [days, thaiDate(due)],
          text: late
            ? 'เลยกำหนดรายงานขอความเห็นชอบแล้ว (ภายใน {0} วันทำการนับถัดจากวันที่ในใบเสร็จ ครบ {1}) AFP แจ้งว่าค่าใช้จ่ายส่วนเกินจะเบิกไม่ได้ โปรดติดต่อ AFP'
            : 'ทำรายงานขอความเห็นชอบใน STeP MIS ภายใน {0} วันทำการนับถัดจากวันที่ในใบเสร็จ: ภายใน {1} (ไม่นับวันหยุดนักขัตฤกษ์ โปรดดูปฏิทินด้วย)',
        });
      } else
        items.push({
          id: 'report_deadline',
          ifCategoryB,
          status: 'todo',
          source: 'afp',
          vars: [days],
          text: 'ทำรายงานขอความเห็นชอบใน STeP MIS ภายใน {0} วันทำการนับถัดจากวันที่ในใบเสร็จ',
        });
    }
    if (category === 'emergency')
      items.push({
        id: 'emergency_approval',
        status: 'todo',
        source: 'afp',
        text: 'หมวดฉุกเฉินต้องได้รับความเห็นชอบจากหัวหน้าทีมหรือผู้บริหารทีมก่อนดำเนินการ และเข้าเงื่อนไขครบ 3 ข้อ (เร่งด่วน, ไม่ได้คาดการณ์ไว้, ทำตามระยะเวลาปกติไม่ทัน)',
      });
    if (withinB)
      items.push({
        id: 'clearing_set',
        ifCategoryB,
        status: 'todo',
        source: 'afp',
        text: 'ชุดเคลียร์เงิน: ใบขอเบิกค่าใช้จ่าย (FM-AF-002) + ใบเสร็จรับเงินหรือใบสำคัญรับเงิน (FM-AF-014) + สำเนาบัตรประชาชนผู้รับเงินหรือใบรับรองแทนใบเสร็จ (FM-AF-035/036) + รายงานขอความเห็นชอบ',
      });
  }
  if (category === 'other')
    items.push({
      id: 'other_category',
      status: 'info',
      source: 'need-source',
      text: 'กฎของหมวดนี้ยังไม่มีในระบบ ชุดเอกสารและกำหนดเวลาโปรดถาม AFP',
    });
  return items;
}

/** One line for the overall state: missing items block, warnings and to-dos remain. */
export function complianceSummary(items: ComplianceItem[]) {
  return {
    missing: items.filter(i => i.status === 'missing').length,
    warn: items.filter(i => i.status === 'warn').length,
    todo: items.filter(i => i.status === 'todo').length,
  };
}
