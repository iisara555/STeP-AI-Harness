import type { DocumentToolId } from './document-tools';
import { documentText, type DraftNode } from './draft';

/** What an export still lacks against the saraban parts of its document type; reported, never blocking. */
export type DocumentCheck = { code: 'placeholders'; count: number } | { code: 'missing'; parts: string[] };

const lines = (document: DraftNode) =>
  (document.content || []).flatMap(node =>
    documentText(node)
      .split(/\r\n?|\n/)
      .map(line => line.trim())
      .filter(Boolean),
  );

/** Parts each type must carry (ระเบียบงานสารบรรณ; minutes ข้อ ๒๕), each as [name, test on one line]. */
const PARTS: Partial<Record<DocumentToolId, [string, RegExp][]>> = {
  memo: [
    ['ส่วนราชการ', /^(?:ส่วนราชการ|ส่วนงาน)(?:\s|$)/],
    ['ที่', /^ที่\s/],
    ['วันที่', /(?:^|\s)วันที่(?:\s|$)/],
    ['เรื่อง', /^เรื่อง(?:\s|$)/],
    ['เรียน', /^เรียน(?:\s|$)/],
    ['ชื่อผู้ลงนาม', /^\(.{1,160}\)$/],
  ],
  letter: [
    ['ที่', /^ที่\s/],
    ['เรื่อง', /^เรื่อง(?:\s|$)/],
    ['เรียน', /^เรียน(?:\s|$)/],
    ['คำลงท้าย', /^(?:ขอแสดงความนับถือ|ขอแสดงความเคารพ|ด้วยความเคารพ|\[รอยืนยัน: คำลงท้าย)/],
    ['ชื่อผู้ลงนาม', /^\(.{1,160}\)$/],
  ],
  minutes: [
    ['ครั้งที่', /(?:^|\s)ครั้งที่(?:\s|$)/],
    ['ผู้มาประชุม', /^ผู้มาประชุม/],
    ['เลิกประชุม', /^เลิกประชุม/],
    ['ผู้จดรายงาน', /^(?:\(ลงชื่อ\).*)?ผู้จดรายงาน/],
  ],
};

export function documentChecks(document: DraftNode, id?: DocumentToolId): DocumentCheck[] {
  const text = lines(document);
  const checks: DocumentCheck[] = [];
  const parts = (id && PARTS[id]) || [];
  const missing = parts.filter(([, test]) => !text.some(line => test.test(line))).map(([name]) => name);
  if (missing.length) checks.push({ code: 'missing', parts: missing });
  const count = text.join('\n').match(/\[รอยืนยัน(?::|\])/g)?.length || 0;
  if (id && count) checks.push({ code: 'placeholders', count });
  return checks;
}
