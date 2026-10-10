import { opendir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
export type SearchMatch = { path: string; line?: number; text?: string };
export function searchOptions(args: Record<string, unknown>) {
  const target = args.target ?? 'content';
  const pattern = args.pattern;
  if (
    !['content', 'files'].includes(String(target)) ||
    typeof pattern !== 'string' ||
    !pattern ||
    pattern.length > 256 ||
    pattern.includes('\0')
  )
    throw new Error('INVALID_INPUT');
  if (args.regex !== undefined && typeof args.regex !== 'boolean') throw new Error('INVALID_INPUT');
  const limits: Record<string, number> = {};
  for (const [key, max] of [
    ['maxFiles', 1000],
    ['maxBytes', 4000000],
    ['maxResults', 500],
  ] as const) {
    const value = args[key] ?? (key === 'maxResults' ? 100 : max);
    if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > max) throw new Error('INVALID_INPUT');
    limits[key] = Number(value);
  }
  const glob = args.glob;
  if (glob !== undefined && typeof glob !== 'string') throw new Error('INVALID_INPUT');
  for (const value of [glob, target === 'files' ? pattern : undefined]) {
    if (
      value !== undefined &&
      (!value ||
        value.length > 256 ||
        value.startsWith('/') ||
        value.includes('\\') ||
        value.split('/').includes('..') ||
        /[\x00-\x1f\[\]{}()]/.test(value))
    )
      throw new Error('INVALID_INPUT');
  }
  let regex: RegExp | undefined;
  if (args.regex) {
    // Fixed-width expressions only: no repetition, groups, alternation, lookaround or backreferences.
    // This deliberately small subset has bounded linear work, unlike arbitrary JS regex.
    if (target !== 'content' || /[*+?{}()|]/.test(pattern) || /\\[^\\.\[\]^$dws-]/.test(pattern)) throw new Error('INVALID_INPUT');
    try {
      regex = new RegExp(pattern, 'u');
    } catch {
      throw new Error('INVALID_INPUT');
    }
  }
  const cursor = args.cursor;
  if (cursor !== undefined && (typeof cursor !== 'string' || !/^[a-f0-9]{64}:[0-9]{1,5}$/.test(cursor))) throw new Error('INVALID_INPUT');
  return { target, pattern, glob, regex, cursor, ...limits } as {
    target: unknown;
    pattern: string;
    glob?: string;
    regex?: RegExp;
    cursor?: string;
    maxFiles: number;
    maxBytes: number;
    maxResults: number;
  };
}
// Glob matching uses dynamic programming, not backtracking regex. * and ? stay in a segment; ** spans segments.
export function globMatch(pattern: string, path: string): boolean {
  const matchSegment = (p: string, s: string) => {
    let row = Array<boolean>(s.length + 1).fill(false);
    row[0] = true;
    for (const char of p) {
      const next = Array<boolean>(s.length + 1).fill(false);
      next[0] = char === '*' && row[0];
      for (let i = 1; i <= s.length; i++)
        next[i] = char === '*' ? next[i - 1] || row[i] : row[i - 1] && (char === '?' || char === s[i - 1]);
      row = next;
    }
    return row[s.length];
  };
  const parts = pattern.split('/'),
    names = path.split('/');
  let row = Array<boolean>(names.length + 1).fill(false);
  row[0] = true;
  for (const part of parts) {
    const next = Array<boolean>(names.length + 1).fill(false);
    next[0] = part === '**' && row[0];
    for (let i = 1; i <= names.length; i++)
      next[i] = part === '**' ? next[i - 1] || row[i] : row[i - 1] && matchSegment(part, names[i - 1]);
    row = next;
  }
  return row[names.length];
}
export async function searchWorkspace(
  root: string,
  input: string,
  args: Record<string, unknown>,
  access: {
    path: (path: string) => Promise<string>;
    bytes: (path: string, limit: number) => Promise<Buffer>;
    review: (text: string) => string;
    check: () => Promise<void>;
  },
) {
  const options = searchOptions(args),
    directory = await access.path(input);
  const entries: { path: string; file: boolean }[] = [];
  let visited = 0,
    truncated = false;
  const visit = async (folder: string, depth: number) => {
    await access.check();
    const children: { name: string; file: boolean; directory: boolean }[] = [];
    const dir = await opendir(await access.path(folder));
    for await (const child of dir) {
      if (++visited > 5000) {
        truncated = true;
        break;
      }
      if (!child.isSymbolicLink() && !['node_modules', 'release'].includes(child.name))
        children.push({ name: child.name, file: child.isFile(), directory: child.isDirectory() });
    }
    children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const child of children) {
      const full = resolve(folder, child.name);
      try {
        await access.path(full);
      } catch (e) {
        if (['INVALID_PATH', 'PATH_RULE_DENIED', 'ENOENT', 'EACCES'].includes((e as NodeJS.ErrnoException).code || (e as Error).message))
          continue;
        throw e;
      }
      if (child.directory) {
        if (depth >= 32) truncated = true;
        else if (visited <= 5000) await visit(full, depth + 1);
      } else if (child.file) entries.push({ path: full, file: true });
    }
  };
  await visit(directory, 0);
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256').update(
    JSON.stringify({ root, directory, ...options, regex: Boolean(options.regex), cursor: undefined }),
  );
  const matches: SearchMatch[] = [];
  let scannedFiles = 0,
    scannedBytes = 0,
    skippedFiles = 0,
    withheldFiles = 0;
  for (const entry of entries) {
    await access.check();
    const path = relative(root, entry.path).split(sep).join('/');
    hash.update(path);
    if (options.glob && !globMatch(options.glob, path)) continue;
    if (scannedFiles >= options.maxFiles || matches.length >= 5000) {
      truncated = true;
      break;
    }
    scannedFiles++;
    await access.path(entry.path);
    if (options.target === 'files') {
      if (globMatch(options.pattern, path)) matches.push({ path });
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = await access.bytes(entry.path, Math.min(200000, options.maxBytes - scannedBytes));
    } catch (e) {
      if ((e as Error).message === 'FILE_LIMIT') {
        skippedFiles++;
        if (options.maxBytes - scannedBytes < 200000) truncated = true;
        continue;
      }
      throw e;
    }
    scannedBytes += bytes.length;
    hash.update(bytes);
    const text = bytes.toString('utf8');
    if (bytes.includes(0) || !Buffer.from(text).equals(bytes)) {
      skippedFiles++;
      continue;
    }
    // Review the complete bounded file before matching; masking preserves original line numbers when possible.
    // A file the privacy review withholds (e.g. an unmaskable credential) is skipped and counted, never returned;
    // one such file must not disable search of the rest of the workspace. Every other error stays fatal.
    let safe: string;
    try {
      safe = access.review(text);
    } catch (e) {
      if ((e as Error).message !== 'PRIVACY_REVIEW_REQUIRED') throw e;
      withheldFiles++;
      continue;
    }
    if (safe.split('\n').length !== text.split('\n').length) {
      skippedFiles++;
      continue;
    }
    const lines = safe.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (options.regex ? options.regex.test(lines[i]) : lines[i].includes(options.pattern)) {
        matches.push({ path, line: i + 1, text: lines[i].slice(0, 4000) });
        if (matches.length >= 5000) {
          truncated = true;
          break;
        }
      }
    }
  }
  hash.update(JSON.stringify({ matches, truncated, scannedFiles, scannedBytes, skippedFiles, withheldFiles }));
  const fingerprint = hash.digest('hex'),
    offset = options.cursor ? Number(options.cursor.split(':')[1]) : 0;
  if (options.cursor && (options.cursor.split(':')[0] !== fingerprint || offset > matches.length)) throw new Error('SEARCH_CHANGED');
  await access.check();
  let end = offset,
    pageCharacters = 0;
  while (end < matches.length && end < offset + options.maxResults) {
    const size = JSON.stringify(matches[end]).length + 1;
    if (pageCharacters + size > 600000) break;
    pageCharacters += size;
    end++;
  }
  return {
    matches: matches.slice(offset, end),
    offset,
    total: matches.length,
    truncated,
    scannedFiles,
    scannedBytes,
    skippedFiles,
    ...(withheldFiles ? { withheldFiles } : {}),
    ...(end < matches.length ? { nextCursor: `${fingerprint}:${end}` } : {}),
  };
}
