// Original hand-drawn loops, traced at different speeds while the AI works. Plain SVG/CSS: no images,
// filters, timers or animation library. The surrounding status line supplies the accessible progress text.
export function ThinkingScribble({ size = 36, label }: { size?: number; label?: string }) {
  return (
    <span className="thinking-scribble" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g className="scribble-threads">
          <path
            className="scribble-stroke scribble-a"
            pathLength="100"
            d="M18 65 C6 28 65 4 76 18 C99 43 25 91 20 68 C10 41 93 15 87 50 C82 80 25 92 15 73 C7 48 69 27 74 44 C83 70 38 98 30 84 C20 71 61 23 53 14 C41 7 20 62 44 83 C63 103 98 62 79 52 C60 41 14 49 18 65"
          />
          <path
            className="scribble-stroke scribble-b"
            pathLength="100"
            d="M33 15 C73 3 95 74 67 87 C38 100 8 44 23 24 C35 7 52 59 82 67 C98 79 26 82 19 59 C11 34 83 18 70 43 C61 68 35 82 28 65 C19 38 78 4 76 31 C74 55 20 93 16 69 C13 48 70 65 86 45 C96 31 49 80 42 84"
          />
          <path
            className="scribble-stroke scribble-c"
            pathLength="100"
            d="M17 42 C48 61 89 84 72 49 C57 20 39 79 52 74 C74 68 48 3 36 28 C26 47 81 75 75 58 C67 42 19 55 35 66 C54 82 91 29 63 31 C36 33 33 89 48 88 C62 87 47 45 28 33"
          />
        </g>
      </svg>
    </span>
  );
}
