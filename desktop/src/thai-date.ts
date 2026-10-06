/** Modern document calendar dates only. Ambiguous years and impossible days remain for human review. */
const MONTHS = [
  ['ม.ค.', 'มกราคม', 'jan', 'january'],
  ['ก.พ.', 'กุมภาพันธ์', 'feb', 'february'],
  ['มี.ค.', 'มีนาคม', 'mar', 'march'],
  ['เม.ย.', 'เมษายน', 'apr', 'april'],
  ['พ.ค.', 'พฤษภาคม', 'may', 'may'],
  ['มิ.ย.', 'มิถุนายน', 'jun', 'june'],
  ['ก.ค.', 'กรกฎาคม', 'jul', 'july'],
  ['ส.ค.', 'สิงหาคม', 'aug', 'august'],
  ['ก.ย.', 'กันยายน', 'sep', 'september'],
  ['ต.ค.', 'ตุลาคม', 'oct', 'october'],
  ['พ.ย.', 'พฤศจิกายน', 'nov', 'november'],
  ['ธ.ค.', 'ธันวาคม', 'dec', 'december'],
];
const digits = (value: string) => value.replace(/[๐-๙]/g, d => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)));
const ERA = '(พ\\.?ศ\\.?|ค\\.?ศ\\.?|be|ce|ad)';

export function parseThaiDate(value: string): Date | null {
  const text = digits(value)
    .toLowerCase()
    .trim()
    .replace(/^วันที่\s*/, '')
    .replace(/\s+/g, ' ');
  let day: number, month: number, rawYear: string, era: string | undefined;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) [rawYear, month, day] = [iso[1], Number(iso[2]), Number(iso[3])];
  else {
    // Capture the era rather than discarding it. Anchors reject multiple dates or trailing source text.
    const match = new RegExp(
      `^(\\d{1,2})(?:\\s*[/.-]\\s*|\\s+)(\\d{1,2}|[ก-๙a-z.]+)(?:\\s*[/.-]\\s*|\\s+)(?:${ERA}\\s*)?(\\d{4})(?:\\s*${ERA})?$`,
    ).exec(text);
    if (!match || (match[3] && match[5])) return null;
    day = Number(match[1]);
    const word = match[2].replace(/\.$/, '');
    month = /^\d+$/.test(word) ? Number(word) : MONTHS.findIndex(names => names.some(name => name.replace(/\.$/, '') === word)) + 1;
    rawYear = match[4];
    era = (match[3] || match[5])?.replace(/\./g, '');
  }
  let year = Number(rawYear);
  if (era === 'พศ' || era === 'be' || (!era && year >= 2400)) year -= 543;
  // The modern document scope avoids interpreting historical Thai calendar conventions.
  if (year < 1941 || year >= 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function formatThaiDate(date: Date, style: 'short' | 'official' = 'short'): string {
  const day = date.getUTCDate(),
    month = date.getUTCMonth(),
    year = date.getUTCFullYear() + 543;
  if (!Number.isFinite(date.getTime())) throw new Error('INVALID_DATE');
  return style === 'official'
    ? `${day} ${MONTHS[month][1]} ${year}`
    : `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
}
