// The waiting motion while the AI works: ink-like drops that pull away from a body and melt back in ("gooey"
// metaballs). Plain SVG: the shapes are blurred, then a colour matrix sharpens the blur's alpha into one edge, so
// drops that come close join with a neck. No images, no library; it takes the text colour, so it suits both themes.
import { useId } from 'react';

export function GooLoader({ size = 36, label }: { size?: number; label?: string }) {
  const filter = 'goo-' + useId().replace(/:/g, '');
  return (
    <span className="goo" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {/* The drops travel left of the body and the head rises above it; the frame holds just that space. */}
      <svg viewBox="12 2 62 62" width={size} height={size}>
        <defs>
          <filter id={filter} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.2" />
            <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
          </filter>
        </defs>
        <g filter={`url(#${filter})`}>
          <ellipse className="goo-body" cx="50" cy="34" rx="15" ry="17" />
          <circle className="goo-a" cx="53" cy="27" r="7.5" />
          <circle className="goo-b" cx="44" cy="31" r="6" />
          <circle className="goo-c" cx="45" cy="38" r="6.5" />
        </g>
      </svg>
    </span>
  );
}
