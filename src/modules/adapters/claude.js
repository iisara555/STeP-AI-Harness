import { copyRoleFiles, writeInstructionFile } from './base.js';
import { buildRouterGuidelines } from '../router/index.js';

/**
 * Generate CLAUDE.md content specifically tailored for Claude Code & Claude Desktop
 * @param {object} role 
 * @param {Array<{relativePath: string, type: string}>} files 
 * @returns {string}
 */
export function generateClaudeInstructions(role, files) {
  const skillFiles = files.filter((f) => f.type === 'skill' && f.relativePath.endsWith('SKILL.md'));
  const ruleFiles = files.filter((f) => f.type === 'rule');

  let text = `# CLAUDE.md — STeP AI Working Context\n\n`;
  text += `This project contains approved organizational skills and operating standards for **STeP / RSP North** (22 Teams across 5 Domain Clusters).\n`;
  text += `Active Role: **${role.id.toUpperCase()}** (${role.description})\n\n`;

  text += `## Core Principles & Safety Boundaries\n\n`;
  text += `- **Human Approval**: You assist in drafting, reviewing, and organizing, but human task owners must approve all decisions with real-world impact.\n`;
  text += `- **Confidentiality & Data Privacy**: Do NOT commit or disclose personal data, draft contracts, budgets, or credentials.\n`;
  text += `- **Tone of Voice**: Professional, clear, polite, and objective Thai language for STeP communication unless requested otherwise.\n\n`;

  text += `## 3-Layer Architecture & Progressive Disclosure\n\n`;
  text += buildRouterGuidelines();
  text += `\n`;

  text += `## Mandatory Rules to Enforce\n\n`;
  for (const r of ruleFiles) {
    text += `- \`${r.relativePath}\`\n`;
  }

  text += `\n## Approved Skills for this Context\n\n`;
  for (const s of skillFiles) {
    const skillName = s.relativePath.split('/')[2];
    text += `- **${skillName}**: Refer to \`${s.relativePath}\` for exact steps, checklist, and completion criteria.\n`;
  }

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

  return { installedFiles, instructionsFile: 'CLAUDE.md' };
}
