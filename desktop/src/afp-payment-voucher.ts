import { moneySatang, voucherTotal, type ReceiptVoucher } from './receipt-packet';
import { parseReceiptDate } from './receipt-compliance';

export type PaymentVoucherItem = { description: string; gross: string; withholding: string; deduction: string };
export type PaymentVoucher = {
  number: string;
  date: string;
  payee: string;
  payer: string;
  method: 'unspecified' | 'transfer' | 'cheque' | 'cash';
  reference: string;
  accountCode: string;
  preparedBy: string;
  checkedBy: string;
  approvedBy: string;
  paidBy: string;
  receivedBy: string;
  note: string;
  items: PaymentVoucherItem[];
  checked: boolean;
  sourceReceipt?: { recipient: string; items: { description: string; amount: string }[] };
};
export const PAYMENT_METHOD_LABELS = { unspecified: 'รอ AFP ระบุ', transfer: 'เงินโอน', cheque: 'เช็ค', cash: 'เงินสด' };
export const PAYMENT_VOUCHER_REFERENCE = {
  source: 'docs/knowledge/qp-af-004.md',
  section: '3.12 / Finance procedure',
  controlledFormVerified: false as const,
};
export const blankPaymentVoucher = (): PaymentVoucher => ({
  number: '',
  date: '',
  payee: '',
  payer: 'อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่',
  method: 'unspecified',
  reference: '',
  accountCode: '',
  preparedBy: '',
  checkedBy: '',
  approvedBy: '',
  paidBy: '',
  receivedBy: '',
  note: '',
  items: [{ description: '', gross: '', withholding: '', deduction: '' }],
  checked: false,
});

const content = (value: PaymentVoucher) => {
  const { checked: _checked, sourceReceipt: _source, ...fields } = value;
  return JSON.stringify(fields);
};
export function editPaymentVoucher(current: PaymentVoucher, raw: unknown): PaymentVoucher {
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_INPUT');
  const input = raw as PaymentVoucher;
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 30 ||
    !Object.hasOwn(PAYMENT_METHOD_LABELS, input.method)
  )
    throw new Error('INVALID_INPUT');
  const text = (value: unknown, limit: number) => {
    if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
      throw new Error('INVALID_INPUT');
    return value;
  };
  const next: PaymentVoucher = {
    number: text(input.number, 80),
    date: text(input.date, 80),
    payee: text(input.payee, 200),
    payer: text(input.payer, 300),
    method: input.method,
    reference: text(input.reference, 200),
    accountCode: text(input.accountCode, 160),
    preparedBy: text(input.preparedBy, 200),
    checkedBy: text(input.checkedBy, 200),
    approvedBy: text(input.approvedBy, 200),
    paidBy: text(input.paidBy, 200),
    receivedBy: text(input.receivedBy ?? '', 200),
    note: text(input.note, 1200),
    items: input.items.map(item => ({
      description: text(item.description, 1200),
      gross: text(item.gross, 40),
      withholding: text(item.withholding, 40),
      deduction: text(item.deduction, 40),
    })),
    checked: false,
    ...(current.sourceReceipt ? { sourceReceipt: current.sourceReceipt } : {}),
  };
  next.checked = content(next) === content(current) && input.checked === true;
  return next;
}

/** Blank deductions remain unknown; they never silently become a zero tax assessment. */
export function paymentVoucherAmounts(voucher: PaymentVoucher) {
  const items = voucher.items.filter(
    item => item.description.trim() || item.gross.trim() || item.withholding.trim() || item.deduction.trim(),
  );
  const sum = (key: 'gross' | 'withholding' | 'deduction') => {
    if (!items.length) return null;
    const values = items.map(item => moneySatang(item[key]));
    if (values.some(value => value === null)) return null;
    const total = (values as number[]).reduce((a, b) => a + b, 0);
    return Number.isSafeInteger(total) && total <= 9_999_999_999_999 ? total : null;
  };
  const gross = sum('gross'),
    withholding = sum('withholding'),
    deduction = sum('deduction');
  const invalidRow = items.some(item => {
    const g = moneySatang(item.gross),
      w = moneySatang(item.withholding),
      d = moneySatang(item.deduction);
    return !item.description.trim() || g === null || g <= 0 || (w !== null && d !== null && w + d > g);
  });
  const net = !invalidRow && gross !== null && withholding !== null && deduction !== null ? gross - withholding - deduction : null;
  return { gross, withholding, deduction, net, invalidRow };
}
export function paymentVoucherSourceStale(voucher: PaymentVoucher, receipt: ReceiptVoucher) {
  return Boolean(
    voucher.sourceReceipt &&
    (!receipt.checked || JSON.stringify(voucher.sourceReceipt) !== JSON.stringify({ recipient: receipt.recipient, items: receipt.items })),
  );
}
export function paymentVoucherAssessment(voucher: PaymentVoucher, receipt: ReceiptVoucher) {
  const amounts = paymentVoucherAmounts(voucher),
    missing: string[] = [];
  if (!voucher.payee.trim() || !voucher.payer.trim() || !parseReceiptDate(voucher.date)) missing.push('payment-details');
  if (voucher.method === 'unspecified') missing.push('payment-method');
  if (amounts.net === null || amounts.invalidRow) missing.push('amounts');
  if (paymentVoucherSourceStale(voucher, receipt)) missing.push('receipt-source-changed');
  if (voucher.sourceReceipt && (voucher.payee.trim() !== receipt.recipient.trim() || amounts.gross !== voucherTotal(receipt)))
    missing.push('receipt-values-differ');
  if (!voucher.checked) missing.push('source-comparison');
  return {
    status: missing.length ? ('needs-review' as const) : ('prepared-for-afp' as const),
    missing,
    amounts,
    paymentApproved: false as const,
    policyVerified: false as const,
    controlledFormVerified: false as const,
  };
}

/** Only unchanged imported fields are refreshed; clerical edits remain the person's own data. */
export function paymentVoucherFromReceipt(current: PaymentVoucher, receipt: ReceiptVoucher): PaymentVoucher {
  if (!receipt.checked || !receipt.recipient.trim() || voucherTotal(receipt) === null || voucherTotal(receipt)! <= 0)
    throw new Error('DISBURSEMENT_RECEIPT_UNCHECKED');
  const source = { recipient: receipt.recipient, items: structuredClone(receipt.items) };
  const importedItems = (items: ReceiptVoucher['items']) =>
    items.map(item => ({ description: item.description, gross: item.amount, withholding: '', deduction: '' }));
  const blankItems = current.items.length === 1 && Object.values(current.items[0]).every(value => !value);
  const untouchedItems =
    current.sourceReceipt &&
    current.items.every(item => !item.withholding && !item.deduction) &&
    JSON.stringify(current.items.map(item => ({ description: item.description, amount: item.gross }))) ===
      JSON.stringify(current.sourceReceipt.items);
  return {
    ...current,
    payee: !current.payee || current.payee === current.sourceReceipt?.recipient ? receipt.recipient : current.payee,
    items: blankItems || untouchedItems ? importedItems(receipt.items) : current.items,
    checked: false,
    sourceReceipt: source,
  };
}
