import { readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { ensureDir, pathExists } from '../utils/file-ops.js';

export const OUTPUT_ROOT = 'output';

const TYPE_BY_EXTENSION = {
  docx: 'document',
  pdf: 'document',
  txt: 'document',
  md: 'document',
  pptx: 'presentation',
  key: 'presentation',
  xlsx: 'spreadsheet',
  csv: 'spreadsheet',
  tsv: 'spreadsheet',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  svg: 'image',
  json: 'data',
  yaml: 'data',
  yml: 'data',
  html: 'web',
  zip: 'package',
};

function dateParts(value = new Date()) {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return { year: match[1], month: match[2], day: match[3] };
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid output date');
  }

  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    day: String(date.getDate()).padStart(2, '0'),
  };
}

export function sanitizeOutputSegment(value, { fallback = 'untitled', maxLength = 72 } = {}) {
  let text = String(value ?? '').normalize('NFKC').trim();
  text = text
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '');

  if (!text) text = fallback;
  if (text.length > maxLength) {
    text = text.slice(0, maxLength).replace(/[.\s-]+$/g, '');
  }

  return text || fallback;
}

export function normalizeExtension(extension = 'md') {
  const clean = String(extension || 'md')
    .trim()
    .replace(/^\.+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return clean || 'md';
}

export function inferOutputType(extension = '') {
  const ext = normalizeExtension(extension);
  return TYPE_BY_EXTENSION[ext] || 'other';
}

export function normalizeOutputType(type, extension = '') {
  const requested = String(type || '').trim().toLowerCase();
  if (!requested) return inferOutputType(extension);
  return sanitizeOutputSegment(requested, { fallback: 'other', maxLength: 40 }).toLowerCase();
}

export function normalizeTeamCode(team = 'shared') {
  const clean = sanitizeOutputSegment(team, { fallback: 'SHARED', maxLength: 24 });
  if (['all', 'staff', 'shared', 'universal'].includes(clean.toLowerCase())) return 'SHARED';
  return clean.toUpperCase();
}

export function buildOutputDirectory({
  workspaceDir = process.cwd(),
  team = 'shared',
  type,
  extension = 'md',
  date = new Date(),
} = {}) {
  const { year, month } = dateParts(date);
  const teamCode = normalizeTeamCode(team);
  const outputType = normalizeOutputType(type, extension);
  return join(workspaceDir, OUTPUT_ROOT, teamCode, year, month, outputType);
}

export function buildOutputBaseName({
  team = 'shared',
  type,
  title = 'untitled',
  extension = 'md',
  date = new Date(),
} = {}) {
  const { year, month, day } = dateParts(date);
  const teamCode = normalizeTeamCode(team);
  const outputType = normalizeOutputType(type, extension);
  const safeTitle = sanitizeOutputSegment(title, { fallback: 'untitled', maxLength: 72 });
  return `${year}${month}${day}_${teamCode}_${outputType}_${safeTitle}`;
}

export async function getNextOutputPath({
  workspaceDir = process.cwd(),
  team = 'shared',
  type,
  title = 'untitled',
  extension = 'md',
  date = new Date(),
  createDir = true,
  reserve = true,
} = {}) {
  const ext = normalizeExtension(extension);
  const directory = buildOutputDirectory({ workspaceDir, team, type, extension: ext, date });
  const baseName = buildOutputBaseName({ team, type, title, extension: ext, date });

  if (createDir) await ensureDir(directory);

  const prefix = `${baseName}_v`;
  const suffix = `.${ext}`;

  const nextVersionFrom = (names) => {
    let highest = 0;
    for (const name of names) {
      if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue;
      const versionText = name.slice(prefix.length, -suffix.length);
      if (!/^\d+$/.test(versionText)) continue;
      highest = Math.max(highest, Number(versionText));
    }
    return highest + 1;
  };

  let entries = [];
  if (await pathExists(directory)) {
    entries = await readdir(directory);
  }

  let version = nextVersionFrom(entries);
  let filename = `${baseName}_v${String(version).padStart(2, '0')}.${ext}`;
  let path = join(directory, filename);

  // Reading the directory and returning a name is not a reservation: two runs in
  // the same second would both be handed v01 and the second would overwrite the
  // first. Claim the name with an exclusive create and retry on collision, so a
  // version number the caller receives is a name only it holds.
  if (reserve && createDir) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        await writeFile(path, '', { encoding: 'utf-8', flag: 'wx' });
        break;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        version = nextVersionFrom(await readdir(directory));
        filename = `${baseName}_v${String(version).padStart(2, '0')}.${ext}`;
        path = join(directory, filename);
      }
    }
  }

  return {
    root: join(workspaceDir, OUTPUT_ROOT),
    directory,
    filename,
    path,
    relativePath: relative(workspaceDir, path).replace(/\\/g, '/'),
    version,
    team: normalizeTeamCode(team),
    type: normalizeOutputType(type, ext),
    extension: ext,
  };
}

export async function initOutputWorkspace(workspaceDir = process.cwd(), team = 'shared') {
  const teamRoot = join(workspaceDir, OUTPUT_ROOT, normalizeTeamCode(team));
  await ensureDir(teamRoot);
  return {
    root: join(workspaceDir, OUTPUT_ROOT),
    teamRoot,
    relativePath: relative(workspaceDir, teamRoot).replace(/\\/g, '/'),
  };
}
