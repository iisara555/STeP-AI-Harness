import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from './ui';
import type { ApprovalRequest } from './types';
import { localized, t } from './i18n';

const privacyLabels: Record<string, string> = localized({
  public: 'ทั่วไป',
  internal: 'ภายใน',
  restricted: 'จำกัดการเข้าถึง',
  sensitive: 'อ่อนไหว',
});
// Employees see what the step does; unknown tool ids still show as-is so nothing is hidden.
const toolLabels: Record<string, string> = localized({
  external_ai: 'ส่งคำขอให้ AI',
  browser_control: 'ผู้ช่วยทำงานบนเว็บ',
  browser: 'เปิดเว็บ',
  browser_read: 'อ่านหน้าเว็บ',
  files: 'รายการไฟล์',
  read: 'อ่านไฟล์',
  write: 'บันทึกไฟล์',
  changes: 'รายการแก้ไข',
  sheet_edit: 'แก้ตาราง',
  terminal: 'คำสั่งขั้นสูง',
  web_search: 'ค้นเว็บ',
  mcp_call: 'เครื่องมือ MCP',
  mcp_search: 'ค้นเครื่องมือ MCP',
  sandbox: 'Docker sandbox',
  ask_user: 'คำถามถึงคุณ',
  plan: 'แผนงาน',
});
export function ApprovalDialog({
  request,
  children,
  confirmLabel = t('อนุญาตครั้งนี้'),
  onConfirm,
  onRun,
  onCancel,
  confirmDisabled,
}: {
  request: ApprovalRequest;
  children?: ReactNode;
  confirmLabel?: string;
  onConfirm: (remember: boolean) => Promise<unknown> | unknown;
  onRun?: () => Promise<unknown> | unknown;
  onCancel: () => void;
  confirmDisabled?: boolean;
}) {
  const [remember, setRemember] = useState(false);
  const [run, setRun] = useState(Boolean(request.runDefault && request.runScope));
  return (
    <ConfirmDialog
      title={t(request.title)}
      confirmLabel={run ? t('อนุญาตในขอบเขตนี้จนจบรอบ') : remember ? t('อนุญาตใน workspace นี้') : confirmLabel}
      onConfirm={() => (run && onRun ? onRun() : onConfirm(remember))}
      onCancel={onCancel}
      focusCancel
      confirmDisabled={confirmDisabled}
    >
      <p className="small muted">
        {t('เครื่องมือ:')} {toolLabels[request.tool] || request.tool} {t('· ระดับข้อมูลจากการตรวจรูปแบบ:')}{' '}
        {privacyLabels[request.privacyClass] || request.privacyClass}
      </p>
      {request.body && <p className="approval-detail">{t(request.body)}</p>}
      {children}
      {request.runScope && onRun && (
        <label className="approval-remember">
          <input type="checkbox" checked={run} onChange={e => setRun(e.target.checked)} />
          <span>
            {t('อนุญาตส่งข้อมูลในขอบเขตนี้โดยไม่ถามซ้ำ')}
            <br />
            <span className="approval-detail">{request.runScope}</span>
          </span>
        </label>
      )}
      {request.allowRemember && (
        <label className="approval-remember">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          {t('อนุญาตทุกครั้งสำหรับเครื่องมือและเป้าหมายนี้ใน workspace นี้')}
        </label>
      )}
    </ConfirmDialog>
  );
}
