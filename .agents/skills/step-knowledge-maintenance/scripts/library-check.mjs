#!/usr/bin/env node
// Checks the documents whose text the library holds (manifest/documents.yaml entries titled with an MIS number, such as
// "QP-AF-001 ...") against the MIS register: is the transcribed REV and effective date still the one MIS shows?
//
//   node library-check.mjs --mis <extract.json | mis-iso-document-register.md> [--manifest <documents.yaml>]
//
// Prints a JSON report to stdout. It reads metadata only and changes nothing; a finding means a person opens the
// controlled copy in MIS and, if it changed, transcribes the new revision through the usual review.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripYamlScalar } from '../../../../src/utils/simple-yaml.js';
import { readMisRecords } from './mis-records.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const NUMBER = /^([A-Z]{2}-[A-Z]{2,4}-\d{3})(?=\s|$)/;
/** "V.02", "02" and "2" are one revision; MIS shows "-" (here "none") when it has no REV. */
const revisionKey = (value) => {
  const text = String(value ?? '').trim();
  if (!text || text === 'none') return '';
  const digits = text.replace(/^V\.?\s*/i, '');
  return /^\d+$/.test(digits) ? String(Number(digits)) : digits;
};

/** Library entries that name an MIS document number, keep their text in the repo and are in use. */
function libraryDocuments(text) {
  const docs = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const key = /^ {2}([a-z0-9_-]+):\s*$/.exec(line);
    if (key) {
      current = { document: key[1] };
      docs.push(current);
      continue;
    }
    const field = current && /^ {4}(title|version|effectiveDate|status|path):\s*(.+)/.exec(line);
    if (field) current[field[1]] = stripYamlScalar(field[2]);
  }
  return docs
    .map((doc) => ({ ...doc, id: NUMBER.exec(doc.title ?? '')?.[1] }))
    .filter((doc) => doc.id && doc.path && doc.status === 'active');
}

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const [, value] = args.splice(i, 2);
  return value;
};
const mis = option('--mis');
const manifest = option('--manifest') ?? join(ROOT, 'manifest', 'documents.yaml');
if (!mis || args.length) {
  process.stderr.write('Usage: node library-check.mjs --mis <extract.json|register.md> [--manifest documents.yaml]\n');
  process.exitCode = 2;
} else {
  try {
    const { status, records } = readMisRecords(mis);
    const byId = new Map(records.map((record) => [record.id, record]));
    const docs = libraryDocuments(readFileSync(manifest, 'utf8'));
    const findings = [];
    for (const doc of docs) {
      const library = { revision: doc.version ?? '', effectiveDate: doc.effectiveDate ?? '' };
      const record = byId.get(doc.id);
      if (!record) {
        // A partial read cannot say a document is gone.
        const action = status === 'complete' ? 'not-in-mis' : 'check-in-mis';
        findings.push({ document: doc.document, id: doc.id, action, library });
        continue;
      }
      const misSide = { revision: record.revision, effectiveDate: record.effectiveDate, state: record.state };
      const stale =
        revisionKey(library.revision) !== revisionKey(record.revision) ||
        (library.effectiveDate && library.effectiveDate !== record.effectiveDate);
      const action = record.state === 'withdrawn' ? 'withdrawn-in-mis' : stale ? 'update-library' : '';
      if (action) findings.push({ document: doc.document, id: doc.id, action, library, mis: misSide });
    }
    findings.sort((a, b) => a.id.localeCompare(b.id));
    const report = {
      mode: 'library-check',
      misStatus: status,
      checked: docs.length,
      reviewRequired: findings.length > 0 || status !== 'complete',
      findings,
    };
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } catch {
    process.stderr.write('INVALID_INPUT: expected an MIS register (.json extract or published .md) and documents.yaml.\n');
    process.exitCode = 2;
  }
}
