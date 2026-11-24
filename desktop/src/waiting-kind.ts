// Which waiting mark (src/thinking-scribble.tsx) a status line calls for.
export type WaitingKind = 'think' | 'read' | 'search' | 'write';

/**
 * The kind of work a status line names, in Thai or English. It follows the steady working label (live-run.ts), so the
 * mark changes no faster than the words beside it.
 */
export function waitingKind(label: string): WaitingKind {
  if (/เขียน|ร่าง|writing|drafting/i.test(label)) return 'write';
  if (/เตรียม|รอ AI|preparing|waiting/i.test(label)) return 'think';
  if (/ค้น|เว็บ|เครื่องมือ|search|web|tool/i.test(label)) return 'search';
  if (/อ่าน|เอกสาร|Skill|reading|document/i.test(label)) return 'read';
  return 'think';
}
