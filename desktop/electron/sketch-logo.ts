// The loading window's logo: the STeP symbol drawn as one loose, looping line in a naive hand-drawn style, as if the
// pen never leaves the paper. It traces each bar a little more than once with small curls, loops down to the next bar,
// then fades and draws again while the app loads. Pure SVG and CSS, generated here so the page needs no script.

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
/** Seconds for one draw, hold and fade. */
const CYCLE = 4.2;
/** Share of the cycle spent drawing; the rest holds the finished logo, then fades it. */
const DRAWING = 0.62;

/** A small seeded generator, so the drawing looks the same on every launch. */
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const fixed = (n: number) => Math.round(n * 100) / 100;
const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** A loop, the way a pen curls on itself when drawing fast. */
function curl(at: Point, rand: () => number, size = 1): Point[] {
  const r = (1.5 + rand() * 1.2) * size;
  const start = rand() * Math.PI * 2,
    turn = rand() < 0.5 ? 1 : -1;
  return [0.2, 0.4, 0.6, 0.8, 1, 1.15].map(f => {
    const a = start + turn * f * Math.PI * 2;
    return [at[0] + Math.cos(a) * r * (1 + f * 0.25), at[1] + Math.sin(a) * r * 0.9] as Point;
  });
}

/**
 * Wobbly points round a bar: from its top-right corner, clockwise about one and a quarter times, so the line ends on
 * the right side, near where the next bar begins. One loose scribble with a loop crosses the inside of the bar.
 */
function trace(bar: Point[], rand: () => number): Point[] {
  const order = [bar[1], bar[2], bar[3], bar[0]];
  const points: Point[] = [];
  const sides = 5;
  const loopAt = new Set([1 + Math.floor(rand() * 2), 3 + Math.floor(rand() * 2)]);
  for (let side = 0; side < sides; side++) {
    const a = order[side % 4],
      b = order[(side + 1) % 4];
    const steps = Math.max(1, Math.round(distance(a, b) / 7));
    const wander = 0.6 + (side / 4) * 0.6;
    for (let i = 0; i < steps; i++) {
      const p = lerp(a, b, i / steps);
      points.push([p[0] + (rand() - 0.5) * wander * 2, p[1] + (rand() - 0.5) * wander * 2]);
    }
    if (loopAt.has(side)) points.push(...curl(lerp(a, b, 0.3 + rand() * 0.4), rand));
    if (side === 2) {
      // The scribble: from the left end, wander across the middle of the bar with an S-shaped loop, then return.
      const [tl, tr, br, bl] = bar;
      const middle = (t: number) => lerp(lerp(tl, bl, 0.5), lerp(tr, br, 0.5), t);
      const across = [0.2, 0.4, 0.62].map(t => middle(t + (rand() - 0.5) * 0.08));
      points.push(across[0], ...curl(across[1], rand, 0.8), across[2], ...curl(middle(0.45), rand, 0.6), middle(0.08));
    }
  }
  points.push(order[1]);
  return points;
}

/** A smooth path through the points (Catmull-Rom as cubic Béziers), so the line flows instead of zigzagging. */
function smooth(points: Point[]) {
  let d = `M${fixed(points[0][0])} ${fixed(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)],
      p1 = points[i],
      p2 = points[i + 1],
      p3 = points[Math.min(points.length - 1, i + 2)];
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${fixed(c1[0])} ${fixed(c1[1])} ${fixed(c2[0])} ${fixed(c2[1])} ${fixed(p2[0])} ${fixed(p2[1])}`;
  }
  return d;
}
const length = (points: Point[]) => points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);

/** The animated drawing: yellow for the top bar, then one dark line (light in the dark theme) for the rest. */
export function sketchLogo(dark: boolean) {
  const rand = random(2569);
  const ink = dark ? '#f4f1ea' : '#2b2627';
  const traces = BARS.map(bar => trace(bar, rand));
  // The pen keeps going between bars: from where one trace ends it loops down to the start of the next.
  const segments: { points: Point[]; color: string }[] = [{ points: traces[0], color: dark ? '#ffc609' : '#f2b705' }];
  for (let i = 1; i < traces.length; i++) {
    const from = traces[i - 1][traces[i - 1].length - 1],
      to = traces[i][0];
    const bridge: Point[] = [from, ...curl(lerp(from, to, 0.5), rand, 1.3), to];
    segments.push({ points: [...bridge, ...traces[i].slice(1)], color: ink });
  }
  const total = segments.reduce((sum, s) => sum + length(s.points), 0);
  let start = 0;
  const strokes = segments.map(s => {
    const share = (length(s.points) / total) * DRAWING;
    const stroke = { d: smooth(s.points), color: s.color, from: start, to: start + share };
    start += share;
    return stroke;
  });
  const percent = (n: number) => Math.round(n * 1000) / 10;
  const css =
    strokes
      .map(
        (s, i) =>
          `@keyframes s${i}{0%,${percent(s.from)}%{stroke-dashoffset:1}${percent(s.to)}%,100%{stroke-dashoffset:0}}` +
          `.s${i}{animation:s${i} ${CYCLE}s linear infinite,fade ${CYCLE}s ease-in infinite}`,
      )
      .join('') +
    `@keyframes fade{0%,88%{opacity:1}98%,100%{opacity:0}}
.sketch path{fill:none;stroke-width:.45;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 2;stroke-dashoffset:1}
@media (prefers-reduced-motion:reduce){.sketch path{animation:none!important;stroke-dashoffset:0;opacity:1}}`;
  const paths = strokes.map((s, i) => `<path class="s${i}" pathLength="1" d="${s.d}" stroke="${s.color}"/>`).join('');
  // A little grain on the line, so it reads as a hand-drawn line rather than a vector stroke.
  const svg = `<svg class="sketch" role="img" aria-label="STeP Desktop" viewBox="-5 -5 88.67 52.63"><defs><filter id="pencil" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="0.45"/></filter></defs><g filter="url(#pencil)">${paths}</g></svg>`;
  return { css, svg };
}
