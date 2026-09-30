import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from './ui';
import type { ApprovalRequest } from './types';

const privacyLabels: Record<string, string> = { public: 'ทั่วไป', internal: 'ภายใน', restricted: 'จำกัดการเข้าถึง', sensitive: 'อ่อนไหว' };
export function ApprovalDialog({
  request,
  children,
  confirmLabel = 'อนุญาตครั้งนี้',
  onConfirm,
  onCancel,
}: {
  request: ApprovalRequest;
  children?: ReactNode;
  confirmLabel?: string;
  onConfirm: (remember: boolean) => Promise<unknown> | unknown;
  onCancel: () => void;
}) {
  const [remember, setRemember] = useState(false);
  return (
    <ConfirmDialog
      title={request.title}
      confirmLabel={remember ? 'อนุญาตใน workspace นี้' : confirmLabel}
      onConfirm={() => onConfirm(remember)}
      onCancel={onCancel}
      focusCancel
    >
      <p className="small muted">
        เครื่องมือ: {request.tool} · ระดับข้อมูลจากการตรวจรูปแบบ: {privacyLabels[request.privacyClass] || request.privacyClass}
      </p>
      {request.body && <p className="approval-detail">{request.body}</p>}
      {children}
      {request.allowRemember && (
        <label className="approval-remember">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          อนุญาตทุกครั้งสำหรับเครื่องมือและเป้าหมายนี้ใน workspace นี้
        </label>
      )}
    </ConfirmDialog>
  );
}
