import { useState } from 'react';
import type { ToolQuestion } from './types';
import { explainError } from './messages';
import { t } from './i18n';
export function QuestionCard({ question, onAnswer }: { question: ToolQuestion; onAnswer: (answer: string | null) => Promise<void> }) {
  const [answer, setAnswer] = useState(''),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async (value: string | null) => {
    setBusy(true);
    setError('');
    try {
      await onAnswer(value);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="message assistant tool-question">
      <p>{question.question}</p>
      {error && <p role="alert">{error}</p>}
      <div className="tool-actions">
        {question.options.map((label, i) => (
          <button className={answer === label ? '' : 'quiet'} key={i} disabled={busy} onClick={() => setAnswer(label)}>
            {label}
          </button>
        ))}
      </div>
      <form
        onSubmit={e => {
          e.preventDefault();
          void send(answer);
        }}
      >
        <input
          aria-label={t('คำตอบสำหรับ AI')}
          placeholder={t('เลือกตัวเลือกหรือพิมพ์คำตอบ')}
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          maxLength={2000}
        />
        <div className="tool-actions">
          <button disabled={busy || !answer.trim()}>{t('ส่งคำตอบ')}</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => void send(null)}>
            {t('ยกเลิกงานนี้')}
          </button>
        </div>
      </form>
    </article>
  );
}
