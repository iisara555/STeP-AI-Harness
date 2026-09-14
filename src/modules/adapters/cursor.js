import { copyRoleFiles, writeInstructionFile } from './base.js';

/**
 * Generate .cursorrules content optimized for Cursor IDE
 * @param {object} role 
 * @param {Array<{relativePath: string, type: string}>} files 
 * @returns {string}
 */
export function generateCursorRules(role, files) {
  const skillFiles = files.filter((f) => f.type === 'skill' && f.relativePath.endsWith('SKILL.md'));
  const ruleFiles = files.filter((f) => f.type === 'rule');

  let text = `# Cursor AI Rules — STeP AI Harness\n\n`;
  text += `You are an AI assistant configured for STeP / RSP North.\n`;
  text += `Role: ${role.id} (${role.description})\n\n`;

  text += `## Guidelines & Boundaries\n`;
  text += `- Always prioritize human approval for actionable decisions (procurement, official letters, deployment).\n`;
  text += `- Never expose or commit secrets, personal staff info, client data, or confidential contracts.\n`;
  text += `- When writing Thai documentation or official texts, adhere to official formats and professional tone.\n\n`;

  text += `## Rules\n`;
  for (const r of ruleFiles) {
    text += `- Read and follow: ${r.relativePath}\n`;
  }

  text += `\n## Available Skills\n`;
  for (const s of skillFiles) {
    const skillName = s.relativePath.split('/')[2];
    text += `- ${skillName}: ${s.relativePath}\n`;
  }

  return text;
}

export function getInstructionFiles(role, files) {
  const cursorContent = generateCursorRules(role, files);
  return [
    { filename: '.cursorrules', content: cursorContent },
    { filename: 'AGENTS.md', content: cursorContent },
  ];
}

export async function install({ workspaceDir, role, files, dryRun = false }) {
  const installedFiles = await copyRoleFiles(workspaceDir, files, dryRun);
  const instructions = getInstructionFiles(role, files);

  for (const inst of instructions) {
    const result = await writeInstructionFile(workspaceDir, inst.filename, inst.content, dryRun);
    installedFiles.push(result);
  }

  return { installedFiles, instructionsFile: '.cursorrules' };
}
