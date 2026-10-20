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
  'tool-data': 'ส่งผลการใช้เครื่องมือให้ AI',
  'web-query': 'ค้นเว็บ',
  'web-url': 'เปิดเว็บปลายทาง',
  web_fetch: 'อ่านเว็บไซต์',
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
  phase4: 'การทำงานที่ต้องยืนยัน',
  google_workspace: 'Google Workspace',
  'google-result': 'ส่งข้อมูลจาก Google ให้ AI',
});
const STEP = /^(?:[-*+•]\s*(?:\[[ xX]\]\s*)?|\d{1,2}[.)]\s+)(.+)$/;
/** A plan's steps as a list: marked lines (1. / - / *) are steps; a plan of one plain line is one step. */
export function planSteps(body: string) {
  const lines = body
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  const marked = lines.filter(l => STEP.test(l));
  if (marked.length) return { steps: marked.map(l => STEP.exec(l)![1].trim()), notes: lines.filter(l => !STEP.test(l)) };
  return { steps: lines.slice(0, 1), notes: lines.slice(1) };
}
export function ApprovalDialog({
  request,
  children,
  confirmLabel,
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
  const isPlan = request.tool === 'plan';
  const plan = isPlan && request.body ? planSteps(t(request.body)) : null;
  const label = confirmLabel || (isPlan ? t('อนุมัติแผน') : t('อนุญาตครั้งนี้'));
  return (
    <ConfirmDialog
      title={t(request.title)}
      confirmLabel={run ? t('อนุญาตเฉพาะขอบเขตนี้จนจบคำขอ') : remember ? t('จำการอนุญาตในโฟลเดอร์นี้') : label}
      onConfirm={() => (run && onRun ? onRun() : onConfirm(remember))}
      onCancel={onCancel}
      focusCancel
      confirmDisabled={confirmDisabled}
    >
      {!isPlan && (
        <p className="small muted">
          {t('เครื่องมือ:')} {toolLabels[request.tool] || request.tool} {t('· ผลตรวจข้อมูลเบื้องต้น:')}{' '}
          {privacyLabels[request.privacyClass] || request.privacyClass}
        </p>
      )}
      {plan ? (
        <div className="approval-plan">
          <strong className="small">{t('ขั้นตอนของแผน')}</strong>
          <ol>
            {plan.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          {plan.notes.map((note, i) => (
            <p key={i} className="small muted approval-detail">
              {note}
            </p>
          ))}
        </div>
      ) : (
        request.body && <p className="approval-detail">{t(request.body)}</p>
      )}
      {request.facts?.length ? (
        <dl className="approval-facts">
          {request.facts.map(f => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {request.preview && (
        <div className="approval-preview">
          <span className="small muted">{t('ตัวอย่างข้อความที่จะส่ง (ปิดบังข้อมูลแล้ว)')}</span>
          <blockquote className="approval-detail">{request.preview}</blockquote>
        </div>
      )}
      {request.technical && request.technical !== request.preview && (
        <details className="approval-technical">
          <summary>{t('รายละเอียดสำหรับผู้ดูแล')}</summary>
          <pre tabIndex={0}>{request.technical}</pre>
        </details>
      )}
      {children}
      {request.runScope && onRun && (
        <label className="approval-remember">
          <input type="checkbox" checked={run} onChange={e => setRun(e.target.checked)} />
          <span>
            {t('ไม่ถามซ้ำสำหรับข้อมูลกลุ่มนี้จนจบคำขอ')}
            <ul className="approval-scope">
              {request.runScope
                .split('\n')
                .filter(Boolean)
                .map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
            </ul>
          </span>
        </label>
      )}
      {request.allowRemember && (
        <label className="approval-remember">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          {t('จำการอนุญาตเฉพาะเครื่องมือและปลายทางนี้ในโฟลเดอร์นี้')}
        </label>
      )}
    </ConfirmDialog>
  );
}
