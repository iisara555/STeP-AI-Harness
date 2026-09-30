import { copyRoleFiles, writeInstructionFile, buildLazyLoadingInventory, buildFirstWorkOnboardingContract } from './base.js';
import { buildRouterGuidelines } from '../router/index.js';
import { writeToolPermissions } from './tool-permissions.js';

/**
 * Generate CLAUDE.md content specifically tailored for Claude Code & Claude Desktop
 * @param {object} role 
 * @param {Array<{relativePath: string, type: string}>} files 
 * @returns {string}
 */
export function generateClaudeInstructions(role, files) {
  let text = `# CLAUDE.md — STeP AI Working Context\n\n`;
  text += `This project contains approved organizational skills and operating standards for **STeP / RSP North** (22 Teams across 5 Domain Clusters).\n`;
  text += `Active Role: **${role.id.toUpperCase()}** (${role.description})\n\n`;

  text += `## Core Principles & Safety Boundaries\n\n`;
  text += `- **Human Approval**: You assist in drafting, reviewing, and organizing, but human task owners must approve all decisions with real-world impact.\n`;
  text += `- **Confidentiality & Data Privacy**: Do NOT commit or disclose personal data, draft contracts, budgets, or credentials.\n`;
  text += `- **Tone of Voice**: Professional, clear, polite, and objective Thai language for STeP communication unless requested otherwise.\n\n`;

  text += `## 3-Layer Architecture & Progressive Disclosure\n\n`;
  text += `- **Claude Code routing hook:** when a context block titled "STeP routing gate" is present for the current prompt, it is the \`step-ai ask --json\` result for that prompt; follow it instead of running the command again. Without that block, run the Routing Gate yourself as below.\n`;
  text += buildRouterGuidelines({ format: 'compact' });
  text += `\n`;
  text += buildLazyLoadingInventory(files);
  text += buildFirstWorkOnboardingContract(role);

  text += `\n## CLI Integration Commands\n\n`;
  text += `- View STeP 22 teams: \`step-ai teams\`\n`;
  text += `- Check file integrity: \`step-ai status\`\n`;
  text += `- Sync latest skill updates: \`step-ai sync\`\n`;
  text += `- Verify environment: \`step-ai doctor\`\n`;

  return text;
}

export function getInstructionFiles(role, files) {
  const claudeContent = generateClaudeInstructions(role, files);
  return [
    { filename: 'CLAUDE.md', content: claudeContent },
    { filename: 'AGENTS.md', content: claudeContent },
  ];
}

export async function install({ workspaceDir, role, files, dryRun = false }) {
  const installedFiles = await copyRoleFiles(workspaceDir, files, dryRun);
  const instructions = getInstructionFiles(role, files);

  for (const inst of instructions) {
    const result = await writeInstructionFile(workspaceDir, inst.filename, inst.content, dryRun);
    installedFiles.push(result);
  }

  // Merged, not owned: the routing hook and allowlist live beside the user's own Claude settings.
  const toolPermissions = await writeToolPermissions(workspaceDir, dryRun, ['.claude/settings.json']);

  return { installedFiles, toolPermissions, instructionsFile: 'CLAUDE.md' };
}
