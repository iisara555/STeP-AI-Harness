export const googleId = (value: unknown) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new Error('INVALID_GOOGLE_INPUT');
  return encodeURIComponent(value);
};
export const googleText = (value: unknown, max = 20000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) throw new Error('INVALID_GOOGLE_INPUT');
  return value;
};
export const googleExact = (value: any, keys: string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)))
    throw new Error('INVALID_GOOGLE_INPUT');
};

/** Bound structured Google API payloads before approval, without accepting URLs or HTTP methods as commands. */
export function googleValue(value: unknown) {
  let nodes = 0;
  const visit = (v: any, depth: number) => {
    if (++nodes > 5000 || depth > 15) throw new Error('INVALID_GOOGLE_INPUT');
    if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return;
    if (typeof v === 'string' && v.length <= 50000 && !v.includes('\0')) return;
    if (Array.isArray(v) && v.length <= 500) return v.forEach(item => visit(item, depth + 1));
    if (v && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v))) {
      for (const [key, item] of Object.entries(v)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key) || key.length > 100) throw new Error('INVALID_GOOGLE_INPUT');
        visit(item, depth + 1);
      }
      return;
    }
    throw new Error('INVALID_GOOGLE_INPUT');
  };
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value)) > 100000) throw new Error('INVALID_GOOGLE_INPUT');
  return value;
}

export function googleBatch(value: unknown, allowed: string[]) {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw new Error('INVALID_GOOGLE_INPUT');
  for (const request of value) {
    googleExact(request, allowed);
    if (Object.keys(request).length !== 1) throw new Error('INVALID_GOOGLE_INPUT');
    const payload = Object.values(request)[0];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('INVALID_GOOGLE_INPUT');
  }
  return googleValue(value);
}
import { createHash } from 'node:crypto';

export function googleScriptContentHash(content: any) {
  if (!Array.isArray(content?.files) || content.files.length > 500) throw new Error('GOOGLE_RESPONSE_INVALID');
  const files = content.files
    .map((f: any) => {
      if (typeof f.name !== 'string' || typeof f.type !== 'string' || (f.source !== undefined && typeof f.source !== 'string'))
        throw new Error('GOOGLE_RESPONSE_INVALID');
      return [f.name, f.type, f.source || ''];
    })
    .sort((a: string[], b: string[]) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}

export function googleGridValues(v: any) {
  if (
    !Array.isArray(v) ||
    !v.length ||
    v.length > 100 ||
    v.some(
      row =>
        !Array.isArray(row) ||
        !row.length ||
        row.length > 100 ||
        row.some(
          (cell: any) =>
            !(
              cell === null ||
              typeof cell === 'boolean' ||
              (typeof cell === 'number' && Number.isFinite(cell)) ||
              (typeof cell === 'string' && cell.length <= 5000)
            ),
        ),
    ) ||
    v.reduce((n, row) => n + row.length, 0) > 500
  )
    throw new Error('INVALID_GOOGLE_INPUT');
  return googleValue(v) as (string | number | boolean | null)[][];
}
export function googleRectangleValues(range: any, value: any) {
  const values = googleGridValues(value);
  const match = /^(?:(?:'(?:[^']|'')+'|[^!\[\]\x00-\x1f]{1,100})!)?([A-Z]{1,3})([1-9]\d{0,6}):([A-Z]{1,3})([1-9]\d{0,6})$/.exec(
    googleText(range, 200),
  );
  const col = (s: string) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  if (
    !match ||
    Number(match[4]) - Number(match[2]) + 1 !== values.length ||
    values.some((row: any) => row.length !== col(match[3]) - col(match[1]) + 1)
  )
    throw new Error('INVALID_GOOGLE_INPUT');
  return values;
}
