#!/usr/bin/env node
// Puts the STeP Skills (plugins/step, built by scripts/build-claude-plugin.mjs) where tools without a plugin hook look:
//
//   node scripts/install-agent-skills.mjs antigravity
//     Every Antigravity workspace: global Skills in ~/.gemini/config/skills/<name>/SKILL.md, the full rules, documents
//     and manifest the Skills link to in ~/.gemini/config/step/, and the short STeP brief in the global rules file
//     ~/.gemini/GEMINI.md between markers (the rest of that file is kept).
//
//   node scripts/install-agent-skills.mjs antigravity <work folder>
//     One workspace only: Antigravity reads <folder>/.agents/skills/<name>/SKILL.md and always applies
//     <folder>/.agents/rules/*.md. The Skills go to .agents/skills/, the short brief to .agents/rules/step.md, and the
//     full files to .agents/step/ (kept out of .agents/rules so they are read only when needed).
//
//   Links inside the copies are rewritten to the new places.
//
//   node scripts/install-agent-skills.mjs codex [CODEX_HOME]
//     Codex installs the Skills as a plugin (codex plugin marketplace add iisara555/STeP-AI-Harness; codex plugin add
//     step@step-ai) but does not run plugin hooks, so the STeP brief goes into Codex's global AGENTS.md
//     (~/.codex/AGENTS.md, or $CODEX_HOME/AGENTS.md) between markers; running it again replaces that block only.
//
// Re-running either target updates it in place; Skills from an earlier run that no longer exist are removed, and
// nothing else in the folder is touched.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(ROOT, 'plugins', 'step');
const BEGIN = '<!-- STeP AI Skills: begin (managed by scripts/install-agent-skills.mjs) -->';
const END = '<!-- STeP AI Skills: end -->';

const toPosix = path => path.split(sep).join('/');
const walk = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const brief = () => readFileSync(join(PLUGIN, 'session-brief.md'), 'utf8');

/** Copies the plugin under `agents`: skills/ → <agents>/skills/, everything else → <agents>/step/. Returns the Skill names. */
function copySkills(agents) {
  if (!existsSync(join(PLUGIN, 'skills'))) throw new Error('plugins/step is missing; run node scripts/build-claude-plugin.mjs');
  const place = pluginFile => {
    const rel = toPosix(relative(PLUGIN, pluginFile));
    return rel.startsWith('skills/') ? join(agents, rel) : join(agents, 'step', rel);
  };
  // Forget the Skills this script put here last time, then copy the current set.
  const record = join(agents, 'step', 'installed.json');
  const previous = existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')).skills || [] : [];
  for (const name of previous) rmSync(join(agents, 'skills', name), { recursive: true, force: true });
  rmSync(join(agents, 'step'), { recursive: true, force: true });
  const skills = readdirSync(join(PLUGIN, 'skills')).filter(name => existsSync(join(PLUGIN, 'skills', name, 'SKILL.md')));
  const skip = new Set(['.claude-plugin', 'hooks', 'README.md', 'session-brief.md'].map(p => join(PLUGIN, p)));
  for (const file of walk(PLUGIN)) {
    if ([...skip].some(s => file === s || file.startsWith(s + sep))) continue;
    const to = place(file);
    mkdirSync(dirname(to), { recursive: true });
    if (!file.endsWith('.md')) {
      cpSync(file, to);
      continue;
    }
    // Every relative path in the text that points at a plugin file is pointed at that file's new place.
    const text = readFileSync(file, 'utf8').replace(/(?<![\w/])((?:\.\.\/)+|\.\/)?([\w-][\w./-]*[\w-])/g, (whole, up = '', rest) => {
      if (!up && !rest.includes('/')) return whole;
      const target = resolve(dirname(file), up + rest);
      if (!target.startsWith(PLUGIN + sep) || !existsSync(target) || !statSync(target).isFile()) return whole;
      return toPosix(relative(dirname(to), place(target)));
    });
    writeFileSync(to, text);
  }
  writeFileSync(record, JSON.stringify({ skills, from: 'plugins/step', version: JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version }, null, 2) + '\n');
  return skills;
}

/** The session brief with its rules/ paths pointing at `rulesDir`. */
const briefFor = rulesDir =>
  brief()
    .replace(/\(rules\//g, `(${rulesDir}/`)
    .replace(/, rules\//g, `, ${rulesDir}/`)
    .replace(/ไฟล์ rules\/ ที่อ้างถึงอยู่ในโฟลเดอร์ที่ติดตั้ง `step` ไว้/, `ไฟล์กติกาฉบับเต็มอยู่ใน \`${rulesDir}/\``);

/** Writes `body` between the STeP markers in `file`, replacing an earlier block and keeping everything else. */
function writeBlock(file, body) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const block = `${BEGIN}\n${body.trim()}\n${END}\n`;
  const start = current.indexOf(BEGIN),
    end = current.indexOf(END);
  const next =
    start >= 0 && end > start
      ? current.slice(0, start) + block + current.slice(end + END.length).replace(/^\n/, '')
      : current + (current && !current.endsWith('\n\n') ? (current.endsWith('\n') ? '\n' : '\n\n') : '') + block;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, next);
}

/** One Antigravity workspace: skills/ → .agents/skills/, everything else → .agents/step/, brief → .agents/rules/step.md. */
export function installAntigravity(workspace) {
  const agents = join(resolve(workspace), '.agents');
  const skills = copySkills(agents);
  mkdirSync(join(agents, 'rules'), { recursive: true });
  writeFileSync(join(agents, 'rules', 'step.md'), briefFor('.agents/step/rules'));
  return { skills: skills.length, agents };
}

/** Every Antigravity workspace: Skills in <geminiHome>/config/skills/, full files in <geminiHome>/config/step/, brief in GEMINI.md. */
export function installAntigravityGlobal(geminiHome = join(homedir(), '.gemini')) {
  const config = join(geminiHome, 'config');
  const skills = copySkills(config);
  // Written as ~/... under the home folder, so the rules file carries no user name.
  const full = join(config, 'step', 'rules'),
    home = relative(homedir(), full);
  const rulesDir = home && !home.startsWith('..') && !home.startsWith(sep) && !/^[A-Za-z]:/.test(home) ? `~/${toPosix(home)}` : toPosix(full);
  writeBlock(join(geminiHome, 'GEMINI.md'), briefFor(rulesDir));
  return { skills: skills.length, agents: config, rules: join(geminiHome, 'GEMINI.md') };
}

/** Writes or replaces the STeP block in Codex's global AGENTS.md. */
export function installCodexRules(codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')) {
  const file = join(codexHome, 'AGENTS.md');
  writeBlock(
    file,
    brief().replace(/ไฟล์ rules\/ ที่อ้างถึงอยู่ในโฟลเดอร์ที่ติดตั้ง `step` ไว้/, 'ไฟล์ rules/ ที่อ้างถึงอยู่ในโฟลเดอร์ของ plugin `step` (ติดตั้งด้วย `codex plugin add step@step-ai`)'),
  );
  return { file };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [target, where] = process.argv.slice(2);
  if (target === 'antigravity' && where) {
    const { skills, agents } = installAntigravity(where);
    console.log(`Installed ${skills} STeP Skills for Antigravity in ${agents} (rules: .agents/rules/step.md). Open the folder in Antigravity.`);
  } else if (target === 'antigravity') {
    const { skills, agents, rules } = installAntigravityGlobal();
    console.log(`Installed ${skills} STeP Skills for every Antigravity workspace in ${agents} (rules: ${rules}). Restart Antigravity.`);
  } else if (target === 'codex') {
    const { file } = installCodexRules(where);
    console.log(`Wrote the STeP rules block to ${file}. Install the Skills with: codex plugin marketplace add iisara555/STeP-AI-Harness && codex plugin add step@step-ai`);
  } else {
    console.error('Usage: node scripts/install-agent-skills.mjs antigravity [work folder]\n       node scripts/install-agent-skills.mjs codex [CODEX_HOME]');
    process.exit(2);
  }
}
