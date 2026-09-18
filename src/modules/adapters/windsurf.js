import { copyRoleFiles, writeInstructionFile, buildLazyLoadingInventory } from './base.js';
import { buildRouterGuidelines } from '../router/index.js';

/**
 * Generate .windsurfrules content optimized for Windsurf AI IDE
 * @param {object} role 
 * @param {Array<{relativePath: string, type: string}>} files 
 * @returns {string}
 */
export function generateWindsurfRules(role, files) {
  let text = `# Windsurf AI Rules — STeP AI Harness\n\n`;
  text += `You are an AI assistant configured for STeP / RSP North (22 Teams across 5 Domain Clusters).\n`;
  text += `Role: ${role.id} (${role.name || role.id}) — ${role.description || ''}\n\n`;

  text += `## Guidelines & Boundaries\n`;
  text += `- Always prioritize human approval for actionable decisions (procurement, official letters, deployment).\n`;
  text += `- Never expose or commit secrets, personal staff info, client data, or confidential contracts.\n`;
  text += `- When writing Thai documentation or official texts, adhere to official formats and professional tone.\n\n`;

  text += `## 3-Layer Architecture & Progressive Disclosure\n\n`;
  text += buildRouterGuidelines({ format: 'compact' });
  text += `\n`;
  text += buildLazyLoadingInventory(files);

  return text;
}

export function getInstructionFiles(role, files) {
  const windsurfContent = generateWindsurfRules(role, files);
  return [
    { filename: '.windsurfrules', content: windsurfContent },
    { filename: 'AGENTS.md', content: windsurfContent },
  ];
}

export async function install({ workspaceDir, role, files, dryRun = false }) {
  const installedFiles = await copyRoleFiles(workspaceDir, files, dryRun);
  const instructions = getInstructionFiles(role, files);

  for (const inst of instructions) {
    const result = await writeInstructionFile(workspaceDir, inst.filename, inst.content, dryRun);
    installedFiles.push(result);
  }

  return { installedFiles, instructionsFile: '.windsurfrules' };
}
