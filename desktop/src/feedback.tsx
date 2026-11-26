import { useState } from 'react';
import { Bookmark, ThumbsDown, ThumbsUp } from './icons';
import type { Message } from './types';
import { ConfirmDialog } from './ui';
import { explainError } from './messages';
import { t } from './i18n';

type Call = (method: string, input?: unknown) => Promise<any>;
export type FeedbackAsk = { sessionId: string; index: number; kind: 'fix' | 'remember'; text: string };

/** Rating buttons under an answer. Nothing is remembered from here without a dialog the person confirms. */
export function FeedbackButtons({
  sessionId,
  index,
  message,
  call,
  onAsk,
  onDone,
}: {
  sessionId: string;
  index: number;
  message: Message;
  call: Call;
  onAsk: (ask: FeedbackAsk) => void;
  onDone: (text: string) => void;
}) {
  const good = message.feedback === 'good',
    fix = message.feedback === 'fix';
  return (
    <span className="feedback-actions" role="group" aria-label={t('ให้ความเห็นต่อคำตอบนี้')}>
      <button
        className={good ? 'icon active' : 'icon'}
        aria-label={t('ดี')}
        aria-pressed={good}
        title={t('คำตอบนี้ดี')}
        onClick={() =>
          void call('messageFeedback', { id: sessionId, index, rating: good ? null : 'good' })
            .then(() => onDone(good ? '' : t('ขอบคุณครับ บันทึกว่าคำตอบนี้ดี')))
            .catch(e => onDone(explainError(e)))
        }
      >
        <ThumbsUp size={15} />
      </button>
      <button
        className={fix ? 'icon active' : 'icon'}
        aria-label={t('ต้องแก้')}
        aria-pressed={fix}
        title={t('คำตอบนี้ต้องแก้')}
        onClick={() =>
          fix
            ? void call('messageFeedback', { id: sessionId, index, rating: null }).catch(e => onDone(explainError(e)))
            : onAsk({ sessionId, index, kind: 'fix', text: '' })
        }
      >
        <ThumbsDown size={15} />
      </button>
      <button
        className="icon"
        aria-label={t('จำสิ่งนี้')}
        title={t('จำสิ่งนี้ไว้ใช้กับงานถัดไป')}
        onClick={() => onAsk({ sessionId, index, kind: 'remember', text: message.text.trim().slice(0, 600) })}
      >
        <Bookmark size={15} />
      </button>
    </span>
  );
}

const memoryName = (text: string) => (text.split('\n').find(line => line.trim()) || text).trim().slice(0, 60);

export function FeedbackDialog({
  ask,
  call,
  hasWorkspace,
  onClose,
  onDone,
  onReport,
  onRevise,
}: {
  ask: FeedbackAsk;
  call: Call;
  hasWorkspace: boolean;
  onClose: () => void;
  onDone: (text: string) => void;
  /** Opens "แจ้งปัญหา / เสนอแนะ" for this answer instead; absent when IT turned it off. */
  onReport?: (text: string) => void;
  /** Asks the AI to answer again with the note; absent while the task runs or where a new turn cannot start. */
  onRevise?: (note: string) => Promise<unknown>;
}) {
  const [text, setText] = useState(ask.text),
    [scope, setScope] = useState<'private' | 'project'>('private'),
    [remember, setRemember] = useState(true);
  const fix = ask.kind === 'fix',
    note = text.trim(),
    revise = fix && Boolean(onRevise && note);
  return (
    <ConfirmDialog
      title={fix ? t('คำตอบนี้ต้องแก้อะไร') : t('จำสิ่งนี้ไว้ใช้กับงานถัดไป')}
      confirmLabel={fix ? (revise ? t('แก้คำตอบ') : t('ส่งความเห็น')) : t('จำไว้')}
      onCancel={onClose}
      onConfirm={async () => {
        try {
          if (fix) {
            const result = await call('messageFeedback', {
              id: ask.sessionId,
              index: ask.index,
              rating: 'fix',
              note: text,
              remember: Boolean(note) && remember,
            });
            const saved = result?.remembered ? t('จำไว้แล้ว ใช้กับคำขอแบบนี้ครั้งถัดไป') : '';
            onDone(saved || (revise ? '' : t('บันทึกว่าคำตอบนี้ต้องแก้')));
            onClose();
            // The person asked for a better answer, so it is written now instead of waiting for the same request again.
            // The dialog is already closed: the new answer streams in the task like any other turn.
            if (revise) void onRevise!(note).catch(e => onDone(explainError(e)));
            return;
          } else {
            if (!text.trim()) throw new Error('MEMORY_INVALID');
            await call('memorySave', {
              name: memoryName(text),
              text: text.trim(),
              type: 'reference',
              scope,
              importance: 0.7,
              ttl_days: 0,
            });
            onDone(t('จำแล้ว ผู้ช่วยจะใช้กับงานถัดไปที่เกี่ยวข้อง ดูหรือลบได้ในหน้าความจำ'));
          }
          onClose();
        } catch (e) {
          throw new Error(explainError(e));
        }
      }}
    >
      {fix ? (
        <>
          <label className="feedback-field">
            {t('บอกสั้น ๆ ว่าควรแก้อะไร เช่น “สรุปเป็นตาราง” หรือ “ใช้ภาษาทางการกว่านี้”')}
            <textarea value={text} rows={3} maxLength={1000} onChange={e => setText(e.target.value)} />
          </label>
          <label className="feedback-check">
            <input type="checkbox" checked={remember} disabled={!note} onChange={e => setRemember(e.target.checked)} />
            {t('จำไว้ใช้กับคำขอแบบนี้ครั้งถัดไป')}
          </label>
        </>
      ) : (
        <>
          <label className="feedback-field">
            {t('แก้ข้อความให้เหลือเฉพาะสิ่งที่ควรจำ')}
            <textarea value={text} rows={6} maxLength={4000} onChange={e => setText(e.target.value)} />
          </label>
          <div className="feedback-scope" role="radiogroup" aria-label={t('ขอบเขตความจำ')}>
            <label>
              <input type="radio" checked={scope === 'private'} onChange={() => setScope('private')} />
              {t('ส่วนตัว (เฉพาะคุณในเครื่องนี้)')}
            </label>
            <label>
              <input type="radio" checked={scope === 'project'} disabled={!hasWorkspace} onChange={() => setScope('project')} />
              {t('พื้นที่งานนี้')}
            </label>
          </div>
        </>
      )}
      {fix && onReport && (
        <button type="button" className="quiet feedback-report" onClick={() => onReport(text)}>
          {t('คำตอบผิดหรือแอปมีปัญหา? แจ้งผู้ดูแลแอปแทน')}
        </button>
      )}
      <p className="small muted">
        {fix
          ? t('เก็บในเครื่องนี้ ดูหรือลบได้ในหน้าความจำ ข้อความที่มีข้อมูลส่วนบุคคลจะไม่ถูกจำ')
          : t('เก็บในเครื่องนี้เท่านั้น ข้อความที่มีข้อมูลส่วนบุคคลหรือความลับจะไม่ถูกจำ')}
      </p>
    </ConfirmDialog>
  );
}

/** Where "แจ้งปัญหา / เสนอแนะ" was opened: from an answer (the answer can be attached) or from the menu. */
export type ReportAsk = { sessionId?: string; index?: number; text?: string; errorCode?: string };

/**
 * "แจ้งปัญหา / เสนอแนะ": sends a problem, an idea or a wrong answer to the app's administrators. The app checks the
 * text for personal data and shows exactly what goes in a confirmation before anything is sent.
 */
export function ReportDialog({
  ask,
  call,
  userName,
  team,
  onClose,
  onDone,
}: {
  ask: ReportAsk;
  call: Call;
  userName: string;
  team: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const fromAnswer = ask.index !== undefined && Boolean(ask.sessionId);
  const [category, setCategory] = useState<'problem' | 'idea' | 'answer'>(fromAnswer ? 'answer' : 'problem'),
    [text, setText] = useState(ask.text || ''),
    [includeName, setIncludeName] = useState(Boolean(userName)),
    [attachAnswer, setAttachAnswer] = useState(false);
  const categories: [typeof category, string][] = [
    ['problem', t('ปัญหาการใช้งาน')],
    ['idea', t('ข้อเสนอแนะ')],
    ['answer', t('คำตอบไม่ถูกต้อง')],
  ];
  return (
    <ConfirmDialog
      title={t('แจ้งปัญหา / เสนอแนะ')}
      confirmLabel={t('ส่งถึงผู้ดูแล')}
      confirmDisabled={!text.trim()}
      onCancel={onClose}
      onConfirm={async () => {
        try {
          const result = await call('feedbackSend', {
            category,
            text,
            includeName,
            attachAnswer: fromAnswer && attachAnswer,
            sessionId: ask.sessionId,
            index: ask.index,
            errorCode: ask.errorCode,
          });
          onDone(t('ส่งถึงผู้ดูแลแล้ว เลขที่ {0} ขอบคุณที่ช่วยให้แอปดีขึ้นครับ', result.reference));
          onClose();
        } catch (e) {
          // The employee closed the confirmation: keep the form as typed, with no error and the button enabled again.
          if (e instanceof Error && /CANCELLED/.test(e.message)) throw new Error('');
          throw new Error(explainError(e));
        }
      }}
    >
      <div className="feedback-scope" role="radiogroup" aria-label={t('เรื่องที่จะแจ้ง')}>
        {categories.map(([id, label]) => (
          <label key={id}>
            <input type="radio" checked={category === id} onChange={() => setCategory(id)} />
            {label}
          </label>
        ))}
      </div>
      <label className="feedback-field">
        {t('เล่าสั้น ๆ ว่าเกิดอะไรขึ้น หรืออยากให้ปรับอะไร')}
        <textarea value={text} rows={5} maxLength={2000} onChange={e => setText(e.target.value)} />
      </label>
      {fromAnswer && (
        <label className="feedback-check">
          <input type="checkbox" checked={attachAnswer} onChange={e => setAttachAnswer(e.target.checked)} />
          {t('แนบคำตอบของ AI ข้อนี้ไปด้วย')}
        </label>
      )}
      {userName && (
        <label className="feedback-check">
          <input type="checkbox" checked={includeName} onChange={e => setIncludeName(e.target.checked)} />
          {t('ใส่ชื่อของฉัน ({0}) เพื่อให้ผู้ดูแลติดต่อกลับได้', userName + (team ? ' · ' + team : ''))}
        </label>
      )}
      <p className="small muted">
        {t('ส่งเฉพาะข้อความนี้ รุ่นแอป และระบบปฏิบัติการ ไม่ส่งบทสนทนา ไฟล์ หรือร่างอื่น ข้อความที่มีข้อมูลส่วนบุคคลจะส่งไม่ได้')}
      </p>
    </ConfirmDialog>
  );
}
