import {
  AlertTriangle,
  Blocks,
  BookOpen,
  Bot,
  Check,
  Command,
  FileSearch,
  FileText,
  Globe,
  KeyRound,
  ListChecks,
  LoaderCircle,
  Mail,
  MessageCircleQuestion,
  PenLine,
  Search,
} from './icons';
import { useEffect, useState } from 'react';
import { t } from './i18n';
import { errorText } from './messages';
import type { RunTrace, WorkAction } from './types';

export const ACTION_LABELS: Record<string, string> = {
  files: 'อ่านไฟล์ในพื้นที่งาน',
  search_files: 'ค้นหาไฟล์ในพื้นที่งาน',
  doc_outline: 'ตรวจโครงสร้างเอกสาร',
  doc_section: 'อ่านเอกสาร',
  sheet_read: 'อ่านข้อมูลตาราง',
  sheet_edit: 'เตรียมแก้ไขตาราง',
  sheet_create: 'จัดทำไฟล์ Excel',
  slides_create: 'จัดทำไฟล์ PowerPoint',
  changes: 'เตรียมข้อเสนอแก้ไขไฟล์',
  patch: 'เตรียมข้อเสนอแก้ไขไฟล์',
  web_search: 'ค้นหาข้อมูลบนเว็บ',
  web_fetch: 'อ่านหน้าเว็บ',
  web_extract: 'อ่านหน้าเว็บ',
  browser: 'อ่านหน้าเว็บ',
  browser_control: 'ทำงานบนหน้าเว็บ',
  browser_vault: 'ตรวจการเข้าใช้งานเว็บ',
  google_workspace: 'ทำงานกับ Google Workspace',
  reference: 'อ่านเอกสารอ้างอิง',
  skill: 'ตรวจแนวทางการทำงาน',
  ask_user: 'ขอข้อมูลเพิ่มเติม',
  plan: 'เตรียมแผนงาน',
  plan_update: 'บันทึกความคืบหน้า',
  tool_search: 'ตรวจเครื่องมือที่ใช้ได้',
  tool_describe: 'ตรวจเครื่องมือที่ใช้ได้',
  read_remaining: 'อ่านผลเพิ่มเติม',
  terminal: 'ใช้คำสั่ง',
  sandbox: 'ใช้คำสั่ง',
  tasks: 'ตรวจงานเบื้องหลัง',
  code_diagnostics: 'ตรวจสอบโค้ด',
  code_symbols: 'ค้นหาสัญลักษณ์ในโค้ด',
  code_references: 'ค้นหาจุดอ้างอิงในโค้ด',
  repl_eval: 'คำนวณด้วยโค้ด JavaScript',
  artifact_save: 'บันทึกเอกสารทำงานของผู้ช่วย',
  artifact_read: 'อ่านเอกสารทำงานของผู้ช่วย',
  invoke_subagent: 'ให้ผู้ช่วยย่อยค้นคว้า',
  image_generate: 'สร้างภาพ',
};

/** One icon per kind of tool, so a step reads at a glance (the AI's thinking panel, src/thinking-panel.tsx). */
export const ACTION_ICONS: Record<string, typeof Check> = {
  files: FileSearch,
  search_files: FileSearch,
  doc_outline: BookOpen,
  doc_section: BookOpen,
  reference: BookOpen,
  read_remaining: FileText,
  sheet_read: FileText,
  sheet_edit: FileText,
  sheet_create: FileText,
  slides_create: FileText,
  changes: PenLine,
  patch: PenLine,
  web_search: Search,
  web_fetch: Globe,
  web_extract: Globe,
  browser: Globe,
  browser_control: Globe,
  browser_vault: KeyRound,
  google_workspace: Mail,
  skill: Bot,
  ask_user: MessageCircleQuestion,
  plan: ListChecks,
  plan_update: ListChecks,
  tool_search: Blocks,
  tool_describe: Blocks,
  terminal: Command,
  sandbox: Command,
  tasks: Command,
  code_diagnostics: Blocks,
  code_symbols: Search,
  code_references: Search,
  repl_eval: Command,
  artifact_save: FileText,
  artifact_read: FileText,
  invoke_subagent: Bot,
  image_generate: Blocks,
};

/** Update by the host's unique action ID, including concurrent tool calls. */
export function updateWorkActions(items: WorkAction[], action: WorkAction): WorkAction[] {
  const index = items.findIndex(item => item.id === action.id);
  if (index < 0) return [...items, action].slice(-80);
  return items.map((item, i) => (i === index ? action : item));
}

export function workActionsFromTrace(trace?: RunTrace): WorkAction[] {
  if (trace?.workflow !== 'assistant') return [];
  return trace.steps.flatMap(step =>
    (step.tools || []).map(tool => ({
      id: tool.id,
      tool: tool.tool,
      state: tool.ok ? ('done' as const) : ('failed' as const),
      ...(tool.code ? { code: tool.code } : {}),
    })),
  );
}

export function workActionError(code?: string) {
  if (code && code !== 'TOOL_FAILED' && errorText[code]) return t(errorText[code]);
  return code && /^[A-Z_]{1,64}$/.test(code)
    ? t('ขั้นตอนนี้ไม่สำเร็จ ตรวจผลก่อนลองอีกครั้ง หรือแจ้งผู้ดูแลพร้อมรหัส {0}', code)
    : t('ขั้นตอนนี้ไม่สำเร็จ ตรวจผลก่อนลองอีกครั้ง หรือแจ้งผู้ดูแล');
}

export function WorkAssistantGuide({ privacyReady, toolsReady }: { privacyReady: boolean; toolsReady: boolean }) {
  return (
    <div className="work-assistant-guide">
      <strong>{t('ผู้ช่วยทำงานกับไฟล์และเว็บ')}</strong>
      <p>{t('บอกงานที่ต้องการ แล้วแนบเอกสารหรือใช้ไฟล์ในพื้นที่งาน ผู้ช่วยจะอ่านแหล่งข้อมูลและเตรียมผลให้ตรวจ')}</p>
      {!toolsReady ? (
        <p className="work-assistant-warning" role="status">
          {t('องค์กรปิดการทำงานด้วยเครื่องมืออัตโนมัติไว้')}
        </p>
      ) : !privacyReady ? (
        <p className="work-assistant-warning" role="status">
          {t('ก่อนเริ่ม ผู้ดูแลต้องเปิดการตรวจข้อมูลส่วนบุคคลในนโยบายของแอป')}
        </p>
      ) : (
        <p className="small muted">{t('อ่านเว็บและข้อมูล Google เมื่อเชื่อมบัญชี การแก้ไฟล์ในเครื่องเป็นไปตามสิทธิ์ที่ตั้งไว้')}</p>
      )}
    </div>
  );
}

export function WorkAssistantActivity({ actions, running }: { actions: WorkAction[]; running: boolean }) {
  const issues = actions.filter(action => action.state === 'failed').length;
  const [expanded, setExpanded] = useState(running || issues > 0);
  useEffect(() => {
    if (!running && issues > 0) setExpanded(true);
  }, [running, issues]);
  if (!actions.length) return null;
  return (
    <details className="work-assistant-activity" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>
        {t('ขั้นตอนการทำงาน')} · {t('{0} รายการ', actions.length)}
        {issues > 0 && <span className="work-assistant-warning"> · {t('{0} ขั้นตอนติดขัด', issues)}</span>}
      </summary>
      <ol>
        {actions.map(action => (
          <li key={action.id}>
            {action.state === 'running' ? (
              <LoaderCircle size={15} className="spin" aria-hidden="true" />
            ) : action.state === 'done' ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <AlertTriangle size={15} aria-hidden="true" />
            )}
            <span>{t(ACTION_LABELS[action.tool] || 'ใช้เครื่องมือ')}</span>
            <span className="work-assistant-state">
              {t(action.state === 'running' ? 'กำลังทำ' : action.state === 'done' ? 'เสร็จขั้นตอน' : 'ติดขัด')}
            </span>
            {action.state === 'failed' && <small>{workActionError(action.code)}</small>}
          </li>
        ))}
      </ol>
      <p className="small muted">{t('สถานะนี้แสดงผลแต่ละขั้นตอน โปรดตรวจผลลัพธ์และข้อเสนอแก้ไขก่อนนำไปใช้')}</p>
    </details>
  );
}
