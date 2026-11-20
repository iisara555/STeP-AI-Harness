import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Square, X } from './icons';
import { t } from './i18n';
import { RichText } from './ui';
import { errorText } from './messages';
import { appendStream, discardStream, STREAM_LIMIT, turnBreak } from './run-flow';
import { ClaimInterview, type InterviewHandle } from './claim-interview-panel';
import { applyClaimSummary, type ClaimSummary } from './claim-interview';
import { applyClaimUpdate, claimUpdateRows, pendingClaimUpdate, splitClaimReply, type ClaimUpdate } from './claim-case';
import type { ReceiptPacket } from './receipt-packet';
import type { Session } from './types';

/** How the case chat reaches the AI; supplied by the workspace so the run stays out of the main chat. */
export type CaseChatApi = {
  sessions: Session[];
  /** The AI chosen in the composer, ready to answer; empty when none is. */
  aiName: string;
  open: (packetId: string, title: string) => Promise<string | null>;
  send: (id: string, text: string, sourceText: string) => Promise<boolean>;
  openAiSettings?: () => void;
};

type Props = {
  packet: ReceiptPacket;
  chat: CaseChatApi;
  /** Sends a question into this case's chat with the case context; false when it did not go out. */
  ask: (text: string) => Promise<boolean>;
  call: (method: string, input?: unknown) => Promise<any>;
  onEvent: (callback: (event: { type: string; text?: string; sessionId?: string; count?: number }) => void) => () => void;
  /** Changes the case the same way the form does, so it is saved and the evidence list follows. */
  onChange: (update: (packet: ReceiptPacket) => ReceiptPacket) => void;
  /** True while a proposal or a finished interview waits for the person, so the page keeps one primary action. */
  onDecision: (waiting: boolean) => void;
  notify: (text: string, tone?: 'info' | 'success' | 'error') => void;
};

const HINT = { amount: 'เช่น 3,500', date: 'เช่น 18 พ.ย. 2569', text: 'ตอบ หรือถามว่าทำไม' } as const;

/** One chat per disbursement case: the interview, then questions to the AI, answered and filled in here. */
export function ClaimCaseChat({ packet, chat, ask: askCase, call, onEvent, onChange, onDecision, notify }: Props) {
  const session = chat.sessions.find(s => s.claimPacketId === packet.id);
  const interview = useRef<InterviewHandle>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState('');
  const [question, setQuestion] = useState<'text' | 'amount' | 'date' | null>(null);
  const [stream, setStream] = useState('');
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState<Record<string, true>>({});
  const [interviewWaiting, setInterviewWaiting] = useState(false);
  const running = sending || ['running', 'queued'].includes(session?.status || '');
  const id = session?.id;
  useEffect(() => {
    if (!id) return;
    return onEvent(event => {
      if (event.sessionId !== id) return;
      if (event.type === 'delta') setStream(value => appendStream(value, event.text || '', STREAM_LIMIT));
      if (event.type === 'discard' && event.count) setStream(value => discardStream(value, event.count!));
      if (event.type === 'status') setStream(turnBreak);
      if (event.type === 'changed') setStream('');
    });
  }, [id, onEvent]);
  useEffect(() => {
    setText('');
    setStream('');
  }, [packet.id]);
  const messages = (session?.messages || []).filter(message => message.role !== 'status' || message.text !== 'CANCELLED');
  const lastAnswer = messages.map(message => message.role).lastIndexOf('assistant');
  const proposal = (() => {
    if (lastAnswer < 0 || running || dismissed[`${id}:${lastAnswer}`]) return null;
    return pendingClaimUpdate(packet, splitClaimReply(messages[lastAnswer].text).update);
  })();
  useEffect(() => {
    onDecision(interviewWaiting || Boolean(proposal));
  }, [interviewWaiting, Boolean(proposal)]);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages.length, stream, Boolean(proposal)]);
  const ask = async (value: string) => {
    setSending(true);
    try {
      return await askCase(value);
    } finally {
      setSending(false);
    }
  };
  const submit = async () => {
    const value = text.trim();
    if (!value || running) return;
    const taken = interview.current?.take(value, Boolean(chat.aiName)) || 'closed';
    if (taken === 'answered' || taken === 'why' || (taken === 'unread' && !chat.aiName)) {
      setText('');
      return;
    }
    if (!chat.aiName) {
      notify(t('ยังไม่ได้เลือก AI เลือกในกล่องพิมพ์ หรือเพิ่มบัญชี AI ก่อน'), 'info');
      return;
    }
    if (await ask(value)) setText(current => (current.trim() === value ? '' : current));
  };
  const apply = (update: ClaimUpdate) => {
    onChange(value => applyClaimUpdate(value, update));
    notify(t('ใช้ข้อมูลกับเรื่องนี้แล้ว'), 'success');
  };
  return (
    <section className="case-chat" aria-label={t('แชตในเรื่องนี้')}>
      <div className="case-chat-log" role="log" aria-live="polite">
        <ClaimInterview
          ref={interview}
          packet={packet}
          onDecision={setInterviewWaiting}
          onQuestion={setQuestion}
          onApply={(summary: ClaimSummary) => onChange(value => applyClaimSummary(value, summary))}
          onAskAi={chat.aiName ? value => void ask(value) : undefined}
        />
        {messages.map((message, index) => {
          if (message.role === 'user')
            return (
              <article key={index} className="message user" aria-label={t('คุณ')}>
                <div className="message-body">{message.text}</div>
              </article>
            );
          if (message.role === 'status')
            return (
              <article key={index} className="message status" aria-label={t('สถานะงาน')}>
                <div className="message-body">{errorText[message.text] || t(message.text)}</div>
              </article>
            );
          const reply = splitClaimReply(message.text);
          return (
            <article key={index} className="message assistant" aria-label={t('ผู้ช่วยเบิกจ่าย')}>
              <RichText className="message-body" text={reply.text} />
              {index === lastAnswer && proposal && (
                <ProposalCard
                  update={proposal}
                  onApply={() => apply(proposal)}
                  onDismiss={() => setDismissed(value => ({ ...value, [`${id}:${index}`]: true }))}
                />
              )}
              {reply.update && !pendingClaimUpdate(packet, reply.update) && (
                <p className="case-applied small muted">
                  <Check size={13} />
                  {t('ข้อมูลที่เสนออยู่ในเรื่องนี้แล้ว')}
                </p>
              )}
            </article>
          );
        })}
        {running && (
          <article className="message assistant" aria-label={t('ผู้ช่วยเบิกจ่าย')}>
            {stream.trim() ? (
              <RichText className="message-body streaming" text={splitClaimReply(stream).text} />
            ) : (
              <p className="message-body muted">{t('กำลังหาคำตอบจากเอกสาร STeP…')}</p>
            )}
          </article>
        )}
        {!chat.aiName && !question && (
          <p className="case-chat-note small muted">
            {t('ถามเรื่องอื่นในเรื่องนี้ได้เมื่อเลือก AI แล้ว')}
            {chat.openAiSettings && (
              <button type="button" className="text-link" onClick={chat.openAiSettings}>
                {t('ไปที่หน้าเชื่อมต่อ AI')}
              </button>
            )}
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        className="case-composer"
        onSubmit={event => {
          event.preventDefault();
          void submit();
        }}
      >
        <textarea
          aria-label={t('พิมพ์ในแชตเรื่องนี้')}
          rows={1}
          value={text}
          maxLength={4000}
          inputMode={question === 'amount' ? 'decimal' : undefined}
          placeholder={t(question ? HINT[question] : chat.aiName ? 'ถามหรือพิมพ์ข้อมูลเรื่องนี้' : 'เลือก AI ก่อนถามเรื่องอื่น')}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {running && id ? (
          <button type="button" className="icon" aria-label={t('หยุดตอบ')} onClick={() => void call('cancel', { id })}>
            <Square size={14} />
          </button>
        ) : (
          <button type="submit" className="icon case-send" aria-label={t('ส่ง')} disabled={!text.trim() || running}>
            <ArrowUp size={16} />
          </button>
        )}
        <span className="case-composer-ai small muted">{chat.aiName || t('ยังไม่ได้เลือก AI · ตอบจากกฎในเครื่อง')}</span>
      </form>
    </section>
  );
}

function ProposalCard({ update, onApply, onDismiss }: { update: ClaimUpdate; onApply: () => void; onDismiss: () => void }) {
  return (
    <div className="case-proposal" role="group" aria-label={t('เสนอกรอกในเรื่องนี้')}>
      <strong>{t('เสนอกรอกในเรื่องนี้')}</strong>
      <dl>
        {claimUpdateRows(update, t).map(row => (
          <div key={row.key}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="case-proposal-actions">
        <button type="button" className="primary" onClick={onApply}>
          {t('ใช้ข้อมูลนี้')}
        </button>
        <button type="button" className="text-link" onClick={onDismiss}>
          <X size={13} />
          {t('ไม่ใช้')}
        </button>
      </div>
    </div>
  );
}
