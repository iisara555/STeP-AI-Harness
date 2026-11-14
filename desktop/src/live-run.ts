// What changes many times a second while a task runs: the streamed answer, the reasoning, the last heartbeat and the
// one-second clock. It lives outside the workspace state so a streamed token re-renders only the parts that show it
// (the conversation and the status bar), not the sidebar, side panel and dialogs.
//
// Readers subscribe with ordinary React state rather than useSyncExternalStore: a store update then lands in the same
// render as the workspace updates made by the same app event (for example "run finished" and "clear the stream"), so
// no frame shows one without the other.
import { useEffect, useRef, useState } from 'react';
import { visibleStream } from './tools';
import { formatElapsed } from './ui';

export type LiveRun = { stream: string; reasoning: string; heartbeatAt: number; now: number };
type Update<T> = T | ((previous: T) => T);

let live: LiveRun = { stream: '', reasoning: '', heartbeatAt: 0, now: Date.now() };
const listeners = new Set<(next: LiveRun) => void>();

function patch<K extends keyof LiveRun>(key: K, update: Update<LiveRun[K]>) {
  const value = typeof update === 'function' ? (update as (previous: LiveRun[K]) => LiveRun[K])(live[key]) : update;
  if (Object.is(value, live[key])) return;
  live = { ...live, [key]: value };
  for (const listener of listeners) listener(live);
}

export const setStream = (update: Update<string>) => patch('stream', update);
export const setReasoning = (update: Update<string>) => patch('reasoning', update);
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
