// The loading window's logo: the STeP symbol drawn as a loose pencil sketch, bar by bar, then rubbed out and drawn
// again while the app loads. Pure SVG and CSS, generated here so the page needs no script.

type Point = [number, number];
/** The symbol's three bars as top-left, top-right, bottom-right, bottom-left (src/assets/step-symbol-colour.svg). */
const BARS: Point[][] = [
  [
    [33.99, 0],
    [78.67, 0],
    [73.24, 6.82],
    [28.55, 6.82],
  ],
  [
    [20.4, 17.05],
    [78.67, 17.05],
    [72.56, 24.72],
    [14.28, 24.72],
  ],
  [
    [6.83, 34.1],
    [78.65, 34.1],
    [71.85, 42.63],
    [0, 42.63],
  ],
];
/** Seconds for one draw, hold and rub-out. */
const CYCLE = 3.6;

/** A small seeded generator, so the sketch looks the same on every launch. */
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const fixed = (n: number) => Math.round(n * 100) / 100;

/** Three hurried passes round the bar: each edge overshoots its corners and bows, like a quick pencil line. */
function outline(bar: Point[], rand: () => number) {
  const jitter = (s: number) => (rand() - 0.5) * s;
  let d = '';
  for (let pass = 0; pass < 3; pass++)
    for (let i = 0; i < 4; i++) {
      const a = bar[i],
        b = bar[(i + 1) % 4];
      const over = 0.6 + rand() * 2.2;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const start = lerp(a, b, -over / length),
        end = lerp(a, b, 1 + over / length);
      const mid = lerp(a, b, 0.5);
      d += `M${fixed(start[0] + jitter(1.1))} ${fixed(start[1] + jitter(1.1))}Q${fixed(mid[0] + jitter(2.2))} ${fixed(
        mid[1] + jitter(2.2),
      )} ${fixed(end[0] + jitter(1.1))} ${fixed(end[1] + jitter(1.1))}`;
    }
  return d;
}

/**
 * A loose zigzag that shades the bar, running past its edges with uneven spacing. The first layer goes left to right
 * along the bar's own slant; the second crosses it at a steeper angle, right to left.
 */
function shading(bar: Point[], rand: () => number, cross: boolean) {
  const [tl, tr, br, bl] = bar;
  const points: Point[] = [];
  const lean = cross ? -0.06 : 0;
  for (let t = cross ? 1.02 : -0.02, top = true; cross ? t >= -0.02 : t <= 1.02; top = !top) {
    const at = Math.min(1.04, Math.max(-0.04, t + (top ? lean : -lean)));
    const edge = top ? lerp(tl, tr, at) : lerp(bl, br, at);
    const reach = (rand() - 0.25) * 2;
    points.push([edge[0] + (rand() - 0.5) * 1.6, edge[1] + (top ? -reach : reach)]);
    t += (cross ? -1 : 1) * (0.014 + rand() * (cross ? 0.05 : 0.026));
  }
  return 'M' + points.map(([x, y]) => `${fixed(x)} ${fixed(y)}`).join('L');
}

/** The animated sketch: yellow pencil for the top bar, graphite (or chalk-white in the dark theme) for the others. */
export function sketchLogo(dark: boolean) {
  const rand = random(2569);
  const graphite = dark ? '#f4f1ea' : '#2b2627';
  const strokes: { d: string; color: string; width: number; opacity: number; from: number; to: number }[] = [];
  BARS.forEach((bar, i) => {
    const color = i ? graphite : dark ? '#ffc609' : '#f2b705';
    const start = i * 0.21;
    strokes.push({ d: outline(bar, rand), color, width: 0.4, opacity: 0.9, from: start, to: start + 0.1 });
    strokes.push({ d: shading(bar, rand, false), color, width: 0.48, opacity: 0.8, from: start + 0.05, to: start + 0.2 });
    strokes.push({ d: shading(bar, rand, true), color, width: 0.34, opacity: 0.55, from: start + 0.13, to: start + 0.27 });
  });
  const keyframes = strokes
    .map(
      (s, i) =>
        `@keyframes s${i}{0%,${Math.round(s.from * 100)}%{stroke-dashoffset:1}${Math.round(s.to * 100)}%,100%{stroke-dashoffset:0}}` +
        `.s${i}{animation:s${i} ${CYCLE}s linear infinite,rub ${CYCLE}s ease-in infinite}`,
    )
    .join('');
  const css = `${keyframes}@keyframes rub{0%,86%{opacity:1}97%,100%{opacity:0}}
.sketch path{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1}
@media (prefers-reduced-motion:reduce){.sketch path{animation:none!important;stroke-dashoffset:0;opacity:1}}`;
  const paths = strokes
    .map(
      (s, i) =>
        `<path class="s${i}" pathLength="1" d="${s.d}" stroke="${s.color}" stroke-width="${s.width}" stroke-opacity="${s.opacity}"/>`,
    )
    .join('');
  // A little grain on the line edges, so it reads as pencil on paper rather than a vector stroke.
  const svg = `<svg class="sketch" role="img" aria-label="STeP Desktop" viewBox="-3 -3 84.67 48.63"><defs><filter id="pencil" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="0.55"/></filter></defs><g filter="url(#pencil)">${paths}</g></svg>`;
  return { css, svg };
}
