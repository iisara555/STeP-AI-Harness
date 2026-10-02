import { useState } from 'react';
import { MessageCircleQuestion, ArrowUp } from 'lucide-react';
import type { ToolQuestion } from './types';
import { explainError } from './messages';
import { t } from './i18n';

/**
 * A question the assistant asks mid-task (ask_user), shown above the composer like Claude's and ChatGPT's: each option
 * is one row that answers at a click (or with its number key), and "another answer" takes free text.
 */
export function QuestionCard({ question, onAnswer }: { question: ToolQuestion; onAnswer: (answer: string | null) => Promise<void> }) {
  const [answer, setAnswer] = useState(''),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async (value: string | null) => {
    if (busy) return;
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
    <section
      className="tool-question"
      aria-label={t('คำถามจากผู้ช่วย')}
      onKeyDown={e => {
        const index = Number(e.key) - 1;
        if (e.target instanceof HTMLInputElement || !Number.isInteger(index) || !question.options[index]) return;
        e.preventDefault();
        void send(question.options[index]);
      }}
    >
      <header>
        <MessageCircleQuestion size={16} />
        <span>{t('ผู้ช่วยถาม')}</span>
      </header>
      <p className="tool-question-text">{question.question}</p>
      {error && (
        <p role="alert" className="danger-text">
          {error}
        </p>
      )}
      {question.options.length > 0 && (
        <ol className="tool-question-options">
          {question.options.map((label, i) => (
            <li key={i}>
              <button className="quiet" disabled={busy} autoFocus={i === 0} onClick={() => void send(label)}>
                <kbd>{i + 1}</kbd>
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <form
        className="tool-question-other"
        onSubmit={e => {
          e.preventDefault();
          if (answer.trim()) void send(answer.trim());
        }}
      >
        <input
          aria-label={t('คำตอบสำหรับ AI')}
          placeholder={question.options.length ? t('หรือพิมพ์คำตอบอื่น') : t('พิมพ์คำตอบ')}
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          maxLength={2000}
          autoFocus={!question.options.length}
        />
        <button className="icon" aria-label={t('ส่งคำตอบ')} title={t('ส่งคำตอบ')} disabled={busy || !answer.trim()}>
          <ArrowUp size={15} />
        </button>
      </form>
      <button type="button" className="quiet tool-question-cancel" disabled={busy} onClick={() => void send(null)}>
        {t('ยกเลิกงานนี้')}
      </button>
    </section>
  );
}
