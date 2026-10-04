#!/usr/bin/env node
// Builds the STeP Claude plugin (plugins/step) from the repository's own Skills, so employees can install the STeP
// Skills into Claude Code or Claude Desktop with one command instead of running the step-ai installer:
//   /plugin marketplace add iisara555/STeP-AI-Harness
//   /plugin install step@step-ai
// skills/, rules/, docs/ and manifest/ stay the single source; this script copies them into the plugin layout and is
// re-run whenever they change. `--check` rebuilds into a temporary folder and fails when plugins/step is out of date.
//
// What changes on the way:
// - Skills move from skills/<area>/<name>/ to skills/<name>/, the layout Claude Code scans.
// - Every Markdown link and every bare repository path ("manifest/documents.yaml") that a Skill or a document it links
//   to mentions is rewritten relative to the copied file, and the file it points at is copied too, so references keep
//   working wherever the plugin is installed. Only files that exist are followed.
// - plugin/ holds the hand-written parts: the session brief (the safety rules every session starts with) and its hook.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_NAME = 'step';
const OUT_RELATIVE = posix.join('plugins', PLUGIN_NAME);
// Repository folders a Skill may point into, and single Markdown files at the repository root (SUPPORT.md).
const FOLLOWED = /^((skills|rules|docs|manifest)\/|[\w-]+\.md$)/;

const toPosix = path => path.split(sep).join('/');
const isFile = path => existsSync(path) && statSync(path).isFile();

function walk(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, found);
    else found.push(path);
  }
  return found;
}

/** Skills by folder: skills/<area>/<name>/ in the repository → skills/<name>/ in the plugin. */
function skillFolders() {
  const folders = walk(join(ROOT, 'skills'))
    .filter(path => path.endsWith(`${sep}SKILL.md`))
    .map(path => toPosix(relative(ROOT, dirname(path))))
    .sort();
  const names = new Map();
  for (const folder of folders) {
    const name = posix.basename(folder);
    if (names.has(name)) throw new Error(`Two Skills are named ${name}: ${names.get(name)} and ${folder}`);
    names.set(name, folder);
  }
  return folders;
}

export function buildPlugin(outDir) {
  const skills = skillFolders();
  /** Where a repository file lands in the plugin. */
  const target = repoPath => {
    const skill = skills.find(folder => repoPath === folder || repoPath.startsWith(folder + '/'));
    return skill ? posix.join('skills', posix.basename(skill), repoPath.slice(skill.length + 1)) : repoPath;
  };
  const queue = [];
  const copied = new Set();
  const enqueue = repoPath => {
    if (!copied.has(repoPath)) {
      copied.add(repoPath);
      queue.push(repoPath);
    }
  };
  for (const folder of skills) for (const file of walk(join(ROOT, folder))) enqueue(toPosix(relative(ROOT, file)));
  for (const file of walk(join(ROOT, 'rules'))) enqueue(toPosix(relative(ROOT, file)));

  rmSync(outDir, { recursive: true, force: true });
  while (queue.length) {
    const repoPath = queue.shift();
    const from = join(ROOT, repoPath);
    const to = join(outDir, target(repoPath));
    mkdirSync(dirname(to), { recursive: true });
    if (!repoPath.endsWith('.md')) {
      cpSync(from, to);
      continue;
    }
    const here = posix.dirname(target(repoPath));
    const link = referenced => {
      enqueue(referenced);
      return posix.relative(here, target(referenced)) || posix.basename(referenced);
    };
    let text = readFileSync(from, 'utf8');
    // Markdown links relative to the file: [text](../../../rules/human-approval.md#section)
    text = text.replace(/\]\(([^)\s#:]+)(#[^)\s]*)?\)/g, (whole, path, anchor = '') => {
      const referenced = posix.normalize(posix.join(posix.dirname(repoPath), path));
      return FOLLOWED.test(referenced) && isFile(join(ROOT, referenced)) ? `](${link(referenced)}${anchor})` : whole;
    });
    // Bare repository paths in prose or code: `manifest/documents.yaml`, rules/human-approval.md
    text = text.replace(/(?<![\w./-])((?:skills|rules|docs|manifest)\/[\w./-]*[\w-])/g, (whole, path) =>
      isFile(join(ROOT, path)) ? link(path) : whole,
    );
    writeFileSync(to, text);
  }

  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const manifest = {
    name: PLUGIN_NAME,
    displayName: 'STeP AI Skills',
    version,
    description:
      'Skills, writing rules and safety rules of Science and Technology Park, Chiang Mai University (STeP): Thai official documents, AFP receipts, ISO 9001, PM and creative work.',
    author: { name: 'Science and Technology Park, Chiang Mai University (STeP)' },
    repository: 'https://github.com/iisara555/STeP-AI-Harness',
    license: 'MIT',
    keywords: ['step', 'thai', 'government-documents', 'iso9001', 'afp'],
  };
  mkdirSync(join(outDir, '.claude-plugin'), { recursive: true });
  writeFileSync(join(outDir, '.claude-plugin', 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
  // The plugin directory takes its listing icon from .claude-plugin/icon.png: the STeP Desktop app icon (1024 px, square).
  cpSync(join(ROOT, 'desktop', 'build', 'icon.png'), join(outDir, '.claude-plugin', 'icon.png'));
  cpSync(join(ROOT, 'plugin', 'LICENSE'), join(outDir, 'LICENSE'));
  cpSync(join(ROOT, 'plugin', 'session-brief.md'), join(outDir, 'session-brief.md'));
  mkdirSync(join(outDir, 'hooks'), { recursive: true });
  cpSync(join(ROOT, 'plugin', 'hooks.json'), join(outDir, 'hooks', 'hooks.json'));
  writeFileSync(
    join(outDir, 'README.md'),
    readFileSync(join(ROOT, 'plugin', 'README.md'), 'utf8') +
      `\n<!-- Generated by scripts/build-claude-plugin.mjs from skills/, rules/, docs/ and manifest/. Edit those, not this folder. -->\n`,
  );
  return { skills: skills.length, files: copied.size };
}

// A Windows checkout turns LF into CRLF in text files (core.autocrlf), so line endings are not a difference.
const sameContent = (x, y) => {
  const [left, right] = [readFileSync(x), readFileSync(y)];
  if (left.equals(right)) return true;
  const lf = buffer => buffer.toString('utf8').replace(/\r\n/g, '\n');
  return !left.includes(0) && !right.includes(0) && lf(left) === lf(right);
};

function sameTree(a, b) {
  const list = dir => (existsSync(dir) ? walk(dir).map(path => toPosix(relative(dir, path))).sort() : []);
  const left = list(a),
    right = list(b);
  const differences = [
    ...left.filter(path => !right.includes(path)).map(path => `only in build: ${path}`),
    ...right.filter(path => !left.includes(path)).map(path => `only in ${OUT_RELATIVE}: ${path}`),
    ...left.filter(path => right.includes(path) && !sameContent(join(a, path), join(b, path))).map(path => `changed: ${path}`),
  ];
  return differences;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const temp = mkdtempSync(join(tmpdir(), 'step-plugin-'));
    try {
      buildPlugin(temp);
      const differences = sameTree(temp, join(ROOT, OUT_RELATIVE));
      if (differences.length) {
        console.error(`${OUT_RELATIVE} is out of date; run: node scripts/build-claude-plugin.mjs\n` + differences.slice(0, 20).join('\n'));
        process.exit(1);
      }
      console.log(`${OUT_RELATIVE} is up to date.`);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  } else {
    const { skills, files } = buildPlugin(join(ROOT, OUT_RELATIVE));
    console.log(`Built ${OUT_RELATIVE}: ${skills} Skills, ${files} files.`);
  }
}
