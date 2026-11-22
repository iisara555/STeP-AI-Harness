// The chat inside one disbursement case (ผู้ช่วยเบิกจ่าย): what the AI is told about the case, and the field
// proposals it may answer with. Proposals are checked here against the same fixed lists the case form uses; nothing
// reaches the case until the person accepts it.
import {
  ACTIVITY_LABELS,
  FINANCE_LABELS,
  evidenceChecklist,
  storedEvidenceGuidance,
  type Activity,
  type FinanceChoice,
} from './afp-evidence';
import { CLAIM_CATEGORY_LABELS, parseClaimCategory, type ClaimCategory } from './receipt-compliance';
import { PACKET_DOCUMENT_LABELS, packetCategoryTotals, formatSatang, type PacketListItem, type ReceiptPacket } from './receipt-packet';

type Translate = (text: string, ...values: (string | number)[]) => string;
const plain: Translate = (text, ...values) => values.reduce<string>((value, part, i) => value.replace(`{${i}}`, String(part)), text);

export const MODE_LABELS: Record<ReceiptPacket['mode'], string> = {
  paid: 'จ่ายแล้ว — เบิกคืนหรือเคลียร์เงินยืม',
  'awaiting-payment': 'รอจ่าย — เตรียมเอกสารให้ฝ่ายการเงิน',
};

export type ClaimUpdate = Partial<{
  title: string;
  project: string;
  purpose: string;
  mode: ReceiptPacket['mode'];
  category: ClaimCategory;
  finance: FinanceChoice;
  activity: Activity;
}>;

const LIMITS = { title: 200, project: 200, purpose: 1200 } as const;
const FENCE = /```claim-update[ \t]*\r?\n([\s\S]*?)```/g;

/**
 * The case as the AI sees it: fixed labels, counts and the checklist's own wording. The title, purpose and file names
 * are the person's text, so they stay out; the person can say them in the chat, where the usual send checks apply.
 */
export function caseContext(packet: ReceiptPacket, translate: Translate = plain) {
  const guidance = storedEvidenceGuidance(packet.guidance);
  const kinds = new Map<string, number>();
  for (const doc of packet.documents)
    for (const page of doc.pages) if (page.included) kinds.set(page.kind, (kinds.get(page.kind) || 0) + 1);
  const checklist = evidenceChecklist(packet);
  const status = { checked: 'ตรวจแล้ว', unchecked: 'มีแล้ว รอตรวจ', suggested: 'อาจมีแล้ว รอยืนยันประเภท', missing: 'ยังไม่มี' } as const;
  const totals = packetCategoryTotals(packet);
  return [
    translate('ข้อมูลเรื่องเบิกในแอป (ไม่ใช่การอนุมัติ)'),
    translate('ประเภทงาน: {0}', translate(MODE_LABELS[packet.mode])),
    translate('หมวด: {0}', translate(CLAIM_CATEGORY_LABELS[guidance.category])),
    translate('กรณีการเงิน: {0}', translate(FINANCE_LABELS[guidance.finance])),
    translate('กิจกรรม: {0}', translate(ACTIVITY_LABELS[guidance.activity])),
    translate('ชื่อเรื่อง: {0}', packet.title.trim() && packet.title !== 'ชุดเอกสารใหม่' ? translate('กรอกแล้ว') : translate('ยังไม่กรอก')),
    translate('หลักฐาน: {0} ไฟล์', packet.documents.length),
    ...[...kinds].map(([kind, pages]) =>
      translate('- {0}: {1} หน้า', translate(PACKET_DOCUMENT_LABELS[kind as keyof typeof PACKET_DOCUMENT_LABELS] || kind), pages),
    ),
    ...totals.map(total =>
      translate(
        'ยอดใบเสร็จที่ตรวจแล้ว {0}: {1} บาท จาก {2} ใบ',
        total.code || translate(total.category === 'unsure' ? 'ยังไม่ระบุหมวด' : CLAIM_CATEGORY_LABELS[total.category]),
        formatSatang(total.total),
        total.receipts,
      ),
    ),
    checklist.length ? translate('รายการเอกสารที่แอปแนะนำ:') : '',
    ...checklist.map(item => `- ${translate(item.label)}: ${translate(status[item.status])}`),
  ]
    .filter(Boolean)
    .join('\n');
}

const pick = <T extends string>(value: unknown, allowed: Record<T, unknown>): T | undefined =>
  typeof value === 'string' && Object.hasOwn(allowed, value) ? (value as T) : undefined;
const textField = (value: unknown, max: number) => {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean && clean.length <= max ? clean : undefined;
};

/** Reads one proposal block; unknown keys and values outside the fixed lists are dropped, never guessed. */
export function readClaimUpdate(raw: string): ClaimUpdate | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const update: ClaimUpdate = {};
  for (const key of ['title', 'project', 'purpose'] as const) {
    const text = textField(input[key], LIMITS[key]);
    if (text) update[key] = text;
  }
  const mode = pick(input.mode, MODE_LABELS);
  if (mode) update.mode = mode;
  const category = parseClaimCategory(input.category);
  if (category) update.category = category;
  const finance = pick(input.finance, FINANCE_LABELS);
  if (finance) update.finance = finance;
  const activity = pick(input.activity, ACTIVITY_LABELS);
  if (activity && activity !== 'auto') update.activity = activity;
  return Object.keys(update).length ? update : null;
}

/** The reply without its proposal blocks, and the last readable proposal in it. */
export function splitClaimReply(text: string): { text: string; update: ClaimUpdate | null } {
  let update: ClaimUpdate | null = null;
  const rest = text.replace(FENCE, (_, body: string) => {
    update = readClaimUpdate(body.trim()) || update;
    return '';
  });
  return { text: rest.replace(/\n{3,}/g, '\n\n').trim(), update };
}

/** Only what would change: a proposal that matches the case already is not shown again. */
export function pendingClaimUpdate(packet: ReceiptPacket, update: ClaimUpdate | null): ClaimUpdate | null {
  if (!update) return null;
  const guidance = storedEvidenceGuidance(packet.guidance);
  const current: Required<ClaimUpdate> = {
    title: packet.title,
    project: packet.project,
    purpose: packet.purpose,
    mode: packet.mode,
    category: guidance.category,
    finance: guidance.finance,
    activity: guidance.activity as Activity,
  };
  const changed = Object.fromEntries(
    Object.entries(update).filter(([key, value]) => current[key as keyof ClaimUpdate] !== value),
  ) as ClaimUpdate;
  return Object.keys(changed).length ? changed : null;
}

export function applyClaimUpdate(packet: ReceiptPacket, update: ClaimUpdate): ReceiptPacket {
  const guidance = storedEvidenceGuidance(packet.guidance);
  return {
    ...packet,
    title: update.title ?? packet.title,
    project: update.project ?? packet.project,
    purpose: update.purpose ?? packet.purpose,
    mode: update.mode ?? packet.mode,
    guidance: {
      ...guidance,
      category: update.category ?? guidance.category,
      finance: update.finance ?? guidance.finance,
      activity: update.activity ?? guidance.activity,
    },
  };
}

/** Label and shown value of each proposed field, in the form's order. */
export function claimUpdateRows(update: ClaimUpdate, translate: Translate = plain) {
  const rows: { key: keyof ClaimUpdate; label: string; value: string }[] = [];
  if (update.title) rows.push({ key: 'title', label: translate('ชื่อเรื่องเบิก'), value: update.title });
  if (update.project) rows.push({ key: 'project', label: translate('โครงการหรือหน่วยงาน'), value: update.project });
  if (update.purpose) rows.push({ key: 'purpose', label: translate('วัตถุประสงค์'), value: update.purpose });
  if (update.mode) rows.push({ key: 'mode', label: translate('ประเภทงาน'), value: translate(MODE_LABELS[update.mode]) });
  if (update.category) rows.push({ key: 'category', label: translate('หมวด'), value: translate(CLAIM_CATEGORY_LABELS[update.category]) });
  if (update.finance) rows.push({ key: 'finance', label: translate('กรณีการเงิน'), value: translate(FINANCE_LABELS[update.finance]) });
  if (update.activity) rows.push({ key: 'activity', label: translate('กิจกรรม'), value: translate(ACTIVITY_LABELS[update.activity]) });
  return rows;
}

/** The short marks a case shows in the list: its category code (none while unsure) and how many files it holds. */
export function caseListMarks(item: PacketListItem) {
  const short: Record<string, string> = { B: 'B', BV: 'BV', emergency: 'ฉุกเฉิน', other: 'อื่น' };
  return { category: (item.category && short[item.category]) || '', files: item.documentCount };
}

/** The one line under a case in the list: its category and how much evidence it holds. */
export function caseListStatus(item: PacketListItem, translate: Translate = plain) {
  const category =
    item.category && item.category !== 'unsure' ? translate(CLAIM_CATEGORY_LABELS[item.category]) : translate('ยังไม่ระบุหมวด');
  return item.documentCount
    ? translate('{0} · หลักฐาน {1} ไฟล์', category, item.documentCount)
    : translate('{0} · ยังไม่มีหลักฐาน', category);
}
