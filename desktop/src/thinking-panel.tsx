// The AI's thinking above its answer: folded to one line with the time it took, opened to the stages and thoughts that
// led to the answer, as Gemini Enterprise shows it. The same panel shows the live log while the AI works.
import { useState } from 'react';
import { ACTION_ICONS, ACTION_LABELS } from './work-assistant';
import { ChevronDown } from 'lucide-react';
import { Brain, CircleCheck } from './icons';
import { t } from './i18n';
import { savedThinking, settledNotes, type Thinking, type ThinkingStep } from './thinking';

/** "45 วินาที", "2 นาที 25 วินาที": the time a thought or the whole thinking took. */
export function thinkingTime(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? t('{0} นาที {1} วินาที', minutes, seconds % 60) : t('{0} วินาที', seconds);
}

/** A tool stage arrives as "reference docs/x.md": said in the employee's words, with the file or page it used. */
export function stageLabel(title: string) {
  const tool = /^([a-z_]+)(?:\s+(.+))?$/.exec(title);
  if (tool && ACTION_LABELS[tool[1]])
    return { label: t(ACTION_LABELS[tool[1]]), detail: tool[2]?.split(/[\\/]/).pop() || '', tool: tool[1] };
  return { label: t(title), detail: '', tool: '' };
}

// Reasoning is Markdown-ish; the panel shows it as quiet text without the emphasis markers.
const plain = (text: string) => text.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/`([^`\n]+)`/g, '$1');

function Stage({ step }: { step: ThinkingStep }) {
  const { label, detail, tool } = stageLabel(step.title);
  const Icon = (tool && ACTION_ICONS[tool]) || CircleCheck;
  return (
    <li className="thinking-stage">
      {step.title && (
        <div className="thinking-stage-title">
          <Icon size={15} aria-hidden="true" />
          <span>
            {label}
            {detail && <span className="thinking-detail"> · {detail}</span>}
          </span>
          {step.ms >= 1000 && <span className="thinking-time">{thinkingTime(step.ms)}</span>}
        </div>
      )}
      {step.notes.map((note, i) => (
        <div className="thinking-note" key={i}>
          {note.title && <strong>{plain(note.title)}</strong>}
          {note.text && <p>{plain(note.text)}</p>}
        </div>
      ))}
    </li>
  );
}

export function ThinkingPanel({
  thinking,
  running = false,
  current = [],
}: {
  thinking: Thinking;
  running?: boolean;
  /** While running: the label the status line shows, and the one it moves to next. */
  current?: string[];
}) {
  // Open while the AI works so the thinking is seen as it happens; a finished answer keeps it folded under one line.
  const [open, setOpen] = useState(running);
  // While the AI works, the status line under the panel (`current`) names the stage in progress, so the panel shows its
  // thoughts without repeating its title. Only while the line names it (or is about to): once the line moves on (the
  // next model turn, or a stage too quick to show there), the title shows here, so no stage is hidden from both, and a
  // title once shown here is never taken back.
  const last = thinking.steps.length - 1;
  const steps = (
    running
      ? thinking.steps.map((step, i) =>
          i === last
            ? { ...step, title: current.includes(stageLabel(step.title).label) ? '' : step.title, notes: settledNotes(step.notes) }
            : step,
        )
      : thinking.steps
  ).filter(step => step.title || step.notes.length);
  if (!steps.length) return null;
  const time = thinkingTime(thinking.ms);
  return (
    <details className={`thinking-panel${running ? ' running' : ''}`} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>
        <ChevronDown size={15} className="thinking-chevron" aria-hidden="true" />
        {running ? <Brain size={15} aria-hidden="true" /> : null}
        <span>
          {/* The status line under a running answer already counts the time. */}
          {running ? t('กำลังคิด') : open ? t('ซ่อนความคิด') : t('แสดงความคิด')}
          {!running && <span className="thinking-time"> ({time})</span>}
        </span>
      </summary>
      <ol className="thinking-stages">
        {steps.map((step, i) => (
          <Stage key={i} step={step} />
        ))}
        {/* Antigravity, for one, reports its steps and time but not the words of its thinking. */}
        {!running && !steps.some(step => step.notes.length) && (
          <li className="thinking-stage thinking-unsaid">{t('AI ที่เชื่อมอยู่ไม่ส่งข้อความความคิดออกมา จึงเห็นเฉพาะขั้นตอนที่ทำ')}</li>
        )}
      </ol>
    </details>
  );
}

/** The thinking a saved answer kept, when it kept any. */
export function SavedThinking({ value }: { value: unknown }) {
  const thinking = savedThinking(value);
  return thinking ? <ThinkingPanel thinking={thinking} /> : null;
}
