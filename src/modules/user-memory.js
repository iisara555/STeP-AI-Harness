import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathExists } from '../utils/file-ops.js';

export const USER_MEMORY_FILENAME = 'USER.md';

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
  text += `- **การจัดรูปแบบผลลัพธ์ (Output Format)**: ชอบแบบสรุปหัวข้อย่อยและตาราง Markdown\n`;
  text += `- **การตรวจทาน (Review Habits)**: ตรวจสอบความถูกต้องของร่างเอกสารก่อนส่งจริงเสมอ\n`;
  text += `- **ข้อจำกัดเฉพาะตัว (Custom Constraints)**: ปฏิบัติตามมาตรฐาน CMU / MHESI\n\n`;

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

      const teamMatch = trimmed.match(/- \*\*ทีมหลัก.*?\*\*:\s*(.*)/i);
      if (teamMatch && teamMatch[1]) result.profile.team = teamMatch[1].trim().toLowerCase();

      const clusterMatch = trimmed.match(/- \*\*กลุ่มงานสำหรับ Routing.*?\*\*:\s*(.*)/i);
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
 * Load User Memory from workspace if present
 */
export async function loadUserMemory(workspaceDir = process.cwd()) {
  const filePath = getUserMemoryPath(workspaceDir);
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
  const filePath = getUserMemoryPath(workspaceDir);
  if (!(await pathExists(filePath))) return { updated: false, filePath };

  let content = await readFile(filePath, 'utf-8');
  const team = updates.team ? String(updates.team).toUpperCase() : '';
  const cluster = updates.cluster ? String(updates.cluster) : '';

  content = content.replace(
    /(- \*\*ทีมหลัก \(Primary Team\)\*\*:\s*).*$/m,
    `$1${team}`
  );
  content = content.replace(
    /(- \*\*กลุ่มงานสำหรับ Routing \(Routing Cluster\)\*\*:\s*).*$/m,
    `$1${cluster}`
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
      replacement
    );
  }

  await writeFile(filePath, content, 'utf-8');
  await ensureGitignored(workspaceDir);
  return { updated: true, filePath };
}

/** Save raw markdown text to USER.md */
export async function saveUserMemory(workspaceDir = process.cwd(), content = '') {
  const filePath = getUserMemoryPath(workspaceDir);
  await writeFile(filePath, content, 'utf-8');
  await ensureGitignored(workspaceDir);
  return filePath;
}

/** Initialize USER.md in workspace if it doesn't already exist */
export async function initUserMemory(workspaceDir = process.cwd(), options = {}) {
  const filePath = getUserMemoryPath(workspaceDir);
  const exists = await pathExists(filePath);

  if (exists) {
    await ensureGitignored(workspaceDir);
    return { created: false, filePath };
  }

  const content = generateUserMemoryTemplate(options);
  await writeFile(filePath, content, 'utf-8');
  await ensureGitignored(workspaceDir);
  return { created: true, filePath };
}

/**
 * Ensure USER.md and MEMORY.md are included in workspace .gitignore.
 *
 * These files hold the employee's own profile, so "always gitignored" has to be
 * true even in a workspace that has no .gitignore yet: a repository initialised
 * later would otherwise pick them up. Create the file when it is missing rather
 * than returning quietly.
 */
export async function ensureGitignored(workspaceDir = process.cwd()) {
  const gitignorePath = join(workspaceDir, '.gitignore');
  const header = '# Private workspace user memory';

  try {
    const exists = await pathExists(gitignorePath);
    const content = exists ? await readFile(gitignorePath, 'utf-8') : '';
    const lines = content.split(/\r?\n/).map((l) => l.trim());
    const missing = [];

    if (!lines.includes('USER.md') && !lines.includes('/USER.md')) missing.push('USER.md');
    if (!lines.includes('MEMORY.md') && !lines.includes('/MEMORY.md')) missing.push('MEMORY.md');

    if (missing.length === 0) return false;

    const addition = `${header}\n${missing.join('\n')}\n`;
    const body = content.trim() ? `${content.trimEnd()}\n\n${addition}` : addition;
    await writeFile(gitignorePath, body, 'utf-8');
    return true;
  } catch {
    // A workspace we cannot write to is left untouched; the caller reports it.
    return false;
  }
}
