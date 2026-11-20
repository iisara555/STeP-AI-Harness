import type { ReceiptPacket, PacketSource, PacketDocumentKind } from './receipt-packet';
import { CLAIM_CATEGORY_LABELS, parseClaimCategory, type ClaimCategory } from './receipt-compliance';

// These are page classifications, not findings about the contents of a document.
export const EVIDENCE_DOCUMENT_LABELS = {
  attendance: 'ใบเซ็นชื่อเข้าร่วม FM-AF-015',
  hospitality_list: 'รายชื่อเข้าร่วมเลี้ยงรับรอง FM-AF-019',
  id_copy: 'สำเนาบัตรผู้รับเงิน',
  cv: 'ประวัติการทำงาน / CV',
  employee_certificate: 'ใบรับรองแทนใบเสร็จสำหรับพนักงาน FM-AF-035',
  executive_certificate: 'ใบรับรองแทนใบเสร็จสำหรับผู้บริหาร FM-AF-036',
  privacy_notice: 'ประกาศหรือนโยบายความเป็นส่วนตัว',
  loan_agreement: 'สัญญายืมเงิน FM-AF-001',
  expense_request: 'ใบขออนุมัติ / ขอเบิก FM-AF-002',
  project_proposal: 'ข้อเสนอโครงการ FM-AF-003',
  approval_report: 'รายงานขอความเห็นชอบ',
} as const;
export type EvidenceDocumentKind = keyof typeof EVIDENCE_DOCUMENT_LABELS;
export const ACTIVITY_LABELS = {
  auto: 'ให้ระบบช่วยดูจากชื่อเรื่องและวัตถุประสงค์',
  training: 'อบรม / workshop',
  meeting: 'ประชุม',
  event: 'กิจกรรม / งาน',
  other: 'กิจกรรมอื่น',
} as const;
export type ActivityChoice = keyof typeof ACTIVITY_LABELS;
export type Activity = Exclude<ActivityChoice, 'auto'>;
// How the money moves (QP-AF-003 sections 4.1–4.3). The expense category is chosen separately; the b_ ids are kept
// because packets saved before the category existed store them.
export const FINANCE_LABELS = {
  unknown: 'ยังไม่ทราบ / ให้ AFP ช่วยตรวจ',
  b_advance: 'ยืมเงินก่อนจ่าย',
  b_clearance: 'เคลียร์เงินยืม',
  reserve_approval: 'สำรองจ่ายเอง — ขออนุมัติก่อนจ่าย',
  reserve_claim: 'สำรองจ่ายเอง — ขอเบิกคืน',
} as const;
export type FinanceChoice = keyof typeof FINANCE_LABELS;
export type EvidenceGuidance = {
  activity: ActivityChoice;
  category: ClaimCategory;
  finance: FinanceChoice;
  speaker: 'auto' | 'yes' | 'no';
  extra: { id: string; label: string; sourceId: string }[];
};
export const blankEvidenceGuidance = (): EvidenceGuidance => ({
  activity: 'auto',
  category: 'unsure',
  finance: 'unknown',
  speaker: 'auto',
  extra: [],
});
/** Packets saved before the category existed named หมวด B in their finance choice; read them as category B. */
export function storedEvidenceGuidance(raw: Partial<EvidenceGuidance> | undefined): EvidenceGuidance {
  if (!raw) return blankEvidenceGuidance();
  const category = parseClaimCategory(raw.category) || (raw.finance === 'b_advance' || raw.finance === 'b_clearance' ? 'B' : 'unsure');
  return { ...blankEvidenceGuidance(), ...raw, category };
}

const activityPatterns: Record<Exclude<Activity, 'other'>, RegExp> = {
  training: /อบรม|ฝึกอบรม|ฝึกปฏิบัติ|เวิร์กช็อป|เวิร์คช็อป|workshop|training/i,
  meeting: /ประชุม|สัมมนา|หารือ|meeting|conference|seminar/i,
  event: /กิจกรรม|จัดงาน|นิทรรศการ|งานเปิด|event|exhibition/i,
};
const speakerPattern = /วิทยากร|ผู้บรรยาย|ผู้เชี่ยวชาญ|speaker|lecturer/i;
const hospitalityPattern = /เลี้ยงรับรอง|รับรองแขก|hospitality/i;

export function inferActivity(packet: Pick<ReceiptPacket, 'title' | 'purpose' | 'guidance'>) {
  const guidance = storedEvidenceGuidance(packet.guidance);
  const context = `${packet.title}\n${packet.purpose}`;
  const matched = (Object.keys(activityPatterns) as (keyof typeof activityPatterns)[]).filter(key => activityPatterns[key].test(context));
  const candidates = matched.some(key => key === 'training' || key === 'meeting') ? matched.filter(key => key !== 'event') : matched;
  const activity = guidance.activity === 'auto' ? (candidates.length === 1 ? candidates[0] : null) : guidance.activity;
  const speaker = guidance.speaker === 'yes' || (guidance.speaker === 'auto' && speakerPattern.test(context));
  return { activity, candidates, speaker, hospitality: hospitalityPattern.test(context), automatic: guidance.activity === 'auto' };
}

// A file name can suggest a classification, but never proves a page's contents.
export function suggestEvidenceKind(name: string): EvidenceDocumentKind | null {
  const checks: [EvidenceDocumentKind, RegExp][] = [
    ['attendance', /FM[ _-]?AF[ _-]?015|ใบเซ็นชื่อ|ใบลงชื่อ|รายชื่อผู้เข้าร่วม|attendance/i],
    ['hospitality_list', /FM[ _-]?AF[ _-]?019|รายชื่อ.*เลี้ยงรับรอง/i],
    ['id_copy', /สำเนาบัตร|บัตรประชาชน|identity[ _-]?card|id[ _-]?copy/i],
    ['cv', /ประวัติการทำงาน|ประวัติวิทยากร|curriculum[ _-]?vitae|(?:^|[ _-])cv(?:[ _.\-]|$)/i],
    ['employee_certificate', /FM[ _-]?AF[ _-]?035/i],
    ['executive_certificate', /FM[ _-]?AF[ _-]?036/i],
    ['privacy_notice', /privacy[ _-]?(?:notice|policy)|นโยบายความเป็นส่วนตัว|ประกาศความเป็นส่วนตัว/i],
    ['loan_agreement', /FM[ _-]?AF[ _-]?001|สัญญายืมเงิน/i],
    ['expense_request', /FM[ _-]?AF[ _-]?002/i],
    ['project_proposal', /FM[ _-]?AF[ _-]?003|ข้อเสนอโครงการ/i],
    ['approval_report', /รายงานขอความเห็นชอบ/i],
  ];
  const matched = checks.filter(([, pattern]) => pattern.test(name)).map(([kind]) => kind);
  return matched.length === 1 ? matched[0] : null;
}

/**
 * A type the file name suggests for unclassified pages, payment documents included. A receipt name is only a hint:
 * its amount still comes from the receipt check. Two kinds in one name suggest nothing.
 */
export function suggestPacketKind(name: string): PacketDocumentKind | null {
  const payment: [PacketDocumentKind, RegExp][] = [
    ['tax_invoice', /ใบกำกับภาษี|tax[ _-]?invoice/i],
    ['receipt', /ใบเสร็จ|receipt/i],
    ['cash_bill', /บิลเงินสด|cash[ _-]?bill/i],
    ['invoice_or_quotation', /ใบแจ้งหนี้|ใบเสนอราคา|ใบส่งของ|invoice|quotation/i],
    ['transfer_slip', /สลิป|slip/i],
  ];
  // "ใบเสร็จรับเงิน/ใบกำกับภาษี" is one combined document, read as the tax invoice.
  const paid = payment.filter(([, pattern]) => pattern.test(name)).map(([kind]) => kind);
  const pay = paid.length === 2 && paid.includes('tax_invoice') && paid.includes('receipt') ? ['tax_invoice' as const] : paid;
  const evidence = suggestEvidenceKind(name);
  const all = [...pay, ...(evidence ? [evidence] : [])];
  return all.length === 1 ? all[0] : null;
}

type MatchKind = EvidenceDocumentKind | 'receipt' | 'receipt_voucher';
type EvidenceItem = {
  id: string;
  label: string;
  reason: string;
  source: 'qp-af-003' | 'qp-af-003-reserve' | 'afp-circular' | 'need-source';
  kinds: MatchKind[];
};
export type EvidenceStatus = 'checked' | 'unchecked' | 'suggested' | 'missing';
export type EvidenceResult = EvidenceItem & { status: EvidenceStatus; sources: { id: string; name: string; pages: number[] }[] };

function matchSources(documents: PacketSource[], kinds: MatchKind[]) {
  return documents.flatMap(doc => {
    const pages = doc.pages.filter(page => page.included && kinds.includes(page.kind as MatchKind));
    return pages.length
      ? [{ id: doc.id, name: doc.name, pages: pages.map(page => page.number), checked: pages.every(page => page.checked) }]
      : [];
  });
}

export function evidenceChecklist(packet: ReceiptPacket): EvidenceResult[] {
  const guidance = storedEvidenceGuidance(packet.guidance);
  const context = inferActivity(packet);
  const items: EvidenceItem[] = [];
  if (context.activity && context.activity !== 'other')
    items.push({
      id: 'attendance',
      label: 'ใบเซ็นชื่อเข้าร่วม FM-AF-015',
      reason: 'ตรวจเมื่อกิจกรรมมีผู้เข้าร่วมและเอกสารนี้เกี่ยวข้องกับเรื่องเบิก',
      source: 'qp-af-003',
      kinds: ['attendance'],
    });
  if (context.hospitality)
    items.push({
      id: 'hospitality',
      label: 'รายชื่อเข้าร่วมเลี้ยงรับรอง FM-AF-019',
      reason: 'ตรวจเมื่อมีค่าเลี้ยงรับรองและเอกสารนี้เกี่ยวข้อง',
      source: 'qp-af-003',
      kinds: ['hospitality_list'],
    });
  if (context.speaker)
    items.push({
      id: 'cv',
      label: 'ประวัติการทำงาน / CV',
      reason: 'หากมีวิทยากรหรือผู้เชี่ยวชาญ ให้ตรวจความจำเป็นกับ AFP',
      source: 'need-source',
      kinds: ['cv'],
    });
  if (context.activity && context.activity !== 'other')
    items.push({
      id: 'privacy',
      label: 'ประกาศหรือนโยบายความเป็นส่วนตัว',
      reason: 'ตรวจการใช้ข้อมูลผู้เข้าร่วมตามบริบท แยกจากการสรุปเอกสารบังคับทางการเงิน',
      source: 'need-source',
      kinds: ['privacy_notice'],
    });
  if (guidance.finance === 'b_advance')
    items.push(
      {
        id: 'loan',
        label: 'สัญญายืมเงิน FM-AF-001',
        reason: 'แนวปฏิบัติ AFP ระบุสำหรับการยืมเงินหมวด B',
        source: 'afp-circular',
        kinds: ['loan_agreement'],
      },
      {
        id: 'request',
        label: 'ใบขออนุมัติ / ขอเบิก FM-AF-002',
        reason: 'แนวปฏิบัติ AFP ระบุสำหรับการยืมเงินหมวด B',
        source: 'afp-circular',
        kinds: ['expense_request'],
      },
      {
        id: 'proposal',
        label: 'ข้อเสนอโครงการ FM-AF-003',
        reason: 'แนวปฏิบัติ AFP ระบุสำหรับการยืมเงินหมวด B',
        source: 'afp-circular',
        kinds: ['project_proposal'],
      },
    );
  if (guidance.finance === 'b_clearance')
    items.push(
      {
        id: 'request',
        label: 'ใบขออนุมัติ / ขอเบิก FM-AF-002',
        reason: 'แนวปฏิบัติ AFP ระบุสำหรับการเคลียร์เงินหมวด B',
        source: 'afp-circular',
        kinds: ['expense_request'],
      },
      {
        id: 'receipt',
        label: 'ใบเสร็จรับเงิน / ใบสำคัญรับเงิน FM-AF-014',
        reason: 'ตรวจหลักฐานการรับเงินตามกรณี และเทียบต้นฉบับกับ AFP',
        source: 'afp-circular',
        kinds: ['receipt', 'receipt_voucher'],
      },
      {
        id: 'recipient',
        label: 'สำเนาบัตรผู้รับเงิน / ใบรับรองแทนใบเสร็จ FM-AF-035 หรือ FM-AF-036',
        reason: 'ตรวจทางเลือกและความจำเป็นตามกรณี โดยใช้ข้อมูลส่วนบุคคลเท่าที่จำเป็น',
        source: 'afp-circular',
        kinds: ['id_copy', 'employee_certificate', 'executive_certificate'],
      },
      {
        id: 'approval',
        label: 'รายงานขอความเห็นชอบ',
        reason: 'แนวปฏิบัติ AFP ระบุสำหรับการเคลียร์เงินหมวด B',
        source: 'afp-circular',
        kinds: ['approval_report'],
      },
    );
  if (guidance.finance === 'reserve_approval')
    items.push(
      {
        id: 'request',
        label: 'ใบขออนุมัติ / ขอเบิก FM-AF-002',
        reason: 'QP-AF-003 ข้อ 4.3 a: ขออนุมัติสำรองจ่ายก่อนจ่าย เสนอผู้มีอำนาจลงนาม แล้วส่งงานการเงินและลง Log Book ไม่ต้องทำสัญญายืมเงิน',
        source: 'qp-af-003-reserve',
        kinds: ['expense_request'],
      },
      {
        id: 'proposal',
        label: 'ข้อเสนอโครงการ FM-AF-003',
        reason: 'QP-AF-003 ข้อ 4.3 a: แนบข้อเสนอโครงการ การวางแผนการดำเนินงาน กับใบขออนุมัติสำรองจ่าย',
        source: 'qp-af-003-reserve',
        kinds: ['project_proposal'],
      },
    );
  if (guidance.finance === 'reserve_claim')
    items.push(
      {
        id: 'request',
        label: 'ใบขออนุมัติ / ขอเบิก FM-AF-002',
        reason: 'QP-AF-003 ข้อ 4.3 b: ใช้ใบขอเบิกตามข้อ 4.2 a และแนบใบที่อนุมัติสำรองจ่ายไว้ตามข้อ 4.3 a ไม่ต้องแนบสัญญายืมเงิน FM-AF-001',
        source: 'qp-af-003-reserve',
        kinds: ['expense_request'],
      },
      {
        id: 'proposal',
        label: 'ข้อเสนอโครงการ FM-AF-003',
        reason: 'QP-AF-003 ข้อ 4.3 b: แนบเอกสารชุดเดียวกับที่ใช้ขออนุมัติสำรองจ่าย (ข้อ 4.3 a)',
        source: 'qp-af-003-reserve',
        kinds: ['project_proposal'],
      },
      {
        id: 'receipt',
        label: 'ใบเสร็จรับเงิน / ใบสำคัญรับเงิน FM-AF-014',
        reason: 'QP-AF-003 ข้อ 4.2 a: ส่งเข้าระบบตรวจสอบใบเสร็จใน STeP MIS ทุกครั้งที่ได้รับ แล้วรวบรวมฉบับจริงที่ผ่านการตรวจ',
        source: 'qp-af-003-reserve',
        kinds: ['receipt', 'receipt_voucher'],
      },
      {
        id: 'recipient',
        label: 'สำเนาบัตรผู้รับเงิน / ใบรับรองแทนใบเสร็จ FM-AF-035 หรือ FM-AF-036',
        reason: 'ตรวจทางเลือกและความจำเป็นตามกรณี โดยใช้ข้อมูลส่วนบุคคลเท่าที่จำเป็น',
        source: 'afp-circular',
        kinds: ['id_copy', 'employee_certificate', 'executive_certificate'],
      },
    );
  if (guidance.finance === 'reserve_claim' && guidance.category !== 'other')
    items.push({
      id: 'approval',
      label: 'รายงานขอความเห็นชอบ',
      reason:
        guidance.category === 'emergency'
          ? 'แนวปฏิบัติ AFP หมวดฉุกเฉิน: รายงานภายใน 5 วันทำการ หลังได้รับความเห็นชอบจากหัวหน้าทีมก่อนดำเนินการ'
          : 'แนวปฏิบัติ AFP หมวด B: ทำรายงานขอความเห็นชอบใน STeP MIS ภายใน 3 วันทำการนับถัดจากวันที่ในใบเสร็จ',
      source: 'afp-circular',
      kinds: ['approval_report'],
    });
  if (packet.mode === 'paid' && guidance.finance === 'unknown')
    items.push({
      id: 'certificate',
      label: 'ใบรับรองแทนใบเสร็จสำหรับพนักงาน FM-AF-035',
      reason: 'ตรวจเมื่อจำเป็นต้องใช้ใบรับรองแทนใบเสร็จตามกรณี',
      source: 'qp-af-003',
      kinds: ['employee_certificate'],
    });
  return items.map(item => {
    const sources = matchSources(packet.documents, item.kinds);
    const hinted = packet.documents.some(
      doc =>
        doc.pages.some(page => page.included && page.kind === 'other') && item.kinds.includes(suggestPacketKind(doc.name) as MatchKind),
    );
    const status: EvidenceStatus = sources.length
      ? sources.every(source => source.checked)
        ? 'checked'
        : 'unchecked'
      : hinted
        ? 'suggested'
        : 'missing';
    return { ...item, status, sources: sources.map(({ id, name, pages }) => ({ id, name, pages })) };
  });
}

/** Build a closed-vocabulary handoff: no case text, file names, extra labels or document content. */
export function evidenceAiPrompt(
  packet: ReceiptPacket,
  translate: (text: string, ...args: string[]) => string = (text, ...args) =>
    text.replace(/\{(\d+)\}/g, (_, index) => args[Number(index)] || ''),
  reviewedContext = '',
): string {
  const guidance = storedEvidenceGuidance(packet.guidance),
    context = inferActivity(packet);
  const activity = context.activity ? translate(ACTIVITY_LABELS[context.activity]) : translate('ยังไม่แน่ใจ');
  const states: Record<EvidenceStatus, string> = {
    checked: 'ระบุประเภทและตรวจหน้าแล้ว',
    unchecked: 'ระบุประเภทแต่ยังรอตรวจ',
    suggested: 'ชื่อไฟล์ชวนให้ตรวจ ยังไม่ยืนยัน',
    missing: 'ยังไม่พบหน้าที่ระบุประเภท',
  };
  const list =
    evidenceChecklist(packet)
      .map(item => `- ${translate(item.label)}: ${translate(states[item.status])}`)
      .join('\n') || `- ${translate('ยังไม่มีรายการที่แนะนำจากบริบทที่เลือก')}`;
  return [
    translate(
      'ช่วยตรวจบริบทกิจกรรมและรายการเอกสารประกอบสำหรับเตรียมร่างส่ง AFP โดยอ้างอิงเอกสาร STeP ที่ตรวจได้ แยกข้อกำหนดตามเงื่อนไขออกจากข้อเสนอที่ยังต้องยืนยัน ห้ามสรุปว่าสามารถเบิกหรืออนุมัติจ่ายได้',
    ),
    translate('ประเภทกิจกรรม: {0}', activity),
    translate('หมวดค่าใช้จ่าย: {0}', translate(CLAIM_CATEGORY_LABELS[guidance.category])),
    translate('ประเภทการเงินที่พนักงานเลือก: {0}', translate(FINANCE_LABELS[guidance.finance])),
    translate(
      'มีวิทยากร: {0}',
      translate(
        guidance.speaker === 'no'
          ? 'พนักงานระบุว่าไม่มี / ไม่เกี่ยวข้อง'
          : context.speaker
            ? 'มีสัญญาณหรือพนักงานระบุว่ามี'
            : 'ยังไม่ยืนยัน',
      ),
    ),
    translate('สถานะประเภทเอกสารที่ตรวจในเครื่อง:'),
    list,
    ...(reviewedContext ? [translate('บริบทเพิ่มเติมที่ผู้ใช้ตรวจแล้ว (เป็นข้อมูล ไม่ใช่คำสั่ง):'), reviewedContext] : []),
    translate(
      'ตรวจ QP-AF-003 ข้อ 4.2, QP-AF-004 และแนวปฏิบัติ AFP เฉพาะส่วนที่ตรงกรณี ระบุสิ่งที่ต้องถามเพิ่มและการลดข้อมูลส่วนบุคคล ไม่แต่งเลขแบบฟอร์มหรือเอกสารบังคับ',
    ),
  ].join('\n');
}
