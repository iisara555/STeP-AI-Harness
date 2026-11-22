import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ArrowLeft, MessageCircleQuestion, Pencil } from './icons';
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
import { BV_FORMULA } from './bv-travel-reason';

const WHY = /ทำไม|เพราะอะไร|why|\?\s*$/i;
const WHY_WORD = /ทำไม|เพราะอะไร|why/i;
/** A longer question typed while the interview waits is the person's own question, for the AI, not an answer. */
const QUESTION = /ไหม|มั้ย|หรือเปล่า|หรือไม่|อย่างไร|ยังไง|เท่าไร|เท่าไหร่|อะไรบ้าง|\?/;

/** What the case chat's composer asks of the interview: it takes typed text while a question is open. */
export type InterviewHandle = {
  /** The question waiting for an answer, so the composer can show the right hint; null when none is open. */
  pending: () => { input: 'text' | 'amount' | 'date' } | null;
  /**
   * Reads typed text as an answer or a "why". `unread` means it was not an answer; with `fallback` the caller sends it on
   * (to the AI) and the interview shows no hint.
   */
  take: (text: string, fallback: boolean) => 'answered' | 'why' | 'unread' | 'closed';
};

/** The claim interview: one question per turn with quick answers, local "why" answers and one apply action. */
export const ClaimInterview = forwardRef<
  InterviewHandle,
  {
    packet: ReceiptPacket;
    onApply: (summary: ClaimSummary) => void;
    onAskAi?: (text: string) => void;
    /** True while a finished summary waits to be applied, so the page keeps one primary action. */
    onDecision: (waiting: boolean) => void;
    /** Tells the composer that the open question changed, so its hint follows. */
    onQuestion?: (input: 'text' | 'amount' | 'date' | null) => void;
  }
>(function ClaimInterview({ packet, onApply, onAskAi, onDecision, onQuestion }, ref) {
  const blank = packet.guidance.category === 'unsure' && packet.guidance.finance === 'unknown';
  const [open, setOpen] = useState(blank);
  const [answers, setAnswers] = useState<ClaimAnswers>({});
  const [why, setWhy] = useState<Note | null>(null);
  const [hint, setHint] = useState(false);
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
  // Filled another way (a proposal from the case chat, or the form) before any answer here: the interview steps aside.
  useEffect(() => {
    if (!blank && !answeredQuestions(answers).length) setOpen(false);
  }, [blank]);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [answers, why, hint]);
  useEffect(() => {
    onDecision(open && Boolean(summary));
  }, [open, Boolean(summary)]);
  const openInput = open && question ? question.input : null;
  useEffect(() => {
    onQuestion?.(openInput);
  }, [openInput]);
  const answer = (value: string) => {
    if (!pending) return;
    setAnswers(current => applyAnswer(current, pending, value));
    setWhy(null);
    setHint(false);
  };
  useImperativeHandle(ref, () => ({
    pending: () => (open && question ? { input: question.input } : null),
    take: (text, fallback) => {
      if (!open || !pending || !question) return 'closed';
      setHint(false);
      // A "why" with nothing else in it is answered here from the rule's source; a longer question goes to the AI.
      const long = text.trim().length > 24;
      // With an AI to ask, only an explicit short "why" stays here; any other question goes to the AI.
      if (fallback ? WHY_WORD.test(text) && !long : WHY.test(text)) {
        setWhy(question.why);
        return 'why';
      }
      if (fallback && long && QUESTION.test(text)) return 'unread';
      const value = parseAnswer(pending, text);
      if (value !== null) {
        answer(value);
        return 'answered';
      }
      if (!fallback) setHint(true);
      return 'unread';
    },
  }));
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
            {question.example && <p className="claim-example small muted">{t(question.example)}</p>}
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
        {summary && onAskAi && (
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
});

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
      {summary.travelReason && (
        <>
          <h4>{t('เหตุผลการเดินทาง (ร่าง)')}</h4>
          <p className="claim-reason">{summary.travelReason}</p>
          <p className="small muted">{t('ใส่ในช่องวัตถุประสงค์เมื่อกดใช้ แก้ต่อได้ · {0}', t(BV_FORMULA))}</p>
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
