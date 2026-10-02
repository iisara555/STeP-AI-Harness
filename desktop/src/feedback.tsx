import { useState } from 'react';
import { Bookmark, ThumbsDown, ThumbsUp } from 'lucide-react';
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
}: {
  ask: FeedbackAsk;
  call: Call;
  hasWorkspace: boolean;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [text, setText] = useState(ask.text),
    [scope, setScope] = useState<'private' | 'project'>('private');
  const fix = ask.kind === 'fix';
  return (
    <ConfirmDialog
      title={fix ? t('คำตอบนี้ต้องแก้อะไร') : t('จำสิ่งนี้ไว้ใช้กับงานถัดไป')}
      confirmLabel={fix ? t('ส่งความเห็น') : t('จำไว้')}
      onCancel={onClose}
      onConfirm={async () => {
        try {
          if (fix) {
            const result = await call('messageFeedback', { id: ask.sessionId, index: ask.index, rating: 'fix', note: text });
            onDone(result?.proposed ? t('บันทึกแล้ว ข้อเสนอความจำรอคุณยืนยันในหน้าความจำ') : t('บันทึกว่าคำตอบนี้ต้องแก้'));
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
        <label className="feedback-field">
          {t('บอกสั้น ๆ ว่าควรแก้อะไร (ไม่บังคับ) เช่น “สรุปเป็นตาราง” หรือ “ใช้ภาษาทางการกว่านี้”')}
          <textarea value={text} rows={3} maxLength={1000} onChange={e => setText(e.target.value)} />
        </label>
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
      <p className="small muted">
        {fix
          ? t('ความเห็นพร้อมข้อความจะกลายเป็นข้อเสนอความจำ ต้องยืนยันก่อนใช้ ข้อความที่มีข้อมูลส่วนบุคคลจะไม่ถูกจำ')
          : t('เก็บในเครื่องนี้เท่านั้น ข้อความที่มีข้อมูลส่วนบุคคลหรือความลับจะไม่ถูกจำ')}
      </p>
    </ConfirmDialog>
  );
}
