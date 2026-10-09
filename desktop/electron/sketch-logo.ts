// The loading window's logo: the STeP symbol as a flip-book of hand-made marks, like an abstract-shapes GIF. Every
// tenth of a second the three bars are drawn a different way (solid, outlines, hatching, dots, waves, a naive looping
// line, a scribble, brush strokes), in one colour. Pure SVG and CSS, generated here so the page needs no script.

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
/** How long each frame stays on screen, as in a 10 fps GIF. */
const FRAME_SECONDS = 0.1;

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
/** One version of the whole line, from its own seed, so each version wobbles a little differently. */
function line(seed: number) {
  const rand = random(seed);
  const traces = BARS.map(bar => trace(bar, rand));
  // The pen keeps going between bars: from where one trace ends it loops down to the start of the next.
  const points = [...traces[0]];
  for (let i = 1; i < traces.length; i++) {
    const from = traces[i - 1][traces[i - 1].length - 1],
      to = traces[i][0];
    points.push(...curl(lerp(from, to, 0.5), rand, 1.3), ...traces[i]);
  }
  return smooth(points);
}

/** Each frame's drawing area: the symbol plus a margin, side by side in one strip. */
const CELL = { w: 100, h: 62, x: 10.66, y: 9.68 };
const poly = (bar: Point[]) => bar.map(([x, y]) => `${fixed(x)},${fixed(y)}`).join(' ');
const bars = (attrs: string) => BARS.map(bar => `<polygon points="${poly(bar)}" ${attrs}/>`).join('');
/** Lines of a pattern clipped to the bars: `clip` is set per frame so each frame's clip path has its own id. */
const clipped = (id: string, inner: string) => `<clipPath id="${id}">${bars('')}</clipPath><g clip-path="url(#${id})">${inner}</g>`;
const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
};

/**
 * The frames, in order: each draws the STeP symbol a different way (solid, outlines, hatching, dots, waves, the naive
 * line, a scribble, brush strokes), like a flip-book of hand-made marks. One colour throughout.
 */
function frames(ink: string): string[] {
  const rand = random(2569);
  const stroke = (w: number, extra = '') =>
    `fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}`;
  const wave = (y: number, amp: number, len: number) => {
    let d = `M-4 ${y}`;
    for (let x = -4; x < 84; x += len) d += `q${len / 4} ${-amp} ${len / 2} 0t${len / 2} 0`;
    return d;
  };
  const scribble = (bar: Point[], loops: number) => {
    const [tl, tr, br, bl] = bar;
    const points: Point[] = [];
    for (let i = 0; i < loops; i++) {
      const t = rand(),
        u = rand();
      points.push(lerp(lerp(tl, tr, t), lerp(bl, br, t), u));
    }
    return smooth(points);
  };
  const brush = (bar: Point[]) => {
    const [tl, tr, br, bl] = bar;
    const mid = (t: number) => lerp(lerp(tl, bl, 0.5), lerp(tr, br, 0.5), t);
    const pts = range(0, 1, 0.1).map(t => {
      const p = mid(t);
      return [p[0], p[1] + (rand() - 0.5) * 2] as Point;
    });
    return smooth(pts);
  };
  return [
    // A heavy zigzag through the three bars, like the reference's first frame.
    `<path d="${smooth([
      [36, 1],
      [76, 2],
      [20, 20],
      [74, 21],
      [6, 37],
      [76, 40],
    ])}" ${stroke(4.2)}/>`,
    bars(`fill="${ink}"`),
    bars(stroke(1.6)),
    bars(stroke(1.2, 'stroke-dasharray="2.2 2.2"')),
    clipped(
      'h',
      range(-50, 90, 3.2)
        .map(x => `<path d="M${x} 44L${x + 28} -2" ${stroke(1.4)}/>`)
        .join(''),
    ),
    clipped(
      'st',
      range(-1, 44, 2.4)
        .map(y => `<path d="M-4 ${y}H84" ${stroke(1.1)}/>`)
        .join(''),
    ),
    `<path d="${line(2569)}" ${stroke(1.6)}/>`,
    clipped(
      'd',
      range(0, 44, 2.6)
        .flatMap((y, row) => range(row % 2 ? 1.3 : 0, 82, 2.6).map(x => `<circle cx="${x}" cy="${y}" r=".75" fill="${ink}"/>`))
        .join(''),
    ),
    clipped(
      'w',
      range(-1, 44, 3)
        .map(y => `<path d="${wave(y, 1.6, 6)}" ${stroke(1)}/>`)
        .join(''),
    ),
    BARS.map(bar => `<path d="${scribble(bar, 26)}" ${stroke(0.7)}/>`).join(''),
    BARS.map((bar, i) => `<polygon points="${poly(bar)}" ${i ? stroke(1.4) : `fill="${ink}"`}/>`).join(''),
    BARS.map(bar => `<path d="${brush(bar)}" ${stroke(6.4)}/>`).join(''),
    clipped(
      'g',
      [
        ...range(-2, 82, 6).map(x => `<path d="M${x} -2V46" ${stroke(0.9)}/>`),
        ...range(-1, 44, 4).map(y => `<path d="M-4 ${y}H84" ${stroke(0.9)}/>`),
      ].join(''),
    ) + bars(stroke(1)),
    clipped(
      'c',
      range(-4, 84, 4)
        .flatMap((x, i) =>
          range(-2, 44, 4)
            .filter((_, j) => (i + j) % 2 === 0)
            .map(y => `<rect x="${x}" y="${y}" width="4" height="4" fill="${ink}"/>`),
        )
        .join(''),
    ),
    BARS.map(
      bar =>
        `<polygon points="${poly(bar)}" ${stroke(1)} transform="translate(${fixed((rand() - 0.5) * 7)} ${fixed((rand() - 0.5) * 4)})"/>`,
    ).join('') + bars(stroke(1)),
    `<circle cx="39" cy="21" r="1.6" fill="${ink}"/>`,
  ];
}

/** The STeP symbol as a flip-book: a new hand-made treatment every tenth of a second, in one colour. */
export function sketchLogo(dark: boolean) {
  const ink = dark ? '#f4f1ea' : '#231f20';
  const list = frames(ink).map(
    (art, i) =>
      // Clip ids must be unique across frames, and each frame sits in its own cell of the strip.
      `<g transform="translate(${i * CELL.w + CELL.x} ${CELL.y})">${art.replace(/id="(\w+)"/g, `id="$1${i}"`).replace(/url\(#(\w+)\)/g, `url(#$1${i})`)}</g>`,
  );
  const count = list.length;
  // A sprite strip moved one cell per frame (steps), so exactly one frame shows and nothing depends on timing.
  const css = `.flip{animation:flip ${fixed(count * FRAME_SECONDS)}s steps(${count}) infinite}
@keyframes flip{to{transform:translateX(${-count * CELL.w}px)}}
@media (prefers-reduced-motion:reduce){.flip{animation:none;transform:translateX(${-CELL.w * 1}px)}}`;
  const svg = `<svg class="sketch" role="img" aria-label="STeP Desktop" viewBox="0 0 ${CELL.w} ${CELL.h}" overflow="hidden"><defs><filter id="grain" x="-2%" y="-5%" width="104%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="1.3"/></filter></defs><g filter="url(#grain)"><g class="flip">${list.join('')}</g></g></svg>`;
  return { css, svg };
}
