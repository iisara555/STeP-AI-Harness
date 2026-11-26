const thaiDigits = (value: string) => value.replace(/[๐-๙]/g, digit => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)));

/** Parse a complete baht amount into integer satang. Currency labels are optional, rates are not amounts. */
export function amountInSatang(value: string) {
  const match = /^\s*(?:(?:฿|THB)\s*)?(-?(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?: \d{3})+)(?:\.\d{1,2})?)\s*(?:บาท|฿|THB)?\s*$/i.exec(
    thaiDigits(value),
  );
  if (!match) return NaN;
  const text = match[1].replace(/[, ]/g, '');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? (text.startsWith('-') ? -cents : cents) : NaN;
}

export function amount(value: string) {
  return amountInSatang(value) / 100;
}

/** Only an explicitly printed zero rate also establishes a zero VAT amount. */
export function vatInSatang(value: string) {
  return /^\s*0+(?:\.0+)?\s*%\s*$/.test(thaiDigits(value)) ? 0 : amountInSatang(value);
}
