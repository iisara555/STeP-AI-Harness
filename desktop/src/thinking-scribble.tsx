// Hand-drawn pencil marks that move while the AI works, one per kind of work, so the line under the answer shows what
// the AI is doing without more words: small loops written in turn while it thinks, dots joined by a line while it reads
// a Skill or document, a stroke inching along while it searches or uses a tool, and a cursive line while it writes.
// Plain SVG/CSS: no images, filters, timers or animation library. The status line beside it supplies the accessible
// progress text.
import type { ReactNode } from 'react';
import type { WaitingKind } from './waiting-kind';

export { waitingKind, type WaitingKind } from './waiting-kind';

// Every path is measured as 100 (pathLength) so one set of dash timings fits all of them.
const ink = (className: string, d: string) => <path className={className} pathLength="100" d={d} />;
const MARKS: Record<WaitingKind, ReactNode> = {
  think: (
    <>
      {ink(
        'scribble-ink scribble-dot',
        'M11.8 56.7 L10.7 55.3 L9.9 53.7 L9.5 51.9 L9.6 50.0 L10.3 48.3 L11.4 46.7 L12.8 45.6 L14.4 44.7 L16.1 44.3 L17.8 44.1 L19.4 44.1 L20.9 44.3 L22.4 44.6 L23.8 45.0 L25.3 45.6 L26.7 46.5 L28.0 47.5 L29.1 48.9 L29.8 50.5 L30.2 52.2 L30.0 54.0 L29.4 55.7 L28.3 57.2 L26.9 58.3 L25.3 59.1 L23.7 59.5 L22.0 59.6 L20.5 59.6 L19.1 59.4 L17.6 59.1 L16.2 58.7 L14.9 58.1 L13.5 57.3 L12.2 56.3 L11.2 54.9 L10.4 53.4 L10.1 51.7 L10.3 50.0 L11.0 48.3 L12.0 46.9',
      )}
      {ink(
        'scribble-ink scribble-dot',
        'M44.7 56.9 L43.6 55.7 L42.6 54.5 L41.7 53.2 L41.0 51.7 L40.5 50.1 L40.2 48.4 L40.3 46.6 L40.8 44.8 L41.8 43.1 L43.3 41.7 L45.0 40.8 L47.0 40.3 L48.9 40.3 L50.8 40.7 L52.5 41.4 L53.9 42.3 L55.2 43.4 L56.2 44.5 L57.1 45.7 L58.0 47.0 L58.7 48.4 L59.2 50.0 L59.5 51.6 L59.4 53.4 L58.9 55.2 L57.9 56.8 L56.4 58.1 L54.7 59.0 L52.8 59.4 L50.9 59.4 L49.1 59.0 L47.5 58.2 L46.2 57.3 L45.0 56.3 L44.0 55.2 L43.1 54.0 L42.3 52.8 L41.6 51.5 L41.1 50.0 L40.8 48.3',
      )}
      {ink(
        'scribble-ink scribble-dot',
        'M71.7 53.9 L71.6 52.4 L71.7 51.0 L72.0 49.5 L72.4 48.0 L73.0 46.6 L73.9 45.1 L75.2 43.9 L76.7 42.9 L78.5 42.2 L80.4 42.1 L82.3 42.4 L84.1 43.2 L85.5 44.3 L86.6 45.7 L87.4 47.2 L87.8 48.7 L88.0 50.2 L88.0 51.6 L87.9 53.1 L87.7 54.5 L87.3 55.9 L86.7 57.3 L85.8 58.7 L84.6 59.9 L83.1 60.9 L81.4 61.5 L79.5 61.6 L77.7 61.3 L76.0 60.5 L74.6 59.4 L73.6 58.0 L72.9 56.6 L72.5 55.1 L72.3 53.7 L72.3 52.3 L72.4 50.9 L72.6 49.6 L73.0 48.2 L73.6 46.8 L74.4 45.5',
      )}
    </>
  ),
  read: (
    <>
      {[
        [20, 70],
        [36, 30],
        [62, 60],
        [82, 26],
      ].map(([x, y]) => (
        <path key={x} className="scribble-pt" d={`M${x} ${y} l0.1 0`} />
      ))}
      {ink('scribble-link', 'M20 70 C26 52 30 36 36 30 C44 24 52 58 62 60 C72 62 76 36 82 26')}
    </>
  ),
  search: (
    <>
      {ink('scribble-trail', 'M8 58 C22 38 34 70 50 52 C64 36 76 66 92 46')}
      {ink('scribble-ink scribble-worm', 'M8 58 C22 38 34 70 50 52 C64 36 76 66 92 46')}
    </>
  ),
  write: (
    <>
      {ink('scribble-trail', 'M8 66 C18 42 30 24 26 46 C22 68 38 72 44 50 C50 28 62 24 58 46 C54 68 70 72 76 50 C82 30 92 34 93 50')}
      {ink(
        'scribble-ink scribble-pen',
        'M8 66 C18 42 30 24 26 46 C22 68 38 72 44 50 C50 28 62 24 58 46 C54 68 70 72 76 50 C82 30 92 34 93 50',
      )}
    </>
  ),
};

export function ThinkingScribble({ size = 18, label, kind = 'think' }: { size?: number; label?: string; kind?: WaitingKind }) {
  return (
    <span
      className="thinking-scribble"
      data-kind={kind}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* Keyed by kind: a new mark fades in instead of jumping mid-stroke. */}
      <svg
        key={kind}
        viewBox="0 0 100 100"
        width={size}
        height={size}
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g className="scribble-threads">{MARKS[kind]}</g>
      </svg>
    </span>
  );
}
