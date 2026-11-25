/** Pure line-level diff engine for comparing draft versions and AI proposals. */

export type DiffLine = {
  kind: 'context' | 'add' | 'remove';
  text: string;
  beforeLine?: number;
  afterLine?: number;
};

export type DiffHunk = {
  skippedBefore: number;
  lines: DiffLine[];
};

export type DraftDiff = {
  added: number;
  removed: number;
  changed: boolean;
  hunks: DiffHunk[];
};

const splitLines = (text: string): string[] => (text ? text.replace(/\r\n/g, '\n').split('\n') : []);

function middleDiff(aMid: string[], bMid: string[], aStart: number, bStart: number): DiffLine[] {
  const m = aMid.length;
  const n = bMid.length;
  if (m === 0 && n === 0) return [];
  if (m * n > 250_000) {
    return [
      ...aMid.map((text, idx) => ({ kind: 'remove' as const, text, beforeLine: aStart + idx + 1 })),
      ...bMid.map((text, idx) => ({ kind: 'add' as const, text, afterLine: bStart + idx + 1 })),
    ];
  }
  const cols = n + 1;
  const dp = new Int32Array((m + 1) * cols);
  for (let i = m - 1; i >= 0; i--) {
    const row = i * cols;
    const nextRow = (i + 1) * cols;
    for (let j = n - 1; j >= 0; j--) {
      if (aMid[i] === bMid[j]) dp[row + j] = dp[nextRow + j + 1] + 1;
      else dp[row + j] = dp[nextRow + j] >= dp[row + j + 1] ? dp[nextRow + j] : dp[row + j + 1];
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (aMid[i] === bMid[j]) {
      lines.push({ kind: 'context', text: aMid[i], beforeLine: aStart + i + 1, afterLine: bStart + j + 1 });
      i++;
      j++;
    } else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) {
      lines.push({ kind: 'remove', text: aMid[i], beforeLine: aStart + i + 1 });
      i++;
    } else {
      lines.push({ kind: 'add', text: bMid[j], afterLine: bStart + j + 1 });
      j++;
    }
  }
  while (i < m) {
    lines.push({ kind: 'remove', text: aMid[i], beforeLine: aStart + i + 1 });
    i++;
  }
  while (j < n) {
    lines.push({ kind: 'add', text: bMid[j], afterLine: bStart + j + 1 });
    j++;
  }
  return lines;
}

/** Computes a grouped line diff between two draft strings with surrounding unchanged context lines. */
export function computeDraftDiff(before: string, after: string, contextLines = 2): DraftDiff {
  const a = splitLines(before);
  const b = splitLines(after);
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) {
    suffix++;
  }
  const aMid = a.slice(prefix, a.length - suffix);
  const bMid = b.slice(prefix, b.length - suffix);
  const mid = middleDiff(aMid, bMid, prefix, prefix);

  const all: DiffLine[] = [
    ...a.slice(0, prefix).map((text, i) => ({ kind: 'context' as const, text, beforeLine: i + 1, afterLine: i + 1 })),
    ...mid,
    ...a
      .slice(a.length - suffix)
      .map((text, i) => ({ kind: 'context' as const, text, beforeLine: a.length - suffix + i + 1, afterLine: b.length - suffix + i + 1 })),
  ];

  let added = 0;
  let removed = 0;
  const changeIndices: number[] = [];
  for (let idx = 0; idx < all.length; idx++) {
    const kind = all[idx].kind;
    if (kind === 'add') {
      added++;
      changeIndices.push(idx);
    } else if (kind === 'remove') {
      removed++;
      changeIndices.push(idx);
    }
  }
  if (!changeIndices.length) return { added: 0, removed: 0, changed: false, hunks: [] };

  const ctx = Math.max(0, Math.floor(contextLines));
  const ranges: [number, number][] = [];
  for (const idx of changeIndices) {
    const start = Math.max(0, idx - ctx);
    const end = Math.min(all.length - 1, idx + ctx);
    const prev = ranges.at(-1);
    if (prev && start <= prev[1] + 1) prev[1] = Math.max(prev[1], end);
    else ranges.push([start, end]);
  }

  let cursor = 0;
  const hunks: DiffHunk[] = ranges.map(([start, end]) => {
    const skippedBefore = start - cursor;
    cursor = end + 1;
    return { skippedBefore, lines: all.slice(start, end + 1) };
  });

  return { added, removed, changed: true, hunks };
}
