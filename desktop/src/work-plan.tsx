import { Check, Circle, LoaderCircle, OctagonAlert, Play, ListChecks } from './icons';
import type { WorkPlan, Workflow } from './types';
import { t } from './i18n';

/** The native workflows offered in the composer (electron/workflows.ts), with the label each shows. */
export const WORKFLOW_LABELS: Record<Workflow, string> = {
  plan: 'วางแผนก่อนลงมือ',
  execute: 'ลงมือทำตามแผน',
  requirements: 'เขียนเอกสารความต้องการ',
  diagnose: 'วิเคราะห์ปัญหา',
  coding: 'เขียนและตรวจโค้ด',
};

/** The plan approved in the plan workflow, ticked off live while the execute workflow works through it. */
export function WorkPlanCard({
  plan,
  running,
  continuation,
  onExecute,
}: {
  plan: WorkPlan;
  running: boolean;
  continuation?: import('./types').Session['longTask'];
  onExecute: (continuous?: boolean) => void;
}) {
  const done = plan.tasks.filter(task => task.status === 'done').length;
  const finished = done === plan.tasks.length;
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
            </span>
          </li>
        ))}
      </ol>
      {!finished && (
        <div className="work-plan-actions">
          <button className="work-plan-run" disabled={running} onClick={() => onExecute(false)}>
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
