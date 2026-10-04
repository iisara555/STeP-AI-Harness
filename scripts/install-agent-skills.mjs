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
//   node scripts/install-agent-skills.mjs profile [--name=.. --team=.. --assistant=.. --style=..]
//     The employee's own profile (what USER.md held in the folder workflow): nickname, team, assistant name and
//     conversation style. Asked once, written between its own markers into the global instructions file of every tool
//     found on this computer: ~/.claude/CLAUDE.md, ~/.codex/AGENTS.md and ~/.gemini/GEMINI.md. Run it again to change it.
//
// Re-running any target updates it in place; Skills from an earlier run that no longer exist are removed, and
// nothing else in the folder is touched.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseTeamsYaml } from '../src/modules/role-resolver.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(ROOT, 'plugins', 'step');
const BEGIN = '<!-- STeP AI Skills: begin (managed by scripts/install-agent-skills.mjs) -->';
const END = '<!-- STeP AI Skills: end -->';
const PROFILE_BEGIN = '<!-- STeP AI profile: begin (managed by scripts/install-agent-skills.mjs profile) -->';
const PROFILE_END = '<!-- STeP AI profile: end -->';

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
function writeBlock(file, body, begin = BEGIN, finish = END) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const block = `${begin}\n${body.trim()}\n${finish}\n`;
  const start = current.indexOf(begin),
    end = current.indexOf(finish);
  const next =
    start >= 0 && end > start
      ? current.slice(0, start) + block + current.slice(end + finish.length).replace(/^\n/, '')
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

export const STYLES = {
  coworker: 'เป็นกันเอง สุภาพ พูดธรรมชาติ ไม่ใช้ภาษาทางการเกินจำเป็น',
  professional: 'สุภาพ มีโครงสร้าง ชัดเจน เหมาะกับงานองค์กร',
  concise: 'ตอบสั้น ตรงประเด็น เน้นสิ่งที่ต้องทำต่อ',
};
export const teams = () => parseTeamsYaml(readFileSync(join(ROOT, 'manifest', 'teams.yaml'), 'utf8'));

/** One line of free text: no line breaks or markup that could end the block, and nothing that looks like an ID or phone number. */
function clean(value, max, label) {
  const text = String(value ?? '').replace(/[\r\n<>`]/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > max) throw new Error(`${label} ยาวเกิน ${max} ตัวอักษร`);
  if (/\d[\d -]{7,}\d/.test(text)) throw new Error(`${label} มีตัวเลขยาวคล้ายเลขบัตรหรือเบอร์โทร ห้ามใส่ข้อมูลส่วนบุคคล`);
  return text;
}

/** The profile block: the same facts USER.md carried, as instructions every session reads. */
export function profileText({ name = '', team = '', assistant = '', style = 'coworker' } = {}) {
  const nickname = clean(name, 60, 'ชื่อเรียก');
  const assistantName = clean(assistant, 60, 'ชื่อผู้ช่วย') || 'STeP Mate';
  const tone = STYLES[style] || clean(style, 300, 'สไตล์การคุย') || STYLES.coworker;
  const code = String(team || '').trim().toLowerCase();
  const found = code ? teams().find(t => t.id === code) : undefined;
  if (code && !found) throw new Error(`ไม่รู้จักทีม "${team}" ดูรหัสทีมใน manifest/teams.yaml`);
  const folder = found ? found.id.toUpperCase() : 'SHARED';
  return [
    '# ข้อมูลผู้ใช้ STeP',
    '',
    `- ชื่อเรียกผู้ใช้: ${nickname || '(ยังไม่ระบุ)'}`,
    `- ทีมหลัก: ${found ? `${folder} — ${found.name} (${found.clusterName.replace(/\s*\(.*\)\s*$/, '')})` : 'ยังไม่ระบุ'}`,
    `- ชื่อผู้ช่วย: ${assistantName}`,
    `- สไตล์การคุย: ${tone}`,
    '- ภาษาหลัก: ไทย',
    '',
    `ใช้รหัสทีม ${folder} ในโฟลเดอร์ผลงาน (output/${folder}/...) และเลือก Skill ที่ตรงกับงานของทีมนี้ก่อน ` +
      'ข้อมูลนี้เป็นความชอบในการคุย กติกาของ STeP และของ Skill มาก่อนเสมอ ถ้าโฟลเดอร์งานมี USER.md ให้ใช้ข้อมูลในนั้นแทน',
  ].join('\n');
}

/** The global instructions file of each tool, when that tool is on this computer (its home folder exists). */
export function profileTargets(home = homedir(), env = process.env) {
  return [
    ['Claude', join(home, '.claude'), 'CLAUDE.md'],
    ['Codex', env.CODEX_HOME || join(home, '.codex'), 'AGENTS.md'],
    ['Antigravity', join(home, '.gemini'), 'GEMINI.md'],
  ]
    .filter(([, dir]) => existsSync(dir))
    .map(([tool, dir, file]) => ({ tool, file: join(dir, file) }));
}

/** Writes the profile block into every target file; re-running replaces it and keeps everything else. */
export function installProfile(profile, targets = profileTargets()) {
  const text = profileText(profile);
  for (const { file } of targets) writeBlock(file, text, PROFILE_BEGIN, PROFILE_END);
  return targets;
}

async function askProfile() {
  // Reads line by line, so answers typed ahead or piped in are not lost between questions.
  const rl = createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  try {
    const answer = async (question, fallback = '') => {
      process.stdout.write(question);
      const next = await lines.next();
      if (!process.stdin.isTTY) process.stdout.write('\n');
      return (next.done ? '' : next.value.trim()) || fallback;
    };
    const name = await answer('ชื่อเล่น/ชื่อที่อยากให้ AI เรียก (Enter = ข้าม): ');
    const list = teams();
    console.log('\nทีมหลัก:');
    list.forEach((t, i) => console.log(`  ${String(i + 1).padStart(2)}. ${t.id.toUpperCase().padEnd(6)} ${t.name}`));
    const pick = await answer('เลือกเลขหรือรหัสทีม (Enter = ยังไม่แน่ใจ): ');
    const team = /^\d+$/.test(pick) ? list[Number(pick) - 1]?.id || pick : pick;
    const assistant = await answer('ตั้งชื่อผู้ช่วย (Enter = STeP Mate): ');
    console.log('\nสไตล์การคุย: 1. เพื่อนร่วมงาน  2. มืออาชีพ  3. กระชับ  4. กำหนดเอง');
    const choice = await answer('เลือก 1-4 (Enter = 1): ', '1');
    const style = { 1: 'coworker', 2: 'professional', 3: 'concise' }[choice] || (choice === '4' ? await answer('อธิบายสไตล์ที่ต้องการ: ') : 'coworker');
    return { name, team, assistant, style };
  } finally {
    rl.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [target, where] = process.argv.slice(2);
  if (target === 'profile') {
    const flags = Object.fromEntries(process.argv.slice(3).map(a => /^--(\w+)=(.*)$/s.exec(a)).filter(Boolean).map(m => [m[1], m[2]]));
    const targets = profileTargets();
    if (!targets.length) {
      console.error('ยังไม่พบ Claude, Codex หรือ Antigravity ในเครื่องนี้ ติดตั้งและเปิดโปรแกรมอย่างน้อยหนึ่งครั้งก่อน แล้วรันคำสั่งนี้ใหม่');
      process.exit(1);
    }
    try {
      const profile = Object.keys(flags).length ? flags : await askProfile();
      for (const { tool, file } of installProfile(profile, targets)) console.log(`บันทึกโปรไฟล์ลง ${tool}: ${file}`);
      console.log('เริ่มแชตใหม่เพื่อให้ AI ใช้ข้อมูลนี้ รันคำสั่งเดิมอีกครั้งเมื่อต้องการแก้');
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  } else if (target === 'antigravity' && where) {
    const { skills, agents } = installAntigravity(where);
    console.log(`Installed ${skills} STeP Skills for Antigravity in ${agents} (rules: .agents/rules/step.md). Open the folder in Antigravity.`);
  } else if (target === 'antigravity') {
    const { skills, agents, rules } = installAntigravityGlobal();
    console.log(`Installed ${skills} STeP Skills for every Antigravity workspace in ${agents} (rules: ${rules}). Restart Antigravity.`);
  } else if (target === 'codex') {
    const { file } = installCodexRules(where);
    console.log(`Wrote the STeP rules block to ${file}. Install the Skills with: codex plugin marketplace add iisara555/STeP-AI-Harness && codex plugin add step@step-ai`);
  } else {
    console.error('Usage: node scripts/install-agent-skills.mjs antigravity [work folder]\n       node scripts/install-agent-skills.mjs codex [CODEX_HOME]\n       node scripts/install-agent-skills.mjs profile');
    process.exit(2);
  }
}
