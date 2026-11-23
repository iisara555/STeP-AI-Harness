// What changes many times a second while a task runs: the streamed answer, the thinking (stages and reasoning), the last
// heartbeat and the one-second clock. It lives outside the workspace state so a streamed token re-renders only the parts that show it
// (the conversation and the status bar), not the sidebar, side panel and dialogs.
//
// Readers subscribe with ordinary React state rather than useSyncExternalStore: a store update then lands in the same
// render as the workspace updates made by the same app event (for example "run finished" and "clear the stream"), so
// no frame shows one without the other.
import { useEffect, useRef, useState } from 'react';
import { visibleStream } from './tools';
import { formatElapsed } from './ui';
import { ThinkingLog, type Thinking } from './thinking';

/** `thought` counts changes to the live thinking log, so a reader re-renders when a stage or a thought arrives. */
export type LiveRun = { stream: string; thought: number; heartbeatAt: number; now: number };
type Update<T> = T | ((previous: T) => T);

let live: LiveRun = { stream: '', thought: 0, heartbeatAt: 0, now: Date.now() };
// The same log main keeps for the saved answer (src/thinking.ts), fed from the run's events to show it while it works.
let thinking = new ThinkingLog();
const listeners = new Set<(next: LiveRun) => void>();

function patch<K extends keyof LiveRun>(key: K, update: Update<LiveRun[K]>) {
  const value = typeof update === 'function' ? (update as (previous: LiveRun[K]) => LiveRun[K])(live[key]) : update;
  if (Object.is(value, live[key])) return;
  live = { ...live, [key]: value };
  for (const listener of listeners) listener(live);
}

export const setStream = (update: Update<string>) => patch('stream', update);
/** A new run (or a cleared view) starts an empty thinking log. */
export function resetThinking(started = Date.now()) {
  thinking = new ThinkingLog(started);
  patch('thought', n => n + 1);
}
/** A run event that adds to the thinking: a stage, streamed reasoning, or the end of a model turn. */
export function think(event: { type: string; text?: string; quiet?: boolean }) {
  const changed =
    event.type === 'reasoning'
      ? thinking.reason(event.text || '')
      : event.type === 'status' || event.type === 'activity'
        ? event.quiet
          ? (thinking.turn(), false)
          : thinking.step(event.text || '')
        : false;
  if (changed) patch('thought', n => n + 1);
}
/** The live thinking to show; read it in a component that follows `thought`. */
export const liveThinking = (now = Date.now()): Thinking | undefined => thinking.result(now);
export const setHeartbeatAt = (at: number) => patch('heartbeatAt', at);
export const tickLiveClock = () => patch('now', Date.now());

/** One value from the live run; the component re-renders only when that value changes. */
export function useLiveRun<T extends string | number>(select: (run: LiveRun) => T): T {
  const [value, setValue] = useState(() => select(live));
  const selectRef = useRef(select);
  selectRef.current = select;
  useEffect(() => {
    const listener = (next: LiveRun) => setValue(selectRef.current(next));
    listeners.add(listener);
    // An update between this render and the subscription would otherwise be missed.
    listener(live);
    return () => void listeners.delete(listener);
  }, []);
  return value;
}

/** How long a working label stays before the next one replaces it. */
export const LABEL_HOLD_MS = 1500;

/**
 * The working label, changed at most once per `hold`: a tool loop moves through "preparing", "writing" and a tool stage
 * within a second, and showing each made the line blink. A stage that passes faster is skipped (the thinking panel
 * still lists it), and a label that comes back within the hold never left.
 */
export function useSteadyLabel(label: string, hold = LABEL_HOLD_MS) {
  const [shown, setShown] = useState(label);
  const since = useRef(0);
  useEffect(() => {
    if (label === shown) return;
    const show = () => {
      since.current = Date.now();
      setShown(label);
    };
    const wait = since.current + hold - Date.now();
    if (wait <= 0) return show();
    const timer = setTimeout(show, wait);
    return () => clearTimeout(timer);
  }, [label, shown, hold]);
  return shown;
}

/** The run's elapsed time, for the status bar and the working indicator. */
export function useElapsed(running: boolean, startedAt: number) {
  const now = useLiveRun(run => run.now);
  return running && startedAt ? formatElapsed(now - startedAt) : '';
}

/** The streamed text to show, and whether the saved answer already shows it (a refresh can land in between). */
export function liveAnswer(stream: string, lastMessage?: { role: string; text: string }) {
  const liveText = visibleStream(stream);
  const streamSaved =
    Boolean(liveText) &&
    lastMessage?.role === 'assistant' &&
    Boolean(lastMessage.text.trim()) &&
    liveText.endsWith(lastMessage.text.trim());
  return { liveText, streamSaved };
}

/** The tool loop's own words for its last, no-tools turn (electron/service.ts); after them the AI is already writing. */
const WRITING = new Set(['อ่านครบแล้ว กำลังเขียนคำตอบ', 'ใกล้หมดเวลา กำลังเขียนคำตอบจากที่อ่านมา']);
export const WRITE_NOW_AFTER_MS = 120_000;

/**
 * Whether the stop button first asks the AI to write its answer (`writeNow`): after two minutes, while the AI is still reading. A reading turn often
 * streams a line of its own ("กำลังตรวจเอกสาร…") before its tool requests, so streamed text alone does not mean the
 * answer is being written: tool requests in the stream, or a reading/searching status, still count as reading.
 */
export function offerWriteNow(run: { elapsedMs: number; stream: string; liveText: string; progress?: string }) {
  if (run.elapsedMs < WRITE_NOW_AFTER_MS) return false;
  const progress = run.progress || '';
  if (WRITING.has(progress)) return false;
  return !run.liveText || run.stream.includes('```step-tool') || /อ่าน|ค้น/.test(progress);
}
