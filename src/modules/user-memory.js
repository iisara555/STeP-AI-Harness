import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathExists } from '../utils/file-ops.js';

export const USER_MEMORY_FILENAME = 'USER.md';

/**
 * Get absolute path to USER.md in target workspace
 * @param {string} workspaceDir
 * @returns {string}
 */
export function getUserMemoryPath(workspaceDir = process.cwd()) {
  return join(workspaceDir, USER_MEMORY_FILENAME);
}

/**
 * Generate starter markdown content for USER.md
 * @param {object} options
 * @param {string} [options.name] User name or nickname
 * @param {string} [options.team] Team code (e.g. afp, qs, piti, ga)
 * @param {string} [options.role] Role or position title
 * @param {string} [options.tone] Communication style preference
 * @param {string[]} [options.activeProjects] Active projects
 * @param {string[]} [options.frequentSkills] Frequently used skills
 * @returns {string}
 */
export function generateUserMemoryTemplate(options = {}) {
  const name = options.name || '';
  const team = options.team || '';
  const role = options.role || '';
  const tone = options.tone || 'สุภาพ เป็นกันเอง และกระชับตรงประเด็น';
  const projects = options.activeProjects || [];
  const skills = options.frequentSkills || [];

  let text = `# STeP User Memory (Private — Workspace Local)\n\n`;
  text += `> **ความเป็นส่วนตัว (Privacy Notice):**  \n`;
  text += `> ไฟล์นี้เก็บข้อมูลบริบทการทำงาน สไตล์ และโครงการส่วนบุคคลเพื่อช่วยให้ AI เข้าใจคุณได้ดียิ่งขึ้น  \n`;
  text += `> ไฟล์นี้อยู่ใน \`.gitignore\` เสมอ **ห้ามบันทึกรหัสผ่าน Token ความลับ หรือข้อมูลส่วนบุคคลจริง (PDPA) เด็ดขาด**\n\n`;

  text += `## 1. ข้อมูลผู้ใช้งาน (User Profile)\n`;
  text += `- **ชื่อ / ชื่อเรียก (Name/Nickname)**: ${name}\n`;
  text += `- **ทีมหลัก (Primary Team)**: ${team ? team.toUpperCase() : ''}\n`;
  text += `- **บทบาทหน้าที่ (Role/Function)**: ${role}\n`;
  text += `- **รูปแบบการสื่อสารที่ชอบ (Preferred Tone)**: ${tone}\n`;
  text += `- **ภาษาหลัก (Language)**: ภาษาไทย (Thai)\n\n`;

  text += `## 2. สไตล์และแนวทางการทำงาน (Working Preferences)\n`;
  text += `- **การจัดรูปแบบผลลัพธ์ (Output Format)**: ชอบแบบสรุปหัวข้อย่อยและตาราง Markdown\n`;
  text += `- **การตรวจทาน (Review Habits)**: ตรวจสอบความถูกต้องของร่างเอกสารก่อนส่งจริงเสมอ\n`;
  text += `- **ข้อจำกัดเฉพาะตัว (Custom Constraints)**: ปฏิบัติตามมาตรฐาน CMU / MHESI\n\n`;

  text += `## 3. โครงการและบริบทที่ทำอยู่ (Active Projects & Contexts)\n`;
  if (projects.length > 0) {
    for (const p of projects) {
      text += `- ${p}\n`;
    }
  } else {
    text += `- (ระบุโครงการที่กำลังรับผิดชอบ เพื่อให้ AI นำมาเป็นบริบทอัตโนมัติ)\n`;
  }
  text += `\n`;

  text += `## 4. ทักษะที่ใช้งานบ่อย (Frequently Used Skills)\n`;
  if (skills.length > 0) {
    for (const s of skills) {
      text += `- ${s}\n`;
    }
  } else {
    text += `- (AI จะบันทึกทักษะที่คุณเรียกใช้บ่อยให้อัตโนมัติ)\n`;
  }
  text += `\n`;

  text += `## 5. บันทึกเพิ่มเติมและการเรียนรู้ (Working Notes & Clarifications)\n`;
  text += `- AI จะอัปเดตส่วนนี้อย่างต่อเนื่องเมื่อคุณให้ข้อมูลหรือระบุสไตล์ใหม่ในแชท\n`;

  return text;
}

/**
 * Parse structured fields from USER.md markdown
 * @param {string} markdown 
 * @returns {{
 *   profile: { name: string, team: string, role: string, tone: string, language: string },
 *   preferences: Record<string, string>,
 *   activeProjects: string[],
 *   frequentSkills: string[],
 *   notes: string[]
 * }}
 */
export function parseUserMemory(markdown = '') {
  const result = {
    profile: {
      name: '',
      team: '',
      role: '',
      tone: '',
      language: '',
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

    if (trimmed.startsWith('## 1.')) {
      currentSection = 'profile';
      continue;
    } else if (trimmed.startsWith('## 2.')) {
      currentSection = 'preferences';
      continue;
    } else if (trimmed.startsWith('## 3.')) {
      currentSection = 'projects';
      continue;
    } else if (trimmed.startsWith('## 4.')) {
      currentSection = 'skills';
      continue;
    } else if (trimmed.startsWith('## 5.')) {
      currentSection = 'notes';
      continue;
    } else if (trimmed.startsWith('## ')) {
      currentSection = 'other';
      continue;
    }

    if (currentSection === 'profile') {
      const nameMatch = trimmed.match(/- \*\*ชื่อ.*?\*\*:\s*(.*)/i);
      if (nameMatch && nameMatch[1]) result.profile.name = nameMatch[1].trim();

      const teamMatch = trimmed.match(/- \*\*ทีมหลัก.*?\*\*:\s*(.*)/i);
      if (teamMatch && teamMatch[1]) result.profile.team = teamMatch[1].trim().toLowerCase();

      const roleMatch = trimmed.match(/- \*\*บทบาท.*?\*\*:\s*(.*)/i);
      if (roleMatch && roleMatch[1]) result.profile.role = roleMatch[1].trim();

      const toneMatch = trimmed.match(/- \*\*รูปแบบการสื่อสาร.*?\*\*:\s*(.*)/i);
      if (toneMatch && toneMatch[1]) result.profile.tone = toneMatch[1].trim();

      const langMatch = trimmed.match(/- \*\*ภาษาหลัก.*?\*\*:\s*(.*)/i);
      if (langMatch && langMatch[1]) result.profile.language = langMatch[1].trim();
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
 * Load User Memory from workspace if present
 * @param {string} workspaceDir 
 * @returns {Promise<{
 *   exists: boolean,
 *   rawText: string,
 *   filePath: string,
 *   profile: { name: string, team: string, role: string, tone: string, language: string },
 *   activeProjects: string[],
 *   frequentSkills: string[],
 *   notes: string[]
 * }>}
 */
export async function loadUserMemory(workspaceDir = process.cwd()) {
  const filePath = getUserMemoryPath(workspaceDir);
  const exists = await pathExists(filePath);

  if (!exists) {
    return {
      exists: false,
      rawText: '',
      filePath,
      profile: { name: '', team: '', role: '', tone: '', language: '' },
      activeProjects: [],
      frequentSkills: [],
      notes: [],
    };
  }

  try {
    const rawText = await readFile(filePath, 'utf-8');
    const parsed = parseUserMemory(rawText);
    return {
      exists: true,
      rawText,
      filePath,
      ...parsed,
    };
  } catch {
    return {
      exists: false,
      rawText: '',
      filePath,
      profile: { name: '', team: '', role: '', tone: '', language: '' },
      activeProjects: [],
      frequentSkills: [],
      notes: [],
    };
  }
}

/**
 * Save raw markdown text to USER.md
 * @param {string} workspaceDir 
 * @param {string} content 
 */
export async function saveUserMemory(workspaceDir = process.cwd(), content = '') {
  const filePath = getUserMemoryPath(workspaceDir);
  await writeFile(filePath, content, 'utf-8');
  await ensureGitignored(workspaceDir);
  return filePath;
}

/**
 * Initialize USER.md in workspace if it doesn't already exist
 * @param {string} workspaceDir 
 * @param {object} options 
 * @returns {Promise<{ created: boolean, filePath: string }>}
 */
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
 * Ensure USER.md and MEMORY.md are included in workspace .gitignore
 * @param {string} workspaceDir 
 * @returns {Promise<boolean>} Whether gitignore was updated
 */
export async function ensureGitignored(workspaceDir = process.cwd()) {
  const gitignorePath = join(workspaceDir, '.gitignore');
  if (!(await pathExists(gitignorePath))) {
    return false;
  }

  try {
    const content = await readFile(gitignorePath, 'utf-8');
    const lines = content.split(/\r?\n/).map((l) => l.trim());

    const missing = [];
    if (!lines.includes('USER.md') && !lines.includes('/USER.md')) {
      missing.push('USER.md');
    }
    if (!lines.includes('MEMORY.md') && !lines.includes('/MEMORY.md')) {
      missing.push('MEMORY.md');
    }

    if (missing.length > 0) {
      const addition = `\n# Private workspace user memory\n${missing.join('\n')}\n`;
      await writeFile(gitignorePath, content.trimEnd() + '\n' + addition, 'utf-8');
      return true;
    }
  } catch {
    // If reading fails, ignore
  }

  return false;
}
