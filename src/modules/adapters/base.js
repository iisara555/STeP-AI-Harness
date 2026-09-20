import { writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { safeCopyFile } from '../../utils/file-ops.js';
import { calculateFileSha256 } from '../../utils/checksum.js';

/**
 * Copy all resolved role files into workspace
 * @param {string} workspaceDir 
 * @param {Array<{relativePath: string, sourcePath: string, type: string}>} files 
 * @param {boolean} dryRun 
 * @returns {Promise<Array<{relativePath: string, sha256: string, size: number}>>}
 */
export async function copyRoleFiles(workspaceDir, files, dryRun = false) {
  const installedFiles = [];

  for (const f of files) {
    if (dryRun) {
      installedFiles.push({
        relativePath: f.relativePath,
        sha256: '(dry-run)',
        size: 0,
      });
      continue;
    }

    const destPath = join(workspaceDir, f.relativePath);
    await safeCopyFile(f.sourcePath, destPath);
    const hash = await calculateFileSha256(destPath);
    const fileStat = await stat(destPath);
    installedFiles.push({
      relativePath: f.relativePath,
      sha256: hash,
      size: fileStat.size,
    });
  }

  return installedFiles;
}

/**
 * Write an instruction file and calculate its hash
 * @param {string} workspaceDir 
 * @param {string} filename 
 * @param {string} content 
 * @param {boolean} dryRun 
 * @returns {Promise<{relativePath: string, sha256: string, size: number}>}
 */
export async function writeInstructionFile(workspaceDir, filename, content, dryRun = false) {
  if (dryRun) {
    return {
      relativePath: filename,
      sha256: '(dry-run)',
      size: Buffer.byteLength(content, 'utf-8'),
    };
  }

  const filePath = join(workspaceDir, filename);
  await writeFile(filePath, content, 'utf-8');
  const hash = await calculateFileSha256(filePath);
  const fileStat = await stat(filePath);

  return {
    relativePath: filename,
    sha256: hash,
    size: fileStat.size,
  };
}


/**
 * Build a compact installed-vs-loaded inventory for every AI adapter.
 * The instruction deliberately exposes counts, not individual Skill/Rule names,
 * so agents do not recursively inspect the workspace during First Run.
 */
export function buildLazyLoadingInventory(files = []) {
  const skillCount = files.filter((f) => f.type === 'skill' && f.relativePath.endsWith('SKILL.md')).length;
  const ruleCount = files.filter((f) => f.type === 'rule').length;

  let text = `## Installed ≠ Loaded — Lazy Context Contract\n\n`;
  text += `This workspace has **${skillCount} approved Skill files** and **${ruleCount} Rule files** installed locally. Installed files are NOT startup context.\n`;
  text += `- Do **not** enumerate Skill or Rule filenames in startup instructions.\n`;
  text += `- Do **not** recursively scan, glob, search, summarize, or index \`skills/\`, \`rules/\`, or \`manifest/\` during First Run.\n`;
  text += `- When the user gives a real task, inspect \`manifest/router-index.yaml\` only as needed to select the primary Skill.\n`;
  text += `- Then read only that Skill's \`SKILL.md\` and its mandatory references from \`manifest/skills.yaml\`.\n`;
  text += `- Load templates/examples only when the selected Skill or user request requires them.\n\n`;
  return text;
}

/**
 * Shared employee onboarding contract used by every AI adapter.
 * Keeps first-run behavior aligned across Cursor, Claude, Codex, ChatGPT, etc.
 */
export function buildFirstWorkOnboardingContract(role = {}) {
  const teamKnown = Boolean(role.isTeam && role.id && role.id !== 'all');
  const prompts = Array.isArray(role.starterPrompts) ? role.starterPrompts.slice(0, 3) : [];

  let text = `## First Work — Employee Handoff Contract\n\n`;
  text += `When the user says **"เริ่มใช้งาน STeP AI"** or opens this workspace for the first time, keep the introduction short. Do not scan Skills/Rules/Manifest recursively.\n`;

  if (teamKnown) {
    text += `- ทีมหลักที่ตั้งไว้: **${String(role.id).toUpperCase()} — ${role.name || role.description || role.id}**\n`;
    text += `- บอกผู้ใช้สั้น ๆ ว่า STeP AI รู้บริบททีมนี้แล้ว และเสนอ 3 งานเริ่มต้นด้านล่างโดยไม่โหลด Skill ทั้งหมด:\n`;
    prompts.forEach((prompt) => {
      text += `  - "${prompt}"\n`;
    });
    if (prompts.length === 0) {
      text += `  - ให้เสนอ 3 ตัวอย่างจากคำอธิบายงานของทีมโดยไม่แต่งกฎหรือ Source of Truth\n`;
    }
  } else {
    const cluster = role.selectedCluster || '';
    if (cluster) {
      text += `- ผู้ใช้เลือกกลุ่ม routing ไว้แล้ว: **${cluster}** แต่ยังไม่ได้เลือกทีม\n`;
    } else {
      text += `- ผู้ใช้ยังไม่ได้เลือกทีม และนี่เป็นสถานะที่ยอมรับได้สำหรับ First Run\n`;
    }
    text += `- เมื่อได้รับ **งานจริงครั้งแรก ให้ช่วยงานนั้นก่อน** อย่าหยุดเพื่อบังคับตั้งค่าโปรไฟล์\n`;
    text += `- หลังให้ผลลัพธ์แรกที่มีประโยชน์แล้ว ค่อยเสนอทีมที่น่าจะเกี่ยวข้องมากที่สุด 1 ทีม (ไม่เกิน 2 ถ้ายังคลุมเครือ) พร้อมเหตุผลสั้น ๆ\n`;
    text += `- ขอการยืนยันก่อนบันทึกทีม ห้ามเดาหรือเปลี่ยนทีมเงียบ ๆ\n`;
    text += `- เมื่อผู้ใช้ยืนยันและเครื่องมือเขียนไฟล์ได้ ให้ปรับ **Primary Team** ใน `USER.md`; สำหรับ CLI routing ให้แจ้งคำสั่ง `step-ai config --team <team-id>` หรือดำเนินการให้เมื่อมีสิทธิ์ใช้ terminal\n`;
    text += `- ถ้าผู้ใช้ยังไม่แน่ใจ ให้ทำงานต่อในโหมดกว้างได้ ไม่ต้องถามซ้ำทุกข้อความ\n`;
  }

  text += `\n`;
  return text;
}

