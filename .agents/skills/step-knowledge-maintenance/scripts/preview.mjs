#!/usr/bin/env node
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';

const sources = ['mis', 'gmail', 'sheets'];
// not-configured: no reader is set up for the source yet. It holds no records and asks for no review.
const sourceStates = ['complete', 'partial', 'unavailable', 'not-configured'];
const recordStates = ['active', 'withdrawn'];
const maxBytes = 2 * 1024 * 1024;

function hasFields(value, fields) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validRecord(record) {
  return (
    hasFields(record, ['id', 'revision', 'effectiveDate', 'sha256', 'state']) &&
    typeof record.id === 'string' &&
    /^[A-Z0-9][A-Z0-9-]{0,63}$/.test(record.id) &&
    typeof record.revision === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,23}$/.test(record.revision) &&
    validDate(record.effectiveDate) &&
    typeof record.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(record.sha256) &&
    recordStates.includes(record.state)
  );
}

function readSnapshot(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error();
    const buffer = Buffer.alloc(stat.size + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
    }
    if (size !== stat.size) throw new Error();
    const value = JSON.parse(buffer.subarray(0, size).toString('utf8'));
    if (!hasFields(value, ['schema', 'sources']) || value.schema !== 1 || !hasFields(value.sources, sources))
      throw new Error();
    for (const source of sources) {
      const batch = value.sources[source];
      if (
        !hasFields(batch, ['status', 'records']) ||
        !sourceStates.includes(batch.status) ||
        !Array.isArray(batch.records)
      )
        throw new Error();
      if ((batch.status === 'unavailable' || batch.status === 'not-configured') && batch.records.length) throw new Error();
      const ids = new Set();
      for (const record of batch.records) {
        if (!validRecord(record) || ids.has(record.id)) throw new Error();
        ids.add(record.id);
      }
    }
    return value.sources;
  } finally {
    closeSync(fd);
  }
}

function sameRecord(left, right) {
  return (
    left.revision === right.revision &&
    left.sha256 === right.sha256 &&
    left.effectiveDate === right.effectiveDate &&
    left.state === right.state
  );
}

function preview(current, previous) {
  const observations = new Map();
  const changes = [];
  for (const source of sources) {
    const { status, records } = current[source];
    const prior = new Map((previous?.[source].records ?? []).map((record) => [record.id, record]));
    for (const record of records) {
      const { id, revision, effectiveDate, state } = record;
      const before = prior.get(id);
      prior.delete(id);

      if (status === 'complete') {
        const observed = observations.get(id) ?? [];
        observed.push({ source, record });
        observations.set(id, observed);
      }
      if (before && sameRecord(record, before)) continue;
      const action = state === 'withdrawn' ? 'verify-withdrawal' : before ? 'review-change' : 'review-new';
      changes.push({ source, id, revision, effectiveDate, action, partial: status !== 'complete' });
    }
    if (status === 'complete') {
      for (const { id, revision, effectiveDate } of prior.values())
        changes.push({ source, id, revision, effectiveDate, action: 'verify-missing', partial: false });
    }
  }
  const disagreements = [];
  for (const [id, observed] of observations) {
    const first = observed[0].record;
    if (observed.some(({ record }) => !sameRecord(record, first))) {
      disagreements.push({
        id,
        sources: observed.map(({ source, record }) => ({
          source,
          revision: record.revision,
          effectiveDate: record.effectiveDate,
          state: record.state,
        })),
      });
    }
  }
  const sourceStatus = Object.fromEntries(sources.map((source) => [source, current[source].status]));
  return {
    mode: 'preview',
    reviewRequired:
      changes.length > 0 ||
      disagreements.length > 0 ||
      sources.some((source) => sourceStatus[source] === 'partial' || sourceStatus[source] === 'unavailable') ||
      // A source switched off after it held reviewed records needs a person to say those records still stand.
      sources.some((source) => sourceStatus[source] === 'not-configured' && previous?.[source].records.length > 0),
    sourceStatus,
    changes: changes.sort((a, b) => a.source.localeCompare(b.source) || a.id.localeCompare(b.id)),
    disagreements: disagreements.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

const [currentPath, previousPath, ...extra] = process.argv.slice(2);
if (!currentPath || extra.length) {
  process.stderr.write('Usage: node preview.mjs CURRENT.json [LAST_REVIEWED.json]\n');
  process.exitCode = 2;
} else {
  try {
    const current = readSnapshot(currentPath);
    const previous = previousPath ? readSnapshot(previousPath) : undefined;
    process.stdout.write(JSON.stringify(preview(current, previous), null, 2) + '\n');
  } catch {
    process.stderr.write('INVALID_SNAPSHOT: expected bounded, schema-1 metadata from the configured sources.\n');
    process.exitCode = 2;
  }
}
