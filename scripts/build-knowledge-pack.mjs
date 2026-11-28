#!/usr/bin/env node
/**
 * Build a checksum-verified Knowledge Pack manifest (and optional release folder) from
 * manifest/documents.yaml and all registered docs/knowledge/*.md files.
 *
 * Usage:
 *   node scripts/build-knowledge-pack.mjs [--version 2026.11.28-1] [--base-url https://...] [--out-dir dist/knowledge-pack]
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UNREADABLE = new Set(['not-provided', 'superseded', 'archived', 'withdrawn', 'restricted', 'unregistered']);

function stripYamlScalar(raw) {
  const s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s;
}

function parseReadableKnowledgePaths(yamlText) {
  const paths = new Set();
  let current = null;
  const finish = () => {
    if (
      current &&
      current.title &&
      current.path &&
      current.sensitivity !== 'restricted' &&
      !UNREADABLE.has(current.status || '') &&
      /^docs\/knowledge\/[a-zA-Z0-9._/-]+\.md$/.test(current.path)
    ) {
      paths.add(current.path);
    }
  };
  for (const line of yamlText.split(/\r?\n/)) {
    const key = /^  ([a-z0-9_-]+):\s*$/.exec(line);
    if (key) {
      finish();
      current = { id: key[1], title: '', path: '', status: '', sensitivity: '' };
      continue;
    }
    if (!current) continue;
    const m = /^    (title|path|index|status|sensitivity):\s*(.+)/.exec(line);
    if (!m) continue;
    const [, field, rawVal] = m;
    const val = stripYamlScalar(rawVal);
    if (field === 'index') {
      if (!current.path) current.path = val;
    } else {
      current[field] = val;
    }
  }
  finish();
  return [...paths].sort();
}

const sha256 = buf => createHash('sha256').update(buf).digest('hex');

const args = process.argv.slice(2);
const arg = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const today = new Date().toISOString().slice(0, 10);
const packVersion = arg('--version') || today.replace(/-/g, '.') + '-1';
const baseUrl = arg('--base-url');
const outDir = arg('--out-dir') ? resolve(process.cwd(), arg('--out-dir')) : null;

const yamlRel = 'manifest/documents.yaml';
const yamlBytes = await readFile(join(ROOT, yamlRel));
const docPaths = parseReadableKnowledgePaths(yamlBytes.toString('utf8'));
const files = [];

for (const rel of docPaths) {
  const full = resolve(ROOT, rel);
  const check = relative(ROOT, full);
  if (isAbsolute(check) || check.startsWith('..')) continue;
  const bytes = await readFile(full);
  files.push({ path: rel, sha256: sha256(bytes), bytes: bytes.length });
}

const manifest = {
  schemaVersion: 1,
  packVersion,
  publishedAt: today,
  ...(baseUrl ? { baseUrl } : {}),
  documentsYaml: { path: yamlRel, sha256: sha256(yamlBytes), bytes: yamlBytes.length },
  files,
};

if (outDir) {
  await mkdir(outDir, { recursive: true });
  await mkdir(join(outDir, 'manifest'), { recursive: true });
  await copyFile(join(ROOT, yamlRel), join(outDir, yamlRel));
  for (const f of files) {
    const dest = join(outDir, f.path);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(ROOT, f.path), dest);
  }
  await writeFile(join(outDir, 'knowledge-pack-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Built STeP Knowledge Pack v${packVersion}: ${files.length} documents -> ${outDir}`);
} else {
  process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
}
