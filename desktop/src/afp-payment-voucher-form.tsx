import { FileText, Plus, Trash2 } from './icons';
import { t } from './i18n';
import { formatSatang, moneySatang, thaiBahtWords, voucherTotal, type ReceiptPacket } from './receipt-packet';
import { PAYMENT_METHOD_LABELS, paymentVoucherAssessment, type PaymentVoucher } from './afp-payment-voucher';

type Props = {
  packet: ReceiptPacket;
  active: boolean;
  onChange: (voucher: PaymentVoucher) => void;
  onConfirm: (checked: boolean) => void;
  onInclude: (included: boolean) => void;
  onImport: () => void;
  onExport: (format: string) => void;
};
const REASONS: Record<string, string> = {
  'payment-details': 'ระบุผู้รับเงิน หน่วยงานผู้จ่าย และวันที่ร่างให้ครบ',
  'payment-method': 'เลือกวิธีจ่ายเพื่อให้ AFP ตรวจต่อ',
  amounts: 'ระบุยอดรายการและยอดหักให้ครบ ยอดหักรวมต้องไม่เกินยอดรายการ',
  'receipt-source-changed': 'ข้อมูล FM-AF-014 ต้นทางเปลี่ยนไป โปรดตรวจต้นทางและนำข้อมูลล่าสุดมาเทียบ',
  'receipt-values-differ': 'ผู้รับเงินหรือยอดรายการต่างจาก FM-AF-014 โปรดตรวจและแจ้ง AFP',
  'source-comparison': 'รอผู้จัดทำตรวจข้อมูลเทียบกับหลักฐาน',
};
export function PaymentVoucherForm({ packet, active, onChange, onConfirm, onInclude, onImport, onExport }: Props) {
  const voucher = packet.disbursement,
    assessment = paymentVoucherAssessment(voucher, packet.voucher);
  const edit = (update: Partial<PaymentVoucher>) => onChange({ ...voucher, ...update, checked: false });
  const field = (label: string, key: 'number' | 'date' | 'payee' | 'payer' | 'reference' | 'accountCode', limit: number) => (
    <label>
      {t(label)}
      <input value={voucher[key]} maxLength={limit} onChange={event => edit({ [key]: event.target.value })} />
    </label>
  );
  const total = voucherTotal(packet.voucher);
  return (
    <section className="packet-section payment-voucher-form" aria-label={t('ร่างใบสำคัญจ่ายสำหรับ AFP')} hidden={!active}>
      <h2>{t('ใบสำคัญจ่ายสำหรับ AFP ตรวจ')}</h2>
      <p className="small muted">{t('โครงร่างจาก QP-AF-004 ต้องเทียบแบบควบคุมของ AFP ก่อนใช้จริง')}</p>
      <button disabled={!packet.voucher.checked || total === null || total <= 0 || !packet.voucher.recipient.trim()} onClick={onImport}>
        {t('นำข้อมูล FM-AF-014 ที่ตรวจแล้วมาเริ่มร่าง')}
      </button>
      <p className="small muted">{t('คงข้อมูลที่คุณแก้เองไว้ และให้ตรวจร่างใบสำคัญจ่ายอีกครั้งหลังนำข้อมูลเข้า')}</p>
      {field('เลขที่ใบสำคัญจ่าย (เว้นไว้ให้ AFP ออกเลข)', 'number', 80)}
      {field('วันที่ร่างใบสำคัญจ่าย', 'date', 80)}
      {field('ผู้รับเงินสำหรับใบสำคัญจ่าย', 'payee', 200)}
      {field('หน่วยงานผู้จ่ายเงิน', 'payer', 300)}
      <label>
        {t('วิธีจ่ายสำหรับ AFP')}
        <select
          aria-label={t('วิธีจ่ายสำหรับ AFP')}
          value={voucher.method}
          onChange={event => edit({ method: event.target.value as PaymentVoucher['method'] })}
        >
          {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
      </label>
      {field('เลขอ้างอิงเอกสารประกอบ', 'reference', 200)}
      {field('รหัสบัญชีหรืองบประมาณ (ถ้ามีหลักฐาน)', 'accountCode', 160)}
      <h3>{t('รายการและยอดหักตามหลักฐาน')}</h3>
      <p className="small muted">{t('ช่องว่างหมายถึงยังไม่ทราบยอดหัก หากไม่มีรายการหักให้ระบุ 0 โดยไม่คำนวณอัตราภาษีให้อัตโนมัติ')}</p>
      <ol className="payment-items-editor">
        {voucher.items.map((item, index) => (
          <li key={index}>
            <label>
              {t('รายการจ่าย {0}', index + 1)}
              <textarea
                rows={2}
                maxLength={1200}
                value={item.description}
                onChange={event =>
                  edit({ items: voucher.items.map((row, i) => (i === index ? { ...row, description: event.target.value } : row)) })
                }
              />
            </label>
            <div className="payment-money-fields">
              {(['gross', 'withholding', 'deduction'] as const).map((key, column) => (
                <label key={key}>
                  {t(['ยอดรายการ (บาท)', 'หัก ณ ที่จ่าย (บาท)', 'หักอื่น (บาท)'][column])}
                  <input
                    inputMode="decimal"
                    maxLength={40}
                    aria-label={t(['ยอดรายการจ่าย {0}', 'ยอดหัก ณ ที่จ่ายรายการ {0}', 'ยอดหักอื่นรายการ {0}'][column], index + 1)}
                    value={item[key]}
                    onChange={event =>
                      edit({ items: voucher.items.map((row, i) => (i === index ? { ...row, [key]: event.target.value } : row)) })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="packet-actions">
              <label className="packet-check">
                <input
                  type="checkbox"
                  checked={moneySatang(item.withholding) === 0 && moneySatang(item.deduction) === 0}
                  onChange={event => {
                    const value = event.target.checked ? '0.00' : '';
                    edit({ items: voucher.items.map((row, i) => (i === index ? { ...row, withholding: value, deduction: value } : row)) });
                  }}
                />
                {t('ไม่มีรายการหักสำหรับรายการ {0}', index + 1)}
              </label>
              <button
                className="icon"
                aria-label={t('ลบรายการจ่าย {0}', index + 1)}
                disabled={voucher.items.length === 1}
                onClick={() => edit({ items: voucher.items.filter((_, i) => i !== index) })}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        className="text-link"
        disabled={voucher.items.length >= 30}
        onClick={() => edit({ items: [...voucher.items, { description: '', gross: '', withholding: '', deduction: '' }] })}
      >
        <Plus size={14} />
        {t('เพิ่มรายการจ่าย')}
      </button>
      <div className="packet-total">
        <span>{t('ยอดสุทธิร่างใบสำคัญจ่าย')}</span>
        <strong>{assessment.amounts.net === null ? t('รอข้อมูลยอดหักครบ') : t('{0} บาท', formatSatang(assessment.amounts.net))}</strong>
        {assessment.amounts.net !== null && <span className="small">{thaiBahtWords(assessment.amounts.net)}</span>}
      </div>
      <details>
        <summary>{t('ชื่อสำหรับช่องลงนาม (ไม่ใช่การอนุมัติ)')}</summary>
        <div className="payment-signers">
          {(['preparedBy', 'checkedBy', 'approvedBy', 'paidBy', 'receivedBy'] as const).map((key, index) => (
            <label key={key}>
              {t(
                [
                  'ชื่อผู้จัดทำใบสำคัญจ่าย',
                  'ชื่อผู้ตรวจสอบใบสำคัญจ่าย',
                  'ชื่อผู้อนุมัติในช่องลงนาม',
                  'ชื่อผู้จ่ายเงินใบสำคัญจ่าย',
                  'ชื่อผู้รับเงินสำหรับลงนาม',
                ][index],
              )}
              <input value={voucher[key]} maxLength={200} onChange={event => edit({ [key]: event.target.value })} />
            </label>
          ))}
        </div>
      </details>
      <label>
        {t('หมายเหตุให้ AFP ตรวจ')}
        <textarea rows={2} value={voucher.note} maxLength={1200} onChange={event => edit({ note: event.target.value })} />
      </label>
      {assessment.missing.length > 0 && (
        <ul className="payment-review-reasons">
          {assessment.missing.map(reason => (
            <li key={reason}>{t(REASONS[reason])}</li>
          ))}
        </ul>
      )}
      <label className="packet-check">
        <input
          type="checkbox"
          checked={voucher.checked}
          disabled={assessment.missing.some(reason => reason !== 'source-comparison')}
          onChange={event => onConfirm(event.target.checked)}
        />
        {t('ตรวจข้อมูลร่างใบสำคัญจ่ายเทียบหลักฐานแล้ว')}
      </label>
      <label className="packet-check">
        <input type="checkbox" checked={packet.includeDisbursement} onChange={event => onInclude(event.target.checked)} />
        {t('แนบร่างใบสำคัญจ่ายใน PDF รวม')}
      </label>
      <div className="packet-actions">
        <button onClick={() => onExport('disbursement-docx')}>
          <FileText size={14} />
          {t('ส่งออกร่างใบสำคัญจ่าย Word')}
        </button>
        <button className="text-link" onClick={() => onExport('blank-disbursement-docx')}>
          {t('แม่แบบใบสำคัญจ่าย Word เปล่า')}
        </button>
      </div>
      <p className="small muted">{t('ชื่อที่พิมพ์ในช่องลงนามไม่ใช่การลงนามหรืออนุมัติจ่ายเงิน')}</p>
    </section>
  );
}
