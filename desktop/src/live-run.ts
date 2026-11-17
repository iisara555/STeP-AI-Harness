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
