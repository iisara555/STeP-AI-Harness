"""Ground-truth scoring independent of the app's deliberately loose comparison."""
import re
import unicodedata
from datetime import date
from decimal import Decimal, InvalidOperation

FIELDS = ('merchant', 'receiptNumber', 'date', 'taxId', 'subtotal', 'vat', 'total')
CRITICAL = set(FIELDS) - {'merchant'}
MONTHS = ('มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
          'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม')


def canonical(field, value):
    text = unicodedata.normalize('NFC', str(value or '')).translate(str.maketrans('๐๑๒๓๔๕๖๗๘๙', '0123456789')).strip()
    if not text:
        return ''
    if field in {'subtotal', 'vat', 'total'}:
        clean = re.sub(r'บาท|฿|THB|\s', '', text, flags=re.I)
        if re.fullmatch(r'(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?', clean):
            try:
                return str(Decimal(clean.replace(',', '')).quantize(Decimal('0.01')))
            except InvalidOperation:
                pass
    if field == 'taxId' and re.fullmatch(r'[\d\s-]+', text):
        return re.sub(r'[\s-]', '', text)
    if field == 'date':
        parts = re.fullmatch(r'(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})', text)
        iso = re.fullmatch(r'(\d{4})-(\d{1,2})-(\d{1,2})', text)
        named = re.fullmatch(r'(\d{1,2})\s+(' + '|'.join(MONTHS) + r')\s+(?:พ.ศ.\s*)?(\d{4})', text)
        try:
            if parts:
                day, month, year = map(int, parts.groups())
            elif iso:
                year, month, day = map(int, iso.groups())
            elif named:
                day, name, year = named.groups()
                day, month, year = int(day), MONTHS.index(name) + 1, int(year)
            else:
                return text
            return date(year - 543 if year > 2400 else year, month, day).isoformat()
        except ValueError:
            return text
    # Preserve reference punctuation/leading zeroes, Thai marks, and merchant distinctions.
    return re.sub(r'\s+', ' ', text)


def score_fields(truth, predicted, flagged=()):
    flags = set(flagged)
    results, confusion = {}, dict(tp=0, fp=0, fn=0, tn=0)
    for field, expected in truth.items():
        actual = str(predicted.get(field, '') or '')
        expected = str(expected or '')
        correct = canonical(field, expected) == canonical(field, actual)
        error = None if correct else 'invented' if not expected else 'missing' if not actual.strip() else 'wrong'
        results[field] = dict(raw_exact=expected == actual, canonical_exact=correct,
                              critical_error=not correct and field in CRITICAL, error=error,
                              needs_review=field in flags)
        confusion['tp' if not correct and field in flags else 'fn' if not correct else 'fp' if field in flags else 'tn'] += 1
    tp, fp, fn = (confusion[k] for k in ('tp', 'fp', 'fn'))
    confusion.update(precision=tp / (tp + fp) if tp + fp else None,
                     recall=tp / (tp + fn) if tp + fn else None)
    return {'fields': results, 'review': confusion}
