import { useState } from 'react';
import { Check, Circle, LoaderCircle, MessageSquare, OctagonAlert, Play, ListChecks } from './icons';
import type { WorkPlan, Workflow } from './types';
import { commentedTasks, PLAN_COMMENT_LIMIT } from './plan-comments';
import { t } from './i18n';

/** The native workflows offered in the composer (electron/workflows.ts), with the label each shows. */
export const WORKFLOW_LABELS: Record<Workflow, string> = {
  assistant: 'ผู้ช่วยทำงานกับไฟล์และเว็บ',
  plan: 'วางแผนก่อนลงมือ',
  execute: 'ลงมือทำตามแผน',
  requirements: 'เขียนเอกสารความต้องการ',
  diagnose: 'วิเคราะห์ปัญหา',
  coding: 'เขียนและตรวจโค้ด',
};

/** One comment being written on a task: the box opens under the task, like a comment on an Antigravity artifact. */
function CommentBox({ initial, onSave, onCancel }: { initial: string; onSave: (comment: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  return (
    <form
      className="work-plan-comment-box"
      onSubmit={event => {
        event.preventDefault();
        onSave(text);
      }}
    >
      <textarea
        autoFocus
        rows={2}
        maxLength={PLAN_COMMENT_LIMIT}
        value={text}
        aria-label={t('ความเห็นต่อข้อนี้')}
        placeholder={t('เช่น ขอแยกเป็นสองขั้น หรือ ใช้แม่แบบของกองคลัง')}
        onChange={event => setText(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') onCancel();
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSave(text);
          }
        }}
      />
      <div>
        <button type="submit">{t('บันทึกความเห็น')}</button>
        <button type="button" className="quiet" onClick={onCancel}>
          {t('ยกเลิก')}
        </button>
      </div>
    </form>
  );
}

/** The plan approved in the plan workflow, ticked off live while the execute workflow works through it. */
export function WorkPlanCard({
  plan,
  running,
  continuation,
  onExecute,
  onComment,
  onRevise,
}: {
  plan: WorkPlan;
  running: boolean;
  continuation?: import('./types').Session['longTask'];
  onExecute: (continuous?: boolean) => void;
  /** Keeps the employee's comment on a task (1-based number); an empty comment removes it. */
  onComment: (number: number, comment: string) => Promise<boolean>;
  /** Asks the assistant to revise the plan by the comments. */
  onRevise: () => void;
}) {
  const [editing, setEditing] = useState<number>();
  const done = plan.tasks.filter(task => task.status === 'done').length;
  const finished = done === plan.tasks.length;
  const comments = commentedTasks(plan).length;
  const save = async (number: number, comment: string) => {
    if (await onComment(number, comment)) setEditing(undefined);
  };
  return (
    <details className="work-plan" open>
      <summary>
        <ListChecks size={16} />
        <strong>{t('แผนงาน')}</strong>
        <span className="muted">{t('เสร็จ {0}/{1}', done, plan.tasks.length)}</span>
      </summary>
      {plan.goal && <p className="work-plan-goal">{plan.goal}</p>}
      <ol>
        {plan.tasks.map((task, index) => (
          <li key={index} className={task.status}>
            {task.status === 'done' ? (
              <Check size={15} aria-label={t('เสร็จแล้ว')} />
            ) : task.status === 'doing' ? (
              <LoaderCircle size={15} className="spin" aria-label={t('กำลังทำ')} />
            ) : task.status === 'blocked' ? (
              <OctagonAlert size={15} aria-label={t('ติดอยู่')} />
            ) : (
              <Circle size={15} aria-label={t('ยังไม่เริ่ม')} />
            )}
            <span>
              {task.title}
              {task.note && <small>{task.note}</small>}
              {task.comment && editing !== index + 1 && (
                <small className="work-plan-comment">
                  <MessageSquare size={12} aria-hidden="true" />
                  {t('ความเห็นของคุณ: {0}', task.comment)}
                </small>
              )}
              {editing === index + 1 && (
                <CommentBox
                  initial={task.comment || ''}
                  onSave={comment => void save(index + 1, comment)}
                  onCancel={() => setEditing(undefined)}
                />
              )}
            </span>
            {editing !== index + 1 && (
              <button
                className="icon quiet work-plan-comment-button"
                disabled={running}
                aria-label={t(task.comment ? 'แก้ความเห็นข้อ {0}' : 'แสดงความเห็นข้อ {0}', index + 1)}
                title={t(task.comment ? 'แก้ความเห็นข้อ {0}' : 'แสดงความเห็นข้อ {0}', index + 1)}
                onClick={() => setEditing(index + 1)}
              >
                <MessageSquare size={14} />
              </button>
            )}
          </li>
        ))}
      </ol>
      {comments > 0 && (
        <div className="work-plan-revise">
          <button className="work-plan-run" disabled={running || editing !== undefined} onClick={onRevise}>
            <MessageSquare size={14} />
            {t('ให้ผู้ช่วยแก้แผนตามความเห็น ({0})', comments)}
          </button>
          <p className="small muted">{t('ผู้ช่วยจะเสนอแผนใหม่ให้คุณอนุมัติอีกครั้ง ถ้าลงมือทำเลย ผู้ช่วยจะทำตามความเห็นในข้อนั้น')}</p>
        </div>
      )}
      {!finished && (
        <div className="work-plan-actions">
          <button className={comments ? 'quiet' : 'work-plan-run'} disabled={running} onClick={() => onExecute(false)}>
            <Play size={14} />
            {done ? t('ทำตามแผนต่อ') : t('ลงมือทำตามแผน')}
          </button>
          <button className="quiet" disabled={running || !plan.approvedAt} onClick={() => onExecute(true)}>
            {t('ทำตามแผนแบบต่อเนื่อง')}
          </button>
        </div>
      )}
      {!finished && (
        <p className="work-plan-hint small muted">{t('สูงสุด 3 รอบ / 10 นาที หยุดรับงานเพิ่มเมื่อใช้ถึง 50,000 token ที่รายงาน')}</p>
      )}
      {continuation && (
        <p role="status">
          {t('งานต่อเนื่องรอบ {0}/{1}', continuation.rounds, continuation.maxRounds)} ·{' '}
          {t(
            {
              running: 'กำลังทำ',
              completed: 'เสร็จแล้ว',
              blocked: 'ติดอยู่',
              budget: 'ถึงขอบเขตที่กำหนด',
              paused: 'พักเพื่อทบทวน',
              interrupted: 'งานถูกขัดจังหวะ',
            }[continuation.status],
          )}
        </p>
      )}
    </details>
  );
}
