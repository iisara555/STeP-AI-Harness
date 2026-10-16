import { readFile, writeFile, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathExists } from '../utils/file-ops.js';
import { safeWorkspacePath } from '../utils/workspace-path.js';

export const USER_MEMORY_FILENAME = 'USER.md';
const TONE_MAX = 300;

export const PERSONALITY_PRESETS = {
  coworker: {
    label: 'เพื่อนร่วมงาน',
    tone: 'เป็นกันเอง สุภาพ พูดธรรมชาติ ไม่ใช้ภาษาทางการเกินจำเป็น',
  },
  professional: {
    label: 'มืออาชีพ',
    tone: 'สุภาพ มีโครงสร้าง ชัดเจน เหมาะกับงานองค์กร',
  },
  concise: {
    label: 'กระชับ',
    tone: 'ตอบสั้น ตรงประเด็น เน้นสิ่งที่ต้องทำต่อ',
  },
  custom: {
    label: 'กำหนดเอง',
    tone: '',
  },
};

/**
 * Get absolute path to USER.md in target workspace
 * @param {string} workspaceDir
 * @returns {string}
 */
export function getUserMemoryPath(workspaceDir = process.cwd()) {
  return join(workspaceDir, USER_MEMORY_FILENAME);
}

export function getPersonalityPreset(key = 'coworker') {
  return PERSONALITY_PRESETS[key] || PERSONALITY_PRESETS.coworker;
}

/** Build assistant-only preferences. Employee profile data stays in USER.md. */
export function generateAssistantPreferences({ assistantName = 'STeP Mate', personality = 'coworker', assistantTone = '' } = {}) {
  const tones = { coworker: 'Friendly, polite and natural.', professional: 'Polite, structured and clear.', concise: 'Short and focused on next actions.' };
  const tone = personality === 'custom' ? String(assistantTone).slice(0, 300) : tones[personality] || tones.coworker;
  return '# Assistant Preferences\n\nThese are conversation preferences. Organization governance, current routing and permission mode take precedence.\n\n' +
    '- Assistant name: ' + String(assistantName).replace(/[\r\n]/g, ' ').slice(0, 60) + '\n- Conversation tone: ' + tone + '\n- Document style: follow the selected Skill and output style.\n';
}

/**
 * Generate starter markdown content for USER.md
 * @param {object} options
 * @param {string} [options.name] User name or nickname
 * @param {string} [options.team] Team code (e.g. afp, qs, piti, ga)
 * @param {string} [options.cluster] Routing cluster ID when team is not known yet
 * @param {string[]} [options.starterPrompts] Team-specific first-task examples
 * @param {string} [options.role] Role or position title
 * @param {string} [options.tone] Communication style preference
 * @param {string} [options.assistantName] Personal assistant display name
 * @param {'coworker'|'professional'|'concise'|'custom'} [options.personality]
 * @param {string} [options.assistantTone] Custom assistant conversation style
 * @param {boolean} [options.firstRunCompleted]
 * @param {string[]} [options.activeProjects] Active projects
 * @param {string[]} [options.frequentSkills] Frequently used skills
 * @returns {string}
 */
export function generateUserMemoryTemplate(options = {}) {
  const name = options.name || '';
  const team = options.team || '';
  const cluster = options.cluster || '';
  const starterPrompts = options.starterPrompts || [];
  const role = options.role || '';
  const personality = options.personality || 'coworker';
  const preset = getPersonalityPreset(personality);
  const assistantName = options.assistantName || 'STeP Mate';
  const assistantTone = options.assistantTone || preset.tone;
  const tone = options.tone || assistantTone;
  const firstRunCompleted = options.firstRunCompleted === true;
  const projects = options.activeProjects || [];
  const skills = options.frequentSkills || [];
  const preferences = Object.entries(options.preferences || {});
  const notes = options.notes || [];

  let text = `# STeP User Memory (Private — Workspace Local)\n\n`;
  text += `> **ความเป็นส่วนตัว (Privacy Notice):**  \n`;
  text += `> ไฟล์นี้เก็บข้อมูลบริบทการทำงาน สไตล์ และโครงการส่วนบุคคลเพื่อช่วยให้ AI เข้าใจคุณได้ดียิ่งขึ้น  \n`;
  text += `> ไฟล์นี้อยู่ใน \`.gitignore\` เสมอ **ห้ามบันทึกรหัสผ่าน Token ความลับ หรือข้อมูลส่วนบุคคลจริง (PDPA) เด็ดขาด**\n\n`;

  text += `## 1. ข้อมูลผู้ใช้งาน (User Profile)\n`;
  text += `- **ชื่อ / ชื่อเรียก (Name/Nickname)**: ${name}\n`;
  text += `- **ทีมหลัก (Primary Team)**: ${team ? team.toUpperCase() : ''}\n`;
  text += `- **กลุ่มงานสำหรับ Routing (Routing Cluster)**: ${cluster}\n`;
  text += `- **บทบาทหน้าที่ (Role/Function)**: ${role}\n`;
  text += `- **รูปแบบการสื่อสารที่ชอบ (Preferred Tone)**: ${tone}\n`;
  text += `- **ภาษาหลัก (Language)**: ภาษาไทย (Thai)\n\n`;

  text += `## 2. ผู้ช่วยส่วนตัว (Personal Assistant)\n`;
  text += `- **ชื่อผู้ช่วย (Assistant Name)**: ${assistantName}\n`;
  text += `- **บุคลิกผู้ช่วย (Personality)**: ${personality} (${preset.label})\n`;
  text += `- **รูปแบบการคุย (Conversation Style)**: ${assistantTone}\n`;
  text += `- **First Run Completed**: ${firstRunCompleted ? 'true' : 'false'}\n\n`;

  text += `## 3. สไตล์และแนวทางการทำงาน (Working Preferences)\n`;
  if (preferences.length > 0) {
    for (const [label, value] of preferences) text += `- **${label}**: ${value}\n`;
  } else {
    text += `- **การจัดรูปแบบผลลัพธ์ (Output Format)**: ชอบแบบสรุปหัวข้อย่อยและตาราง Markdown\n`;
    text += `- **การตรวจทาน (Review Habits)**: ตรวจสอบความถูกต้องของร่างเอกสารก่อนส่งจริงเสมอ\n`;
    text += `- **ข้อจำกัดเฉพาะตัว (Custom Constraints)**: ปฏิบัติตามมาตรฐาน CMU / MHESI\n`;
  }
  text += `\n`;

  text += `## 4. โครงการและบริบทที่ทำอยู่ (Active Projects & Contexts)\n`;
  if (projects.length > 0) {
    for (const p of projects) text += `- ${p}\n`;
  } else {
    text += `- (ระบุโครงการที่กำลังรับผิดชอบ เพื่อให้ AI นำมาเป็นบริบทอัตโนมัติ)\n`;
  }
  text += `\n`;

  text += `## 5. งานเริ่มต้นที่แนะนำ (Suggested First Tasks)\n`;
  if (starterPrompts.length > 0) {
    for (const prompt of starterPrompts.slice(0, 3)) text += `- ${prompt}\n`;
  } else {
    text += `- (เมื่อเริ่มงานจริง AI จะช่วยแนะนำตัวอย่างที่เหมาะกับงานของคุณ)\n`;
  }
  text += `\n`;

  text += `## 6. ทักษะที่ใช้งานบ่อย (Frequently Used Skills)\n`;
  if (skills.length > 0) {
    for (const s of skills) text += `- ${s}\n`;
  } else {
    text += `- (AI จะบันทึกทักษะที่คุณเรียกใช้บ่อยให้อัตโนมัติ)\n`;
  }
  text += `\n`;

  text += `## 7. บันทึกเพิ่มเติมและการเรียนรู้ (Working Notes & Clarifications)\n`;
  text += `- AI จะอัปเดตส่วนนี้อย่างต่อเนื่องเมื่อคุณให้ข้อมูลหรือระบุสไตล์ใหม่ในแชท\n`;
  for (const note of notes) text += `- ${note}\n`;

  return text;
}

/**
 * Parse structured fields from USER.md markdown.
 * Supports both legacy USER.md sections and the First Run Companion format.
 */
export function parseUserMemory(markdown = '') {
  const result = {
    profile: {
      name: '',
      team: '',
      cluster: '',
      role: '',
      tone: '',
      language: '',
    },
    assistant: {
      name: '',
      personality: '',
      tone: '',
      firstRunCompleted: null,
    },
    preferences: {},
    activeProjects: [],
    frequentSkills: [],
    notes: [],
  };

  if (!markdown) return result;

  const lines = markdown.split(/\r?\n/);
  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('## ')) {
      if (/ข้อมูลผู้ใช้งาน|User Profile/i.test(trimmed)) currentSection = 'profile';
      else if (/ผู้ช่วยส่วนตัว|Personal Assistant/i.test(trimmed)) currentSection = 'assistant';
      else if (/สไตล์และแนวทางการทำงาน|Working Preferences/i.test(trimmed)) currentSection = 'preferences';
      else if (/โครงการและบริบท|Active Projects/i.test(trimmed)) currentSection = 'projects';
      else if (/ทักษะที่ใช้งานบ่อย|Frequently Used Skills/i.test(trimmed)) currentSection = 'skills';
      else if (/บันทึกเพิ่มเติม|Working Notes/i.test(trimmed)) currentSection = 'notes';
      else currentSection = 'other';
      continue;
    }

    if (currentSection === 'profile') {
      const nameMatch = trimmed.match(/- \*\*ชื่อ.*?\*\*:\s*(.*)/i);
      if (nameMatch && nameMatch[1]) result.profile.name = nameMatch[1].trim();

      const teamMatch = trimmed.match(/- \*\*(?:ทีมหลัก|Primary Team).*?\*\*:\s*(.*)/i);
      if (teamMatch && teamMatch[1]) result.profile.team = teamMatch[1].trim().toLowerCase();

      const clusterMatch = trimmed.match(/- \*\*(?:กลุ่มงานสำหรับ Routing|Routing Cluster).*?\*\*:\s*(.*)/i);
      if (clusterMatch && clusterMatch[1]) result.profile.cluster = clusterMatch[1].trim().toLowerCase();

      const roleMatch = trimmed.match(/- \*\*บทบาท.*?\*\*:\s*(.*)/i);
      if (roleMatch && roleMatch[1]) result.profile.role = roleMatch[1].trim();

      const toneMatch = trimmed.match(/- \*\*รูปแบบการสื่อสาร.*?\*\*:\s*(.*)/i);
      if (toneMatch && toneMatch[1]) result.profile.tone = toneMatch[1].trim();

      const langMatch = trimmed.match(/- \*\*ภาษาหลัก.*?\*\*:\s*(.*)/i);
      if (langMatch && langMatch[1]) result.profile.language = langMatch[1].trim();
    } else if (currentSection === 'assistant') {
      const assistantNameMatch = trimmed.match(/- \*\*ชื่อผู้ช่วย.*?\*\*:\s*(.*)/i);
      if (assistantNameMatch && assistantNameMatch[1]) result.assistant.name = assistantNameMatch[1].trim();

      const personalityMatch = trimmed.match(/- \*\*บุคลิกผู้ช่วย.*?\*\*:\s*(.*)/i);
      if (personalityMatch && personalityMatch[1]) {
        const raw = personalityMatch[1].trim();
        result.assistant.personality = raw.split(/\s|\(/)[0].trim();
      }

      const assistantToneMatch = trimmed.match(/- \*\*รูปแบบการคุย.*?\*\*:\s*(.*)/i);
      if (assistantToneMatch && assistantToneMatch[1]) result.assistant.tone = assistantToneMatch[1].trim();

      const firstRunMatch = trimmed.match(/- \*\*First Run Completed\*\*:\s*(.*)/i);
      if (firstRunMatch && firstRunMatch[1]) {
        result.assistant.firstRunCompleted = /^(true|yes|1|completed|เสร็จ)$/i.test(firstRunMatch[1].trim());
      }
    } else if (currentSection === 'preferences') {
      const prefMatch = trimmed.match(/^- \*\*(.+?)\*\*:\s*(.*)$/);
      if (prefMatch) result.preferences[prefMatch[1].trim()] = prefMatch[2].trim();
    } else if (currentSection === 'projects') {
      if (trimmed.startsWith('-') && !trimmed.includes('(ระบุโครงการ')) {
        const item = trimmed.replace(/^-\s*/, '').trim();
        if (item) result.activeProjects.push(item);
      }
    } else if (currentSection === 'skills') {
      if (trimmed.startsWith('-') && !trimmed.includes('(AI จะบันทึก')) {
        const item = trimmed.replace(/^-\s*/, '').trim();
        if (item) result.frequentSkills.push(item);
      }
    } else if (currentSection === 'notes') {
      if (trimmed.startsWith('-') && !trimmed.includes('AI จะอัปเดตส่วนนี้')) {
        const item = trimmed.replace(/^-\s*/, '').trim();
        if (item) result.notes.push(item);
      }
    }
  }

  return result;
}

/**
 * First Run is opt-in only when the new USER.md explicitly contains
 * `First Run Completed: false`. Legacy USER.md files remain undisturbed.
 */
export function needsFirstRunCompanion(memory = {}) {
  return memory?.assistant?.firstRunCompleted === false;
}

/**
 * Read, change and replace USER.md as one transaction, also across processes (CLI and Desktop share the file).
 * Mirrors saveUserConfig: an exclusive lock file, a private temporary file and an atomic rename.
 * Never removes another writer's lock, even after a timeout or crash.
 * @param {string} filePath
 * @param {(existing: string|null) => string|null|Promise<string|null>} change returns the new text, or null to leave the file
 */
async function transformUserMemory(filePath, change) {
  const lockPath = filePath + '.lock';
  const deadline = Date.now() + 5000;
  let lock;
  while (!lock) {
    try {
      lock = await open(lockPath, 'wx', 0o600);
    } catch (error) {
      const busy = error.code === 'EEXIST' || (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code));
      if (!busy) throw error;
      if (Date.now() >= deadline) throw error.code === 'EEXIST' ? new Error('USER_MEMORY_BUSY') : error;
      await delay(25);
    }
  }
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    const existing = (await pathExists(filePath)) ? await readFile(filePath, 'utf-8') : null;
    const next = await change(existing);
    if (next === null || next === undefined) return { existing, written: false };
    await writeFile(temporary, next, { flag: 'wx', mode: 0o600 });
    const replacementDeadline = Date.now() + 3000;
    for (;;) {
      try {
        await rename(temporary, filePath);
        break;
      } catch (error) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || Date.now() >= replacementDeadline) throw error;
        await delay(25);
      }
    }
    return { existing, written: true };
  } finally {
    try {
      await rm(temporary, { force: true });
    } finally {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}

/**
 * Load User Memory from workspace if present
 */
export async function loadUserMemory(workspaceDir = process.cwd()) {
  const filePath = await safeWorkspacePath(workspaceDir, USER_MEMORY_FILENAME);
  const exists = await pathExists(filePath);
  const empty = parseUserMemory('');

  if (!exists) {
    return { exists: false, rawText: '', filePath, ...empty };
  }

  try {
    const rawText = await readFile(filePath, 'utf-8');
    const parsed = parseUserMemory(rawText);
    return { exists: true, rawText, filePath, ...parsed };
  } catch {
    return { exists: false, rawText: '', filePath, ...empty };
  }
}

/**
 * Update only the routing identity section of an existing USER.md.
 * Used when a deferred team selection is confirmed after installation.
 */
export async function updateUserMemoryProfile(workspaceDir = process.cwd(), updates = {}) {
  const filePath = await safeWorkspacePath(workspaceDir, USER_MEMORY_FILENAME);
  if (!(await pathExists(filePath))) return { updated: false, filePath };

  const { written } = await transformUserMemory(filePath, (existing) => existing === null ? null : applyProfileUpdates(existing, updates));
  if (!written) return { updated: false, filePath };
  await ensureGitignored(workspaceDir);
  return { updated: true, filePath };
}

function applyProfileUpdates(content, updates) {
  const team = updates.team ? String(updates.team).toUpperCase() : '';
  const cluster = updates.cluster ? String(updates.cluster) : '';

  const setProfileField = (text, pattern, canonicalLabel, value) => {
    // A function replacement keeps `$&` / `$$` in the value literal.
    if (pattern.test(text)) return text.replace(pattern, (_, label) => `${label}${value}`);
    const line = `- **${canonicalLabel}**: ${value}`;
    if (/^## 1\..*$/m.test(text)) {
      return text.replace(/^## 1\..*$/m, (heading) => `${heading}\n${line}`);
    }
    return `${text.trimEnd()}\n\n## 1. ข้อมูลผู้ใช้งาน (User Profile)\n${line}\n`;
  };

  content = setProfileField(
    content,
    /(- \*\*(?:ทีมหลัก(?: \(Primary Team\))?|Primary Team)\*\*:[ \t]*).*$/m,
    'ทีมหลัก (Primary Team)',
    team,
  );
  content = setProfileField(
    content,
    /(- \*\*(?:กลุ่มงานสำหรับ Routing(?: \(Routing Cluster\))?|Routing Cluster)\*\*:[ \t]*).*$/m,
    'กลุ่มงานสำหรับ Routing (Routing Cluster)',
    cluster,
  );

  if (Array.isArray(updates.starterPrompts)) {
    const prompts = updates.starterPrompts.slice(0, 3);
    const replacement = [
      '## 5. งานเริ่มต้นที่แนะนำ (Suggested First Tasks)',
      ...(prompts.length > 0
        ? prompts.map((prompt) => `- ${prompt}`)
        : ['- (เมื่อเริ่มงานจริง AI จะช่วยแนะนำตัวอย่างที่เหมาะกับงานของคุณ)']),
      '',
      '## 6. ทักษะที่ใช้งานบ่อย (Frequently Used Skills)',
    ].join('\n');

    content = content.replace(
      /## 5\. งานเริ่มต้นที่แนะนำ \(Suggested First Tasks\)[\s\S]*?## 6\. ทักษะที่ใช้งานบ่อย \(Frequently Used Skills\)/,
      () => replacement
    );
  }
  return content;
}

/**
 * Apply the First Run personalization (name, team, assistant name and conversation style)
 * to USER.md text, keeping every other section the employee has written.
 * A file without the Personal Assistant section is rebuilt from the template with its
 * existing profile, projects and skills.
 */
export function applyPersonalization(markdown = '', options = {}) {
  const personality = PERSONALITY_PRESETS[options.personality] ? options.personality : 'coworker';
  const preset = getPersonalityPreset(personality);
  const tone = (personality === 'custom' ? options.assistantTone : '') || preset.tone || options.assistantTone || '';
  const clean = (value, max = 200) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
  const name = clean(options.name), assistantName = clean(options.assistantName) || 'STeP Mate', team = clean(options.team);
  // The custom style field accepts 300 characters in Settings and ASSISTANT.md; USER.md keeps the same length.
  const style = clean(tone, TONE_MAX);

  const current = parseUserMemory(markdown);
  if (!markdown || !/ผู้ช่วยส่วนตัว|Personal Assistant/i.test(markdown)) {
    return generateUserMemoryTemplate({
      name: name || current.profile.name, team: team || current.profile.team, cluster: current.profile.cluster, role: current.profile.role,
      assistantName, personality, assistantTone: style, tone: style, firstRunCompleted: true,
      activeProjects: current.activeProjects, frequentSkills: current.frequentSkills,
      // Older USER.md files keep the employee's own working preferences and notes when upgraded.
      preferences: current.preferences, notes: current.notes,
    });
  }
  // A function replacement keeps `$&` / `$$` in names and styles literal.
  const set = (text, label, value) => text.replace(new RegExp(`(- \\*\\*${label}[^*]*\\*\\*:)[^\\n]*`), (_, prefix) => `${prefix} ${value}`);
  let text = markdown;
  text = set(text, 'ชื่อ / ชื่อเรียก', name || current.profile.name);
  if (options.team !== undefined) text = set(text, 'ทีมหลัก', team.toUpperCase());
  text = set(text, 'รูปแบบการสื่อสารที่ชอบ', style);
  text = set(text, 'ชื่อผู้ช่วย', assistantName);
  text = set(text, 'บุคลิกผู้ช่วย', `${personality} (${preset.label})`);
  text = set(text, 'รูปแบบการคุย', style);
  text = /- \*\*First Run Completed\*\*:/.test(text)
    ? set(text, 'First Run Completed', 'true')
    : text.replace(/(- \*\*รูปแบบการคุย[^\n]*)/, (line) => `${line}\n- **First Run Completed**: true`);
  return text;
}

/** Write the personalization to USER.md, creating the file when it does not exist yet. */
export async function savePersonalization(workspaceDir = process.cwd(), options = {}) {
  const filePath = await safeWorkspacePath(workspaceDir, USER_MEMORY_FILENAME);
  const { existing } = await transformUserMemory(filePath, (current) => applyPersonalization(current || '', options));
  await ensureGitignored(workspaceDir);
  return { filePath, created: !existing };
}

/** Save raw markdown text to USER.md */
export async function saveUserMemory(workspaceDir = process.cwd(), content = '') {
  const filePath = await safeWorkspacePath(workspaceDir, USER_MEMORY_FILENAME);
  await transformUserMemory(filePath, () => content);
  await ensureGitignored(workspaceDir);
  return filePath;
}

/** Initialize USER.md in workspace if it doesn't already exist */
export async function initUserMemory(workspaceDir = process.cwd(), options = {}) {
  const filePath = await safeWorkspacePath(workspaceDir, USER_MEMORY_FILENAME);
  // Created only when still missing inside the lock, so a parallel save is never replaced by the template.
  const { written } = await transformUserMemory(filePath, (existing) => existing === null ? generateUserMemoryTemplate(options) : null);
  await ensureGitignored(workspaceDir);
  return { created: written, filePath };
}

/**
 * Ensure profile, assistant and project-memory files are included in workspace .gitignore.
 *
 * These files hold the employee's own profile, so "always gitignored" has to be
 * true even in a workspace that has no .gitignore yet: a repository initialised
 * later would otherwise pick them up. Create the file when it is missing rather
 * than returning quietly.
 */
export async function ensureGitignored(workspaceDir = process.cwd(), { strict = false } = {}) {
  const gitignorePath = await safeWorkspacePath(workspaceDir, '.gitignore');
  const header = '# Private workspace user memory';

  try {
    const exists = await pathExists(gitignorePath);
    const content = exists ? await readFile(gitignorePath, 'utf-8') : '';
    const lines = content.split(/\r?\n/).map((l) => l.trim());
    // Git applies the last matching rule, so a later `!` negation (for example `!USER.md` or `!*.md`) re-includes
    // the file. A rule only counts when no negation follows it; otherwise it is appended again at the end.
    const lastNegation = lines.findLastIndex((l) => l.startsWith('!'));
    const ignored = (rule) => Math.max(lines.lastIndexOf(rule), lines.lastIndexOf('/' + rule)) > lastNegation;
    const missing = ['USER.md', 'MEMORY.md', 'ASSISTANT.md', '.step/memory/'].filter((rule) => !ignored(rule));

    if (missing.length === 0) return false;

    const addition = `${header}\n${missing.join('\n')}\n`;
    const body = content.trim() ? `${content.trimEnd()}\n\n${addition}` : addition;
    await writeFile(gitignorePath, body, 'utf-8');
    return true;
  } catch {
    if (strict) throw new Error('PRIVATE_FILES_NOT_IGNORED');
    // A workspace we cannot write to is left untouched; the caller reports it.
    return false;
  }
}
