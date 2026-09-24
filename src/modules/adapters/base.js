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
  text += `Before asking users to attach documents, direct them to the local Check-Privacy-STeP-AI helper and read \`rules/data-classification.md\`. Attachments sent directly to an AI client bypass this scanner; an already attached file may already have left the device. Scan results never authorize external transmission.\n\n`;
  return text;
}

/**
 * Shared employee onboarding contract used by every AI adapter.
 * Keeps first-run behavior aligned across Cursor, Claude, Codex, ChatGPT, etc.
 */
export function buildFirstWorkOnboardingContract(role = {}) {
  const installTeam = Boolean(role.isTeam && role.id && role.id !== 'all')
    ? String(role.id).toUpperCase()
    : '';
  const installCluster = role.clusterId || role.selectedCluster || '';

  let text = `## First Work — Employee Handoff Contract\n\n`;
  text += `When the user says **"เริ่มใช้งาน STeP AI"** or opens this workspace for the first time, keep the introduction short. Do not scan Skills/Rules/Manifest recursively.\n`;
  text += `- Read only the routing identity, **Personal Assistant**, and **Suggested First Tasks** sections from \`USER.md\` if the file exists. Do not treat the rest of the workspace as startup context.\n`;
  text += `- **New user personalization:** If \`USER.md\` has \`First Run Completed: false\`, first ask in one short message for (1) the user's nickname, (2) the assistant name (STeP Mate / น้องสเต็ป / custom), and (3) the conversation style (coworker / professional / concise / custom). Always offer "ข้าม ตั้งค่าทีหลัง" and keep the defaults if skipped.\n`;
  text += `- After the user answers or skips, update the User Profile and Personal Assistant sections in \`USER.md\` and set \`First Run Completed: true\`. Do not ask for Role, Project, or Output Format during First Run.\n`;
  text += `- If the first message is a real task, help with that task first and offer personalization briefly afterwards. If \`First Run Completed\` is missing, treat it as a legacy USER.md and do not force onboarding.\n`;
  text += `- A non-empty **Primary Team** in \`USER.md\` is the current user choice and overrides any installation-time team hint below.\n`;

  if (installTeam) {
    text += `- Installation-time team hint: **${installTeam}**. If \`USER.md\` still has that team, say "ทีมคุณคือ ${installTeam}" and offer the 3 Suggested First Tasks from \`USER.md\`.\n`;
  } else if (installCluster) {
    text += `- Installation-time routing cluster hint: **${installCluster}**. Exact team selection was deferred.\n`;
  } else {
    text += `- No team was required during installation. This is a valid First Run state.\n`;
  }

  text += `- If \`USER.md\` has no Primary Team and the user already has a real task, **help with that task first**. Do not block work to configure a profile.\n`;
  text += `- After the first useful result, suggest the single most likely team (maximum 2 if genuinely ambiguous) with a short reason. Ask for confirmation before saving.\n`;
  text += `- After confirmation, update **Primary Team**, **Routing Cluster**, and **Suggested First Tasks** in \`USER.md\` when file writes are available. For CLI routing, use or tell the user \`step-ai config --team <team-id>\`.\n`;
  text += `- If the user remains unsure, continue in broad/cluster routing mode and do not ask again on every message.\n\n`;
  return text;
}
