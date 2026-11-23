#!/usr/bin/env node
// Builds a schema-1 snapshot for preview.mjs from the STeP MIS register.
//
//   node snapshot.mjs --mis <extract.json | mis-iso-document-register.md> [--out <file>]
//
// Gmail and Sheets have no reader yet and are written as `not-configured`. Unreadable or conflicting MIS rows make the
// MIS source `partial`; their ids (never titles) go to stderr. The snapshot goes to stdout unless --out is given.
import { writeFileSync } from 'node:fs';
import { readMisRecords } from './mis-records.mjs';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const [, value] = args.splice(i, 2);
  return value;
};
const mis = option('--mis');
const out = option('--out');
if (!mis || args.length) {
  process.stderr.write('Usage: node snapshot.mjs --mis <extract.json|register.md> [--out file]\n');
  process.exitCode = 2;
} else {
  try {
    const { status, records, problems } = readMisRecords(mis);
    const empty = { status: 'not-configured', records: [] };
    const snapshot = { schema: 1, sources: { mis: { status, records }, gmail: empty, sheets: empty } };
    const json = JSON.stringify(snapshot, null, 2) + '\n';
    if (out) writeFileSync(out, json);
    else process.stdout.write(json);
    process.stderr.write(`MIS: ${records.length} records, ${status}\n`);
    for (const { id, problem } of problems) process.stderr.write(`  ${problem}: ${id}\n`);
  } catch {
    process.stderr.write('INVALID_MIS_INPUT: expected an MIS register extract (.json) or the published register (.md).\n');
    process.exitCode = 2;
  }
}
