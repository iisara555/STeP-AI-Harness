import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from './ui';
import type { ApprovalRequest } from './types';

const privacyLabels: Record<string, string> = { public: 'ทั่วไป', internal: 'ภายใน', restricted: 'จำกัดการเข้าถึง', sensitive: 'อ่อนไหว' };
export function ApprovalDialog({
  request,
  children,
  confirmLabel = 'อนุญาตครั้งนี้',
  onConfirm,
  onRun,
  onCancel,
}: {
  request: ApprovalRequest;
  children?: ReactNode;
  confirmLabel?: string;
  onConfirm: (remember: boolean) => Promise<unknown> | unknown;
  onRun?: () => Promise<unknown> | unknown;
  onCancel: () => void;
}) {
  const [remember, setRemember] = useState(false);
  const [run, setRun] = useState(false);
  return (
    <ConfirmDialog
      title={request.title}
      confirmLabel={run ? 'อนุญาตในขอบเขตนี้จนจบรอบ' : remember ? 'อนุญาตใน workspace นี้' : confirmLabel}
      onConfirm={() => (run && onRun ? onRun() : onConfirm(remember))}
      onCancel={onCancel}
      focusCancel
    >
      <p className="small muted">
        เครื่องมือ: {request.tool} · ระดับข้อมูลจากการตรวจรูปแบบ: {privacyLabels[request.privacyClass] || request.privacyClass}
      </p>
      {request.body && <p className="approval-detail">{request.body}</p>}
      {children}
      {request.runScope && onRun && (
        <label className="approval-remember">
          <input type="checkbox" checked={run} onChange={e => setRun(e.target.checked)} />
          <span>
            อนุญาตผลการอ่านใหม่ในขอบเขตนี้โดยไม่ถามซ้ำ
            <br />
            <span className="approval-detail">{request.runScope}</span>
          </span>
        </label>
      )}
      {request.allowRemember && (
        <label className="approval-remember">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          อนุญาตทุกครั้งสำหรับเครื่องมือและเป้าหมายนี้ใน workspace นี้
        </label>
      )}
    </ConfirmDialog>
  );
}
