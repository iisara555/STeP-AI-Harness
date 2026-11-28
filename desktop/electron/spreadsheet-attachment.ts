// Host-side spreadsheet extraction formatter & numeric statistics builder for .xlsx, .csv, and .tsv attachments.
// Computes exact totals/averages/min/max in trusted host code so the AI does not miscalculate office budgets or tables.

export type ColumnNumericStat = {
  column: string;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
};

export type ExtractedWorksheet = {
  name: string;
  rowCount: number;
  columnCount: number;
  previewRows: string[][];
  truncatedRows: boolean;
  truncatedCols: boolean;
  formulaCount: number;
  numericStats: ColumnNumericStat[];
};

const NUM_FMT = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const fmt = (n: number) => (Number.isFinite(n) ? NUM_FMT.format(n) : '–');
const cleanCell = (value: string) =>
  String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
    .slice(0, 160);

/** Parses a spreadsheet scalar as a summable numeric quantity, ignoring identifier-like leading-zero codes and tax IDs. */
export function parseSummableNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 24) return null;
  // Skip phone numbers, tax IDs, bank accounts, postal codes, and padded identifiers (e.g. "0812345678", "0012").
  if (/^0\d{2,}$/.test(trimmed)) return null;
  if (/^\d{10,13}$/.test(trimmed)) return null;
  const normalized = trimmed
    .replace(/^[฿$€£]\s*/, '')
    .replace(/\s*%$/, '')
    .replace(/,/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/** Computes exact host-verified numeric statistics per column from a 2D table whose first row holds column headings. */
export function computeColumnStats(rows: unknown[][], maxRows = 5000): ColumnNumericStat[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((v, i) => String(v ?? '').trim() || `คอลัมน์ ${i + 1}`);
  const colCount = Math.min(header.length, 30);
  const stats: ColumnNumericStat[] = [];
  const dataRowEnd = Math.min(rows.length, maxRows + 1);

  for (let c = 0; c < colCount; c++) {
    let count = 0;
    let nonEmpty = 0;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let r = 1; r < dataRowEnd; r++) {
      const cell = rows[r]?.[c];
      if (cell === null || cell === undefined || String(cell).trim() === '') continue;
      nonEmpty++;
      const num = parseSummableNumber(cell);
      if (num === null) continue;
      count++;
      sum += num;
      if (num < min) min = num;
      if (num > max) max = num;
    }
    // Only report numeric stats when at least 2 numeric values exist and at least half of non-empty cells are numeric.
    if (count >= 2 && count * 2 >= nonEmpty) {
      stats.push({
        column: header[c].slice(0, 60),
        count,
        sum: Number(sum.toPrecision(12)),
        avg: Number((sum / count).toPrecision(12)),
        min,
        max,
      });
    }
  }
  return stats;
}

function renderStatsTable(stats: ColumnNumericStat[]): string {
  if (!stats.length) return '';
  const lines = [
    '### สรุปสถิติตัวเลขที่ระบบคำนวณจากข้อมูลจริง',
    '| คอลัมน์ | จำนวนค่า | ผลรวม | ค่าเฉลี่ย | ต่ำสุด | สูงสุด |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...stats.map(s => `| ${cleanCell(s.column)} | ${fmt(s.count)} | ${fmt(s.sum)} | ${fmt(s.avg)} | ${fmt(s.min)} | ${fmt(s.max)} |`),
  ];
  return lines.join('\n');
}

/** Formats extracted Excel worksheets into a bounded Markdown summary + preview tables ready for privacy scanning. */
export function formatWorkbookForAttachment(sheets: ExtractedWorksheet[], maxChars = 150_000): { text: string; totalRows: number } {
  const totalRows = sheets.reduce((acc, s) => acc + s.rowCount, 0);
  const parts: string[] = [`# ข้อมูลจากไฟล์ Excel (${sheets.length} ชีต · รวม ${fmt(totalRows)} แถว)`];
  let chars = parts[0].length;

  for (const sheet of sheets) {
    const headerLines = [
      '',
      `## ชีต: ${cleanCell(sheet.name)} (${fmt(sheet.rowCount)} แถว × ${fmt(sheet.columnCount)} คอลัมน์${sheet.formulaCount ? ` · สูตร ${fmt(sheet.formulaCount)} เซลล์` : ''})`,
    ];
    const statsBlock = renderStatsTable(sheet.numericStats);
    if (statsBlock) headerLines.push('', statsBlock);

    const preview = sheet.previewRows;
    if (preview.length) {
      const cols = Math.max(1, Math.min(24, ...preview.map(r => Math.max(1, r.length)), preview[0].length));
      const headRow = Array.from({ length: cols }, (_, i) => cleanCell(preview[0][i] || `คอลัมน์ ${i + 1}`));
      headerLines.push(
        '',
        `### ตัวอย่างข้อมูล (${preview.length} แถวแรก${sheet.truncatedRows ? ` จากทั้งหมด ${fmt(sheet.rowCount)} แถว` : ''})`,
        `| ${headRow.join(' | ')} |`,
        `| ${headRow.map(() => '---').join(' | ')} |`,
      );
      for (let r = 1; r < preview.length; r++) {
        const line = `| ${Array.from({ length: cols }, (_, i) => cleanCell(preview[r][i] || '')).join(' | ')} |`;
        if (chars + headerLines.join('\n').length + line.length + 120 > maxChars) {
          headerLines.push(`_(ตัดตัวอย่างข้อมูลที่เหลือเพื่อให้อยู่ในขีดจำกัดความยาว · ใช้สถิติสรุปด้านบนในการคำนวณ)_`);
          break;
        }
        headerLines.push(line);
      }
      if (sheet.truncatedCols) {
        headerLines.push(`_(แสดงตัวอย่าง 24 คอลัมน์แรกจากทั้งหมด ${fmt(sheet.columnCount)} คอลัมน์)_`);
      }
    } else {
      headerLines.push('', '_(ชีตนี้ไม่มีข้อมูล)_');
    }

    const block = headerLines.join('\n');
    if (chars + block.length > maxChars) {
      parts.push(`\n_(ข้ามชีต "${cleanCell(sheet.name)}" เนื่องจากความยาวรวมถึงขีดจำกัดแล้ว)_`);
      break;
    }
    parts.push(block);
    chars += block.length;
  }

  return { text: parts.join('\n'), totalRows };
}

/** Parses RFC-4180 CSV or TSV text into bounded rows (runs after privacy masking so masked tokens are never leaked). */
export function parseDelimitedRows(text: string, delimiter: ',' | '\t', maxRows = 5001): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const clean = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && !cell) {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(v => v.length > 0)) rows.push(row);
      row = [];
      cell = '';
      if (rows.length >= maxRows) break;
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some(v => v.length > 0) && rows.length < maxRows) rows.push(row);
  }
  return rows;
}

/** Appends host-computed numeric column statistics to already privacy-checked CSV/TSV attachment text. */
export function enrichDelimitedAttachmentText(text: string, extension: string, maxChars = 175_000): string {
  const delimiter: ',' | '\t' | null = extension === 'csv' ? ',' : extension === 'tsv' ? '\t' : null;
  if (!delimiter || !text.trim()) return text;
  const rows = parseDelimitedRows(text, delimiter);
  const stats = computeColumnStats(rows);
  if (!stats.length) return text;
  const summary = `\n\n${renderStatsTable(stats)}\n_(จำนวนข้อมูลทั้งหมด ${fmt(rows.length - 1)} แถว)_`;
  return text.length + summary.length <= maxChars ? text + summary : text;
}
