import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, MessageCircleQuestion, Pencil } from './icons';
import { t } from './i18n';
import {
  answerLabel,
  answeredQuestions,
  applyAnswer,
  claimAiPrompt,
  claimCategoryText,
  claimSummary,
  claimTitle,
  nextQuestion,
  parseAnswer,
  questionView,
  undoLast,
  type ClaimAnswers,
  type ClaimSummary,
  type Note,
} from './claim-interview';
import type { ReceiptPacket } from './receipt-packet';

const WHY = /ทำไม|เพราะอะไร|why|\?\s*$/i;

/** The claim interview: one question per turn with quick answers, local "why" answers and one apply action. */
export function ClaimInterview({
  packet,
  onApply,
  onAskAi,
  onDecision,
}: {
  packet: ReceiptPacket;
  onApply: (summary: ClaimSummary) => void;
  onAskAi: (text: string) => void;
  /** True while a finished summary waits to be applied, so the page keeps one primary action. */
  onDecision: (waiting: boolean) => void;
}) {
  const blank = packet.guidance.category === 'unsure' && packet.guidance.finance === 'unknown';
  const [open, setOpen] = useState(blank);
  const [answers, setAnswers] = useState<ClaimAnswers>({});
  const [why, setWhy] = useState<Note | null>(null);
  const [hint, setHint] = useState(false);
  const [text, setText] = useState('');
  const [applied, setApplied] = useState('');
  const end = useRef<HTMLDivElement | null>(null);
  const pending = nextQuestion(answers);
  const question = pending ? questionView(pending, answers, packet) : null;
  const summary = claimSummary(answers);
  useEffect(() => {
    setOpen(packet.guidance.category === 'unsure' && packet.guidance.finance === 'unknown');
    setAnswers({});
    setApplied('');
  }, [packet.id]);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [answers, why, hint]);
  useEffect(() => {
    onDecision(open && Boolean(summary));
  }, [open, Boolean(summary)]);
  const answer = (value: string) => {
    if (!pending) return;
    setAnswers(current => applyAnswer(current, pending, value));
    setWhy(null);
    setHint(false);
    setText('');
  };
  const submit = () => {
    if (!pending || !text.trim()) return;
    if (WHY.test(text)) {
      setWhy(question!.why);
      setText('');
      return;
    }
    const value = parseAnswer(pending, text);
    if (value === null) setHint(true);
    else answer(value);
  };
  if (!open)
    return (
      <div className="claim-closed">
        <span>{applied ? t('ตอบแล้ว: {0}', applied) : t('ไม่แน่ใจว่าเบิกแบบไหน')}</span>
        <button type="button" className="text-link" onClick={() => setOpen(true)}>
          <MessageCircleQuestion size={14} />
          {applied ? t('แก้คำตอบ') : t('ให้ช่วยถามทีละข้อ')}
        </button>
      </div>
    );
  return (
    <section className="claim-interview" aria-label={t('ถามทีละข้อ')}>
      <div className="claim-log" role="log" aria-live="polite">
        {answeredQuestions(answers).map(id => (
          <div key={id} className="claim-turn">
            <p className="claim-ask">{t(questionView(id, answers, packet).text)}</p>
            <p className="claim-reply">{answerLabel(id, answers, t)}</p>
          </div>
        ))}
        {question && (
          <div className="claim-turn">
            <p className="claim-ask">{t(question.text)}</p>
            {question.recommended && (
              <p className="claim-recommend">
                {t(
                  'แนะนำ: {0} · {1}',
                  t(question.options.find(option => option.value === question.recommended!.value)!.label),
                  t(question.recommended.reason),
                )}
              </p>
            )}
            {why && (
              <p className="claim-why">
                {t(why.text)}
                <span>{t(why.source)}</span>
              </p>
            )}
            {hint && <p className="claim-why">{t('ยังอ่านคำตอบนี้ไม่ออก เลือกจากตัวเลือก หรือพิมพ์ให้ชัดขึ้น')}</p>}
          </div>
        )}
        <div ref={end} />
      </div>
      {question && (
        <>
          <div className="claim-options" role="group" aria-label={t(question.text)}>
            {question.options.map(option => (
              <button
                type="button"
                key={option.value}
                className={question.recommended?.value === option.value ? 'claim-option recommended' : 'claim-option'}
                onClick={() => answer(option.value)}
              >
                {t(option.label)}
              </button>
            ))}
            {!why && (
              <button type="button" className="claim-option quiet-option" onClick={() => setWhy(question.why)}>
                {t('ทำไมต้องถาม')}
              </button>
            )}
          </div>
          <form
            className="claim-input"
            onSubmit={event => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              aria-label={t('พิมพ์คำตอบ')}
              value={text}
              maxLength={200}
              inputMode={question.input === 'amount' ? 'decimal' : undefined}
              placeholder={t(
                question.input === 'amount' ? 'เช่น 3,500' : question.input === 'date' ? 'เช่น 18 พ.ย. 2569' : 'พิมพ์คำตอบ หรือถามว่าทำไม',
              )}
              onChange={event => {
                setText(event.target.value);
                setHint(false);
              }}
            />
            <button type="submit" className="icon" aria-label={t('ส่งคำตอบ')} disabled={!text.trim()}>
              <ArrowUp size={16} />
            </button>
          </form>
        </>
      )}
      {summary && <SummaryCard summary={summary} />}
      <div className="claim-actions">
        {answeredQuestions(answers).length > 0 && (
          <button type="button" className="text-link" onClick={() => setAnswers(undoLast)}>
            <ArrowLeft size={14} />
            {t('ย้อนข้อก่อน')}
          </button>
        )}
        {summary && (
          <button type="button" className="quiet" onClick={() => onAskAi(claimAiPrompt(answers, summary, t))}>
            {t('ถาม AI ต่อ')}
          </button>
        )}
        {summary && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              onApply(summary);
              setApplied(`${claimTitle(summary.expense, t)} · ${categoryCode(summary)}`);
              setOpen(false);
            }}
          >
            <Pencil size={14} />
            {t('ใช้กับชุดเอกสารนี้')}
          </button>
        )}
        {!summary && !blank && (
          <button type="button" className="text-link" onClick={() => setOpen(false)}>
            {t('ปิด')}
          </button>
        )}
      </div>
    </section>
  );
}

/** Beside the expense title the code is enough: "B10", not "B10 · ค่าน้ำดื่ม" again. */
const categoryCode = (summary: ClaimSummary) => summary.code || claimCategoryText(summary, t);

function SummaryCard({ summary }: { summary: ClaimSummary }) {
  return (
    <div className="claim-summary" role="status">
      <h3>{claimTitle(summary.expense, t)}</h3>
      <dl>
        <dt>{t('หมวด')}</dt>
        <dd>{categoryCode(summary)}</dd>
        {summary.deadline && (
          <>
            <dt>{t('กำหนดส่ง')}</dt>
            <dd>
              {t(
                'รายงานขอความเห็นชอบภายใน {0} ({1} วันทำการ ไม่นับวันหยุดนักขัตฤกษ์)',
                summary.deadline.date,
                String(summary.deadline.days),
              )}
            </dd>
          </>
        )}
      </dl>
      {summary.documents.length > 0 && (
        <>
          <h4>{t('เอกสารที่ต้องเตรียม')}</h4>
          <ul>
            {summary.documents.map(item => (
              <li key={item}>{t(item)}</li>
            ))}
          </ul>
        </>
      )}
      {summary.notes.length > 0 && (
        <ul className="claim-notes">
          {summary.notes.map(note => (
            <li key={note.text}>
              {t(note.text)}
              <span>{t(note.source)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
