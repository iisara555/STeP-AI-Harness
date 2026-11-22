// The claim interview: one question at a time, from "what are you claiming" to the category, finance case, documents
// and deadline. Every rule here is fixed and cites the registered STeP document it comes from
// (docs/knowledge/afp-operational-circulars.md, qp-af-003.md, hr-personnel-welfare-index.md); nothing is decided by an
// AI. Rates that are not registered (food, speaker fees) are left to AFP instead of guessed.

import { ACTIVITY_LABELS, evidenceChecklist, inferActivity, type Activity, type FinanceChoice } from './afp-evidence';
import { addWorkingDays, parseReceiptDate, thaiDate, type ClaimCategory } from './receipt-compliance';
import { createReceiptPacket, formatSatang, moneySatang, type ReceiptPacket } from './receipt-packet';
import { BV_SOURCE, checkBvReason, draftBvReason, type BvPart } from './bv-travel-reason';

export type Note = { text: string; source: string };
type ExpenseRule = {
  label: string;
  short: string;
  category: ClaimCategory;
  code: string;
  pattern: RegExp;
  notes: Note[];
};

export const EXPENSE_TYPES = {
  water: {
    label: 'ค่าน้ำดื่ม',
    short: 'ค่าน้ำดื่ม',
    category: 'B',
    code: 'B10',
    pattern: /น้ำดื่ม|drinking water/i,
    notes: [],
  },
  event_service: {
    label: 'เช่าสถานที่ อุปกรณ์ ป้าย ช่างภาพ พิธีกร',
    short: 'ค่าใช้จ่ายจัดงาน',
    category: 'B',
    code: 'B1',
    pattern: /เช่าสถานที่|เช่าอุปกรณ์|ป้าย|ไวนิล|ช่างภาพ|พิธีกร|ตกแต่งสถานที่|ของที่ระลึกวิทยากร/,
    notes: [{ text: 'ห้ามซื้อครุภัณฑ์เป็นของที่ระลึกหรือของรางวัล', source: 'แนวปฏิบัติ AFP ข้อ 3.1 (B1.5)' }],
  },
  materials: {
    label: 'วัสดุหรือวัตถุดิบสำหรับงาน',
    short: 'ค่าวัสดุ',
    category: 'B',
    code: 'B9',
    pattern: /วัสดุ|วัตถุดิบ|ของไหว้/,
    notes: [{ text: 'หมวดย่อย B9 บางรายการใช้ได้เฉพาะบางทีม โปรดตรวจกับ AFP', source: 'แนวปฏิบัติ AFP ข้อ 3.1 (B9)' }],
  },
  vehicle: {
    label: 'จ้างเหมารถหรือเช่ารถ',
    short: 'ค่าจ้างเหมารถ',
    category: 'BV',
    code: 'BV',
    pattern: /จ้างเหมารถ|เช่ารถ|รถตู้/,
    notes: [
      {
        text: 'ทำผ่านกระบวนการจัดซื้อจัดจ้าง เบิกได้ไม่เกิน 10,000 บาทต่อคนขับต่อกิจกรรม',
        source: 'แนวปฏิบัติ AFP ข้อ 3 และ 4',
      },
    ],
  },
  food: {
    label: 'ค่าอาหาร อาหารว่าง หรือเลี้ยงรับรอง',
    short: 'ค่าอาหาร',
    category: 'other',
    code: '',
    pattern: /อาหาร|ข้าวกล่อง|อาหารว่าง|coffee break|เลี้ยงรับรอง/i,
    notes: [
      { text: 'อัตราค่าอาหารยังไม่มีในเอกสารที่ระบบมี โปรดถาม AFP', source: 'ยังไม่มีแหล่งในระบบ' },
      {
        text: 'เลี้ยงรับรองใช้รายชื่อผู้เข้าร่วม FM-AF-019 และห้ามซื้อเครื่องดื่มที่ไม่เหมาะสม',
        source: 'QP-AF-003 ข้อ 4.2 a, แนวปฏิบัติ AFP ข้อ 6',
      },
    ],
  },
  lodging: {
    label: 'ค่าที่พัก',
    short: 'ค่าที่พัก',
    category: 'other',
    code: '',
    pattern: /ที่พัก|โรงแรม|hotel/i,
    notes: [
      {
        text: 'พักเดี่ยวไม่เกิน 2,200 บาท พักคู่ไม่เกิน 2,400 บาท พัก 3 คนไม่เกิน 3,000 บาท ต่อคืนต่อห้อง แนบใบเสร็จพร้อม Folio',
        source: 'สวัสดิการพนักงาน ข้อ 3.13.2',
      },
    ],
  },
  travel: {
    label: 'ค่าเดินทาง ตั๋วเครื่องบิน หรือเบี้ยเลี้ยง',
    short: 'ค่าเดินทาง',
    category: 'other',
    code: '',
    pattern: /เดินทาง|ตั๋ว|เครื่องบิน|แท็กซี่|เบี้ยเลี้ยง|ไมล์/,
    notes: [
      {
        text: 'เบิกตามจ่ายจริง โดยสารเครื่องบินได้เมื่อเร่งด่วนหรือจำเป็น รถส่วนตัว 5 บาทต่อกิโลเมตรต้องขออนุมัติก่อน เบี้ยเลี้ยงต้องได้รับอนุมัติก่อน',
        source: 'สวัสดิการพนักงาน ข้อ 3.13.1 และ 3.13.3',
      },
    ],
  },
  speaker: {
    label: 'ค่าตอบแทนวิทยากร',
    short: 'ค่าวิทยากร',
    category: 'other',
    code: '',
    pattern: /วิทยากร|ผู้บรรยาย/,
    notes: [
      {
        text: 'ระบุเวลาและหน้าที่ของวิทยากรแต่ละคน เบิกได้ 1 คนต่อการบรรยาย 1 เรื่อง 50 นาทีขึ้นไปนับ 1 ชั่วโมง อัตรายังไม่มีในเอกสารที่ระบบมี โปรดถาม AFP',
        source: 'แนวปฏิบัติ AFP ข้อ 5',
      },
    ],
  },
  urgent_repair: {
    label: 'ซ่อมด่วนที่รอไม่ได้ เช่น ยางรถรั่ว',
    short: 'ค่าซ่อมฉุกเฉิน',
    category: 'emergency',
    code: '',
    pattern: /ฉุกเฉิน|ยางรั่ว|ยางรถรั่ว|กระจกร้าว|ซ่อมด่วน/,
    notes: [
      {
        text: 'ต้องได้รับความเห็นชอบจากหัวหน้าทีมหรือผู้บริหารทีมก่อนดำเนินการ และเข้าเงื่อนไขครบ 3 ข้อ (เร่งด่วน ไม่ได้คาดการณ์ไว้ ทำตามเวลาปกติไม่ทัน)',
        source: 'แนวปฏิบัติ AFP ข้อ 3.2',
      },
    ],
  },
  other: {
    label: 'อย่างอื่น',
    short: 'ค่าใช้จ่ายอื่น',
    category: 'unsure',
    code: '',
    pattern: /$^/,
    notes: [],
  },
} satisfies Record<string, ExpenseRule>;
export type ExpenseType = keyof typeof EXPENSE_TYPES;

/** The five parts of a BV travel reason, asked only for a vehicle hire (docs/knowledge/afp-bv-travel-reason.md). */
export type BvQuestionId = 'bvWho' | 'bvWhat' | 'bvWhen' | 'bvRoute' | 'bvActivity';
export type QuestionId = 'expense' | 'activity' | 'paid' | 'funding' | 'amount' | 'date' | BvQuestionId;
const BV_QUESTIONS: Record<BvQuestionId, BvPart> = {
  bvWho: 'who',
  bvWhat: 'what',
  bvWhen: 'when',
  bvRoute: 'route',
  bvActivity: 'activity',
};
const isBv = (id: QuestionId): id is BvQuestionId => Object.hasOwn(BV_QUESTIONS, id);
export type ClaimAnswers = {
  expense?: ExpenseType;
  activity?: Activity | 'none';
  paid?: boolean;
  funding?: 'advance' | 'own' | 'unsure';
  /** null when the person does not know the amount yet. */
  amount?: number | null;
  /** The receipt date as printed, or '' when there is no receipt yet. */
  date?: string;
} & Partial<Record<BvQuestionId, string>>;
export type Option = { value: string; label: string };
export type Question = {
  id: QuestionId;
  text: string;
  why: Note;
  options: Option[];
  recommended?: { value: string; reason: string };
  input: 'text' | 'amount' | 'date';
  /** A short sample answer shown under the question. */
  example?: string;
};

const ORDER: QuestionId[] = [
  'expense',
  'activity',
  'paid',
  'funding',
  'amount',
  'date',
  'bvWho',
  'bvWhat',
  'bvWhen',
  'bvRoute',
  'bvActivity',
];
const answered = (answers: ClaimAnswers, id: QuestionId) => answers[id] !== undefined;
const relevant = (answers: ClaimAnswers, id: QuestionId) =>
  isBv(id) ? answers.expense === 'vehicle' : id !== 'date' || answers.paid === true;

export function nextQuestion(answers: ClaimAnswers): QuestionId | null {
  return ORDER.find(id => relevant(answers, id) && !answered(answers, id)) || null;
}
/** The answered questions in order, for the transcript and for undo. */
export const answeredQuestions = (answers: ClaimAnswers) => ORDER.filter(id => relevant(answers, id) && answered(answers, id));
export function undoLast(answers: ClaimAnswers): ClaimAnswers {
  const last = answeredQuestions(answers).pop();
  if (!last) return answers;
  const next = { ...answers };
  delete next[last];
  return next;
}

/** One expense type when the text names exactly one; never a guess between two. */
export function expenseFromText(text: string): ExpenseType | null {
  const matched = (Object.keys(EXPENSE_TYPES) as ExpenseType[]).filter(id => EXPENSE_TYPES[id].pattern.test(text));
  // "ค่าน้ำดื่ม" also reads as food or drink; the narrower water rule wins.
  const narrowed = matched.includes('water') ? ['water' as const] : matched;
  return narrowed.length === 1 ? narrowed[0] : null;
}

const ACTIVITY_OPTIONS: Option[] = [
  { value: 'training', label: ACTIVITY_LABELS.training },
  { value: 'meeting', label: ACTIVITY_LABELS.meeting },
  { value: 'event', label: ACTIVITY_LABELS.event },
  { value: 'none', label: 'ไม่ได้ใช้ในกิจกรรม' },
];

export function questionView(
  id: QuestionId,
  answers: ClaimAnswers,
  packet?: Pick<ReceiptPacket, 'title' | 'purpose' | 'guidance'> & Partial<Pick<ReceiptPacket, 'project'>>,
): Question {
  const context = packet ? `${packet.title}\n${packet.purpose}` : '';
  switch (id) {
    case 'expense': {
      const guess = context ? expenseFromText(context) : null;
      return {
        id,
        text: 'เบิกค่าอะไร',
        why: { text: 'ประเภทค่าใช้จ่ายบอกหมวดและเพดานที่ใช้ เช่น ค่าน้ำดื่มเป็น B10 จ้างเหมารถเป็น BV', source: 'แนวปฏิบัติ AFP ข้อ 3' },
        options: (Object.keys(EXPENSE_TYPES) as ExpenseType[]).map(value => ({ value, label: EXPENSE_TYPES[value].label })),
        recommended: guess ? { value: guess, reason: 'จากชื่อเรื่องของชุดนี้' } : undefined,
        input: 'text',
      };
    }
    case 'activity': {
      const inferred = packet ? inferActivity(packet).activity : null;
      return {
        id,
        text: 'ใช้ในงานแบบไหน',
        why: { text: 'อบรม ประชุม หรือกิจกรรมที่มีผู้เข้าร่วม ต้องแนบใบเซ็นชื่อเข้าร่วม FM-AF-015', source: 'QP-AF-003 ข้อ 4.2 a' },
        options: ACTIVITY_OPTIONS,
        recommended: inferred && inferred !== 'other' ? { value: inferred, reason: 'จากชื่อเรื่องของชุดนี้' } : undefined,
        input: 'text',
      };
    }
    case 'paid':
      return {
        id,
        text: 'จ่ายเงินไปแล้วหรือยัง',
        why: {
          text: 'จ่ายแล้วต้องส่งใบเสร็จเข้าระบบตรวจใบเสร็จใน STeP MIS ทุกครั้ง ถ้ายังไม่จ่าย ต้องได้รับอนุมัติก่อนจ่าย',
          source: 'QP-AF-003 ข้อ 4.2 a, แนวปฏิบัติ AFP ข้อ 6',
        },
        options: [
          { value: 'yes', label: 'จ่ายแล้ว' },
          { value: 'no', label: 'ยังไม่จ่าย' },
        ],
        input: 'text',
      };
    case 'funding':
      return {
        id,
        text: 'ใช้เงินจากไหน',
        why: {
          text: 'ยืมเงินใช้สัญญายืม FM-AF-001 ส่วนจ่ายเงินตัวเองไปก่อนเป็นการสำรองจ่าย ไม่ต้องทำสัญญายืม แต่ต้องขออนุมัติก่อนจ่าย',
          source: 'QP-AF-003 ข้อ 4.1 และ 4.3',
        },
        options: [
          { value: 'advance', label: 'ยืมเงินจากการเงิน' },
          { value: 'own', label: 'จ่ายเงินตัวเองไปก่อน' },
          { value: 'unsure', label: 'ยังไม่แน่ใจ' },
        ],
        recommended:
          answers.paid === false
            ? { value: 'advance', reason: 'AFP แนะนำไม่ให้ใช้บัตรเครดิตส่วนตัว ถ้ายืมไม่ทันให้ติดต่องานการเงิน' }
            : undefined,
        input: 'text',
      };
    case 'amount':
      return {
        id,
        text: 'ยอดประมาณเท่าไร',
        why: {
          text: 'หมวด B รวมทุกรายการในหมวดย่อยเดียวกันได้ไม่เกิน 10,000 บาท งานจ้างที่เกินต้องผ่านงานพัสดุ',
          source: 'แนวปฏิบัติ AFP ข้อ 3.1 และ 3.3',
        },
        options: [{ value: 'unknown', label: 'ยังไม่ทราบ' }],
        input: 'amount',
      };
    case 'date':
      return {
        id,
        text: 'ใบเสร็จลงวันที่เท่าไร',
        why: {
          text: 'หมวด B ต้องทำรายงานขอความเห็นชอบใน STeP MIS ภายใน 3 วันทำการนับถัดจากวันที่ในใบเสร็จ หมวดฉุกเฉินภายใน 5 วันทำการ',
          source: 'แนวปฏิบัติ AFP ข้อ 3.1 และ 3.2',
        },
        options: [{ value: 'none', label: 'ยังไม่มีใบเสร็จ' }],
        input: 'date',
      };
    default:
      return bvQuestion(id, packet);
  }
}

const BV_WHY: Note = {
  text: 'AFP ขอให้เหตุผลการเดินทางหมวด BV ครบ 5 ส่วน ใคร ทำอะไร เมื่อไร จากไหนไปไหน เพื่อกิจกรรมอะไร เพื่อประกอบรายงานขอความเห็นชอบจ้างเหมารถตู้ตาม ว 119 เหตุผลสั้น ๆ เช่น "รับวิทยากร" มักถูกส่งกลับแก้',
  source: BV_SOURCE,
};
const UNKNOWN: Option = { value: 'unknown', label: 'ยังไม่ทราบ' };
const PROJECT_LIMIT = 120;

function bvQuestion(id: BvQuestionId, packet?: Partial<Pick<ReceiptPacket, 'project'>>): Question {
  const base = { id, why: BV_WHY, input: 'text' as const };
  if (id === 'bvWho')
    return {
      ...base,
      text: 'เหตุผลการเดินทาง: ใครเดินทาง',
      options: ['วิทยากร', 'ผู้เข้าร่วมกิจกรรม', 'บุคลากรอุทยานวิทยาศาสตร์ฯ'].map(label => ({ value: label, label })),
      example: 'พิมพ์เองได้ เช่น คณะผู้ประกอบการ 12 คน',
    };
  if (id === 'bvWhat')
    return {
      ...base,
      text: 'ใช้รถไปทำอะไร',
      options: ['รับ', 'ส่ง', 'รับ-ส่ง', 'อำนวยความสะดวกในการเดินทาง'].map(label => ({ value: label, label })),
    };
  if (id === 'bvWhen')
    return { ...base, text: 'เดินทางวันไหน', options: [UNKNOWN], example: 'เช่น 9 ก.ย. 2569 หรือ ระหว่างวันที่ 4–6 กันยายน 2569' };
  if (id === 'bvRoute')
    return {
      ...base,
      text: 'จากไหนไปไหน',
      options: [UNKNOWN],
      example: 'เช่น จากท่าอากาศยานเชียงใหม่ไปยังโรงแรม… หรือ ภายในกรุงเทพมหานคร',
    };
  const project = packet?.project?.replace(/\s+/g, ' ').trim() || '';
  const usable = project && project.length <= PROJECT_LIMIT ? project : '';
  return {
    ...base,
    text: 'เพื่อกิจกรรมหรือโครงการอะไร',
    options: usable ? [{ value: usable, label: usable }, UNKNOWN] : [UNKNOWN],
    recommended: usable ? { value: usable, reason: 'จากช่องโครงการของเรื่องนี้' } : undefined,
    example: 'เช่น เข้าร่วมกิจกรรมแถลงความสำเร็จโครงการ…',
  };
}

/** Free text read locally: a chip value, an amount or a date. null when it is not clearly one answer. */
export function parseAnswer(id: QuestionId, text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  if (isBv(id)) return /^(?:ยังไม่ทราบ|ไม่ทราบ|ไม่รู้|ไม่แน่ใจ)$/.test(value) ? 'unknown' : bvText(value);
  if (id === 'expense') return expenseFromText(value);
  if (id === 'activity') {
    if (/ไม่ใช่|ไม่ได้ใช้|ไม่มีกิจกรรม/.test(value)) return 'none';
    const found = (['training', 'meeting', 'event'] as const).filter(key =>
      key === 'training'
        ? /อบรม|workshop/i.test(value)
        : key === 'meeting'
          ? /ประชุม|สัมมนา/.test(value)
          : /กิจกรรม|งาน|event/i.test(value),
    );
    return found.length === 1 ? found[0] : null;
  }
  if (id === 'paid') return /ยังไม่|ยัง|ไม่ได้จ่าย/.test(value) ? 'no' : /จ่ายแล้ว|แล้ว|เรียบร้อย/.test(value) ? 'yes' : null;
  if (id === 'funding')
    return /ยืม/.test(value)
      ? 'advance'
      : /ตัวเอง|ส่วนตัว|สำรอง|ออกเอง/.test(value)
        ? 'own'
        : /ไม่แน่ใจ|ไม่รู้/.test(value)
          ? 'unsure'
          : null;
  if (id === 'amount') {
    if (/ไม่ทราบ|ไม่รู้/.test(value)) return 'unknown';
    const satang = moneySatang(value.replace(/บาท|฿/g, '').trim());
    return satang === null ? null : String(satang);
  }
  if (/ยังไม่มี/.test(value)) return 'none';
  return parseReceiptDate(value) ? value : null;
}

const BV_LIMIT = 200;
/** One line of the person's own words for a travel-reason part, or null when it is empty or too long. */
const bvText = (value: string) => {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean && clean.length <= BV_LIMIT ? clean : null;
};

export function applyAnswer(answers: ClaimAnswers, id: QuestionId, value: string): ClaimAnswers {
  const next = { ...answers };
  if (isBv(id)) {
    const clean = value === 'unknown' ? '' : bvText(value);
    if (clean === null) throw new Error('INVALID_INPUT');
    next[id] = clean;
  } else if (id === 'expense' && Object.hasOwn(EXPENSE_TYPES, value)) next.expense = value as ExpenseType;
  else if (id === 'activity' && ACTIVITY_OPTIONS.some(option => option.value === value)) next.activity = value as Activity | 'none';
  else if (id === 'paid' && (value === 'yes' || value === 'no')) {
    next.paid = value === 'yes';
    if (!next.paid) delete next.date;
  } else if (id === 'funding' && ['advance', 'own', 'unsure'].includes(value)) next.funding = value as ClaimAnswers['funding'];
  else if (id === 'amount' && (value === 'unknown' || /^\d+$/.test(value))) next.amount = value === 'unknown' ? null : Number(value);
  else if (id === 'date' && (value === 'none' || parseReceiptDate(value))) next.date = value === 'none' ? '' : value;
  else throw new Error('INVALID_INPUT');
  return next;
}

type Translate = (text: string, ...args: string[]) => string;
const plain: Translate = (text, ...args) => text.replace(/\{(\d+)\}/g, (_, index) => args[Number(index)] ?? '');

/** How an answer reads back in the transcript, in the UI language. */
export function answerLabel(id: QuestionId, answers: ClaimAnswers, translate: Translate = plain): string {
  if (id === 'expense') return answers.expense ? translate(EXPENSE_TYPES[answers.expense].label) : '';
  if (id === 'activity') return translate(ACTIVITY_OPTIONS.find(option => option.value === answers.activity)?.label || '');
  if (id === 'paid') return translate(answers.paid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย');
  if (id === 'funding')
    return translate(questionView('funding', answers).options.find(option => option.value === answers.funding)?.label || '');
  if (id === 'amount')
    return answers.amount === null || answers.amount === undefined
      ? translate('ยังไม่ทราบ')
      : translate('{0} บาท', formatSatang(answers.amount));
  // The person's own words stay as typed; only a chip label is translated.
  if (isBv(id))
    return answers[id]
      ? bvQuestion(id).options.some(o => o.value === answers[id])
        ? translate(answers[id]!)
        : answers[id]!
      : translate('ยังไม่ทราบ');
  return answers.date || translate('ยังไม่มีใบเสร็จ');
}
/** "B10 · ค่าน้ำดื่ม" in the UI language, or why there is no code. */
export function claimCategoryText(summary: Pick<ClaimSummary, 'expense' | 'code' | 'category'>, translate: Translate = plain) {
  if (summary.code) return `${summary.code} · ${translate(EXPENSE_TYPES[summary.expense].short)}`;
  return translate(summary.category === 'emergency' ? 'หมวดฉุกเฉิน' : 'ยังไม่มีหมวดในระบบ');
}
/** "เบิกค่าน้ำดื่ม" in the UI language. */
export const claimTitle = (expense: ExpenseType, translate: Translate = plain) =>
  translate('เบิก{0}', translate(EXPENSE_TYPES[expense].short));

const FINANCE: Record<string, FinanceChoice> = {
  'true:advance': 'b_clearance',
  'true:own': 'reserve_claim',
  'false:advance': 'b_advance',
  'false:own': 'reserve_approval',
};
const CAP = 1_000_000;

export type ClaimSummary = {
  expense: ExpenseType;
  category: ClaimCategory;
  code: string;
  finance: FinanceChoice;
  mode: ReceiptPacket['mode'];
  activity: Activity | 'auto';
  speaker: 'auto' | 'yes';
  title: string;
  documents: string[];
  /** The approval-report due date and its working days, for category B and emergency receipts with a date. */
  deadline: { date: string; days: number } | null;
  notes: Note[];
  /** For a vehicle hire (BV): the travel reason drafted from AFP's template, with [ ] where a part is still unknown. */
  travelReason: string | null;
};

/** The result of a finished interview; the documents come from the same checklist the packet shows. */
export function claimSummary(answers: ClaimAnswers, today = new Date()): ClaimSummary | null {
  if (nextQuestion(answers) || !answers.expense) return null;
  const rule = EXPENSE_TYPES[answers.expense];
  const finance = answers.funding && answers.funding !== 'unsure' ? FINANCE[`${answers.paid}:${answers.funding}`] : 'unknown';
  const activity = answers.activity && answers.activity !== 'none' ? answers.activity : 'auto';
  const probe = createReceiptPacket('00000000-0000-4000-8000-000000000000', today.toISOString());
  probe.mode = answers.paid ? 'paid' : 'awaiting-payment';
  probe.title = '';
  probe.guidance = {
    ...probe.guidance,
    activity,
    category: rule.category,
    finance,
    speaker: answers.expense === 'speaker' ? 'yes' : 'auto',
  };
  const documents = evidenceChecklist(probe)
    .filter(item => item.source !== 'need-source')
    .map(item => item.label);
  if (answers.expense === 'lodging') documents.push('เอกสารยืนยันการเข้าพัก (Folio)');
  const notes: Note[] = [...rule.notes];
  if (answers.amount && answers.amount > CAP && rule.category === 'B')
    notes.push({
      text: 'ยอดเกิน 10,000 บาท: หมวด B รวมทุกรายการในหมวดย่อยได้ไม่เกิน 10,000 บาท งานจ้างหรือบริการที่เกินต้องผ่านงานพัสดุ ห้ามใช้เงินยืม',
      source: 'แนวปฏิบัติ AFP ข้อ 3.1 และ 3.3',
    });
  if (answers.amount && answers.amount > CAP && rule.category === 'emergency')
    notes.push({ text: 'ยอดเกินวงเงินหมวดฉุกเฉิน 10,000 บาท โปรดปรึกษา AFP', source: 'แนวปฏิบัติ AFP ข้อ 3.2' });
  if (answers.funding === 'own')
    notes.push(
      answers.paid
        ? {
            text: 'ถ้ายังไม่ได้ขออนุมัติสำรองจ่ายไว้ก่อนจ่าย โปรดติดต่องานการเงิน เพราะห้ามจ่ายก่อนได้รับอนุมัติ',
            source: 'แนวปฏิบัติ AFP ข้อ 6',
          }
        : {
            text: 'ขออนุมัติสำรองจ่ายด้วย FM-AF-002 และ FM-AF-003 ให้เสร็จก่อนจ่ายเงิน',
            source: 'QP-AF-003 ข้อ 4.3 a, แนวปฏิบัติ AFP ข้อ 6',
          },
    );
  const travelReason =
    answers.expense === 'vehicle'
      ? draftBvReason({
          who: answers.bvWho,
          what: answers.bvWhat,
          when: answers.bvWhen,
          route: answers.bvRoute,
          activity: answers.bvActivity,
        })
      : null;
  if (travelReason && !checkBvReason(travelReason).ok)
    notes.push({
      text: 'เหตุผลการเดินทางยังขาดบางส่วน เติมในวงเล็บ [ ] ให้ครบก่อนส่ง AFP',
      source: BV_SOURCE,
    });
  if (rule.category === 'unsure' || rule.category === 'other')
    notes.push({ text: 'หมวดและเอกสารของค่าใช้จ่ายนี้ยังไม่มีกฎครบในระบบ โปรดยืนยันกับ AFP', source: 'ยังไม่มีแหล่งในระบบ' });
  const days = rule.category === 'B' ? 3 : rule.category === 'emergency' ? 5 : 0;
  const date = answers.date ? parseReceiptDate(answers.date) : null;
  const deadline = days && date ? { date: thaiDate(addWorkingDays(date, days)), days } : null;
  return {
    expense: answers.expense,
    category: rule.category,
    code: rule.code,
    finance,
    mode: answers.paid ? 'paid' : 'awaiting-payment',
    activity,
    speaker: answers.expense === 'speaker' ? 'yes' : 'auto',
    title: claimTitle(answers.expense),

    documents,
    deadline,
    notes,
    travelReason,
  };
}

/**
 * Apply a summary to a packet: category, finance case, activity and mode; a default title is replaced, a typed one kept.
 * A BV travel reason goes into the purpose when the purpose is empty or does not yet have all five parts; a complete one
 * the person wrote is kept.
 */
export function applyClaimSummary(packet: ReceiptPacket, summary: ClaimSummary): ReceiptPacket {
  const untitled = !packet.title.trim() || packet.title === 'ชุดเอกสารใหม่';
  const reason = summary.travelReason && !checkBvReason(packet.purpose).ok ? summary.travelReason : null;
  return {
    ...packet,
    title: untitled ? summary.title : packet.title,
    purpose: reason ?? packet.purpose,
    mode: summary.mode,
    guidance: {
      ...packet.guidance,
      category: summary.category,
      finance: summary.finance,
      activity: summary.activity,
      speaker: summary.speaker === 'yes' ? 'yes' : packet.guidance.speaker,
    },
  };
}

/** A closed-vocabulary handoff: answer labels and fixed rules only, no title, purpose, names or free text. */
export function claimAiPrompt(answers: ClaimAnswers, summary: ClaimSummary, translate: Translate = plain) {
  return [
    translate(
      'ช่วยอธิบายการเบิกครั้งนี้จากเอกสาร STeP ที่ตรวจได้ (แนวปฏิบัติ AFP และ QP-AF-003) ถ้าข้อมูลยังไม่พอให้ถามทีละข้อ ห้ามสรุปว่าเบิกได้หรืออนุมัติจ่าย',
    ),
    // The travel-reason answers are the person's own words (names, places), so they stay out like the title does.
    ...answeredQuestions(answers)
      .filter(id => !isBv(id))
      .map(id => `- ${translate(questionView(id, answers).text)}: ${answerLabel(id, answers, translate)}`),
    translate('หมวดที่ระบบเสนอ: {0}', claimCategoryText(summary, translate)),
    translate('อัตราที่ยังไม่มีในเอกสาร ให้บอกว่าต้องถาม AFP อย่าเดาตัวเลข'),
  ].join('\n');
}
