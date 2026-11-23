// Reads the STeP MIS quality-document register into snapshot records for preview.mjs.
//
// Input is either the private MIS extract that scripts/generate-mis-iso-register.mjs reads (.json), or the register
// that script published (docs/knowledge/mis-iso-document-register.md). Both pass through the generator's own cell
// cleaning, so the same MIS state gives the same records from either file: the committed register can serve as the
// last-reviewed snapshot and a fresh extract as the current one.
//
// MIS rows carry metadata only, no document text, so `sha256` is the digest of the cleaned row (number, register type,
// REV, date, title, status). A changed title or a re-filed register shows as a change; the PDF itself is not hashed.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readRows } from '../../../../scripts/generate-mis-iso-register.mjs';

const ID = /^[A-Z0-9][A-Z0-9-]{0,63}$/;
const REVISION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,23}$/;

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Table rows of the published register. Master Lists have no number; they are read from the overview table only. */
function registerRows(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith('| ') || line.startsWith('| ---') || line.includes('| เลขที่ |')) continue;
    const cells = line.slice(2, -2).split(' | ');
    if (cells.length === 7) {
      const [code, number, type, rev, date, title, status] = cells;
      rows.push({ code, number, type, rev, date, title, status });
    } else if (cells.length === 6) {
      const [number, type, rev, date, title, status] = cells;
      if (number !== '-') rows.push({ code: '', number, type, rev, date, title, status });
    } else throw new Error('unexpected register row');
  }
  return rows;
}

function recordOf(row) {
  // A Master List has no number and one team can hold several (QS keeps DC, QM and QS), so its title names it.
  const masterList = row.number === '-' && row.type === 'Master List';
  const id = masterList
    ? `ML-${row.title.replace(/^master\s*list/i, '').toUpperCase().replace(/[^A-Z0-9]/g, '')}`
    : row.number;
  const revision = row.rev === '-' ? 'none' : row.rev;
  const state = row.status === 'ยกเลิก' ? 'withdrawn' : 'active';
  const sha256 = createHash('sha256')
    .update(JSON.stringify([id, row.type, row.rev, row.date, row.title, row.status]))
    .digest('hex');
  const valid =
    ID.test(id) &&
    id !== 'ML-' &&
    REVISION.test(revision) &&
    validDate(row.date) &&
    (row.status === 'ใช้อยู่' || row.status === 'ยกเลิก');
  return valid ? { id, revision, effectiveDate: row.date, sha256, state } : { id, invalid: true };
}

/**
 * MIS records from an extract (.json) or the published register (.md).
 * Returns { status, records, problems }: rows that cannot be read, or one number with two different rows, are left out
 * and make the source `partial`, so preview.mjs never infers a withdrawal from them. `problems` names ids only.
 */
export function readMisRecords(path) {
  const text = readFileSync(path, 'utf8');
  const rows = /\.md$/i.test(path) ? registerRows(text) : readRows(JSON.parse(text));
  const byId = new Map();
  const problems = [];
  for (const row of rows) {
    const record = recordOf(row);
    if (record.invalid) {
      problems.push({ id: record.id || '(no number)', problem: 'unreadable-row' });
      continue;
    }
    const seen = byId.get(record.id);
    if (!byId.has(record.id)) byId.set(record.id, record);
    // The published register lists each QM and Master List twice (overview and team section): same row, same digest.
    else if (seen && seen.sha256 !== record.sha256) byId.set(record.id, null);
  }
  for (const [id, record] of byId) {
    if (record === null) {
      problems.push({ id, problem: 'conflicting-rows' });
      byId.delete(id);
    }
  }
  const records = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  problems.sort((a, b) => a.id.localeCompare(b.id));
  return { status: problems.length ? 'partial' : 'complete', records, problems };
}
