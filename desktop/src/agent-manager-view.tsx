import { AlertTriangle, Check, MessageCircleQuestion, LoaderCircle, Plus, ShieldCheck } from './icons';
import { managerGroups, PARALLEL_RUNS, type ManagerGroup, type ManagerTask } from './agent-manager';
import { shownDate, statusText } from './messages';
import { t } from './i18n';
import type { ApprovalRequest, Session, ToolQuestion } from './types';
import './agent-manager.css';

const GROUPS: [ManagerGroup, string, string][] = [
  ['needs-you', 'รอคุณ', 'งานที่ถามคำถาม ขออนุญาต หรือรอข้อมูลเพิ่ม เปิดงานเพื่อตอบ'],
  ['running', 'กำลังทำ', 'ผู้ช่วยกำลังทำงานเหล่านี้อยู่ คุณสลับไปทำงานอื่นได้'],
  ['done', 'เสร็จแล้ว รอตรวจ', 'ผลงานล่าสุดที่รอคุณตรวจก่อนใช้'],
  ['stopped', 'หยุดหรือไม่สำเร็จ', 'งานที่หยุดกลางทาง เปิดเพื่อดูสาเหตุหรือลองอีกครั้ง'],
];

function waitingText(task: ManagerTask) {
  if (task.waiting?.kind === 'question') return t('รอคุณตอบ: {0}', task.waiting.text || '');
  if (task.waiting?.kind === 'approval') return t('รอคุณอนุญาต: {0}', t(task.waiting.text || ''));
  if (task.waiting?.kind === 'clarification') return t('รอข้อมูลเพิ่มจากคุณ');
  return statusText[task.status] || task.status;
}

function TaskIcon({ task }: { task: ManagerTask }) {
  if (task.waiting?.kind === 'approval') return <ShieldCheck size={18} />;
  if (task.waiting) return <MessageCircleQuestion size={18} />;
  if (task.group === 'running') return <LoaderCircle size={18} className="spin" />;
  if (task.group === 'done') return <Check size={18} />;
  return <AlertTriangle size={18} />;
}

/**
 * ศูนย์ควบคุมงาน: every task at a glance, sorted by what the employee has to do next, like Antigravity's Agent Manager.
 * Opening a task goes to its chat; answers and permissions are given there, through the existing dialogs.
 */
export function AgentManager({
  sessions,
  questions,
  approvals,
  onOpen,
  onNew,
}: {
  sessions: Session[];
  questions: ToolQuestion[];
  approvals: ApprovalRequest[];
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const groups = managerGroups(sessions, questions, approvals);
  const empty = GROUPS.every(([id]) => !groups[id].length);
  return (
    <div className="agent-manager">
      <h1 className="sr-only">{t('ศูนย์ควบคุมงาน')}</h1>
      <section className="agent-manager-intro">
        <p>{t('ดูทุกงานของผู้ช่วยในที่เดียว งานที่รอคุณอยู่บนสุด ผู้ช่วยทำได้พร้อมกัน {0} งาน งานที่เกินจะรอคิว', PARALLEL_RUNS)}</p>
        <dl className="agent-manager-counts" aria-label={t('สรุปงาน')}>
          <div className={groups['needs-you'].length ? 'attention' : ''}>
            <dt>{t('รอคุณ')}</dt>
            <dd>{groups['needs-you'].length}</dd>
          </div>
          <div>
            <dt>{t('กำลังทำ')}</dt>
            <dd>{`${groups.running.length}/${PARALLEL_RUNS}`}</dd>
          </div>
          <div>
            <dt>{t('รอตรวจ')}</dt>
            <dd>{groups.done.length}</dd>
          </div>
        </dl>
        <button onClick={onNew}>
          <Plus size={16} />
          {t('เริ่มงานใหม่')}
        </button>
      </section>
      {empty && <p className="agent-manager-empty">{t('ยังไม่มีงาน เริ่มงานใหม่แล้วงานจะขึ้นที่นี่')}</p>}
      {GROUPS.map(([id, title, hint]) =>
        groups[id].length ? (
          <section key={id} className={'agent-manager-group ' + id} aria-label={t(title)}>
            <h2>
              {t(title)} <span className="muted">{groups[id].length}</span>
            </h2>
            <p className="small muted">{t(hint)}</p>
            <ul>
              {groups[id].map(task => (
                <li key={task.id}>
                  <button className="agent-task" onClick={() => onOpen(task.id)}>
                    <span className="agent-task-icon" aria-hidden="true">
                      <TaskIcon task={task} />
                    </span>
                    <span className="agent-task-main">
                      <strong>{t(task.title)}</strong>
                      <span className="small agent-task-state">{waitingText(task)}</span>
                      <span className="small muted">
                        {task.project || task.team.toUpperCase() || t('ทุกทีม')} · {shownDate(task.updatedAt, true)}
                      </span>
                      {task.plan && (
                        <span className="agent-task-plan small muted">
                          <progress max={task.plan.total} value={task.plan.done} aria-hidden="true" />
                          {t('แผนงาน เสร็จ {0}/{1}', task.plan.done, task.plan.total)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
