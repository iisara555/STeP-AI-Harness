import { copyRoleFiles, writeInstructionFile } from './base.js';
import { buildRouterGuidelines } from '../router/index.js';

/**
 * Generate HERMES.md content optimized for Nous Research Hermes Agent / Local AI
 * @param {object} role 
 * @param {Array<{relativePath: string, type: string}>} files 
 * @returns {string}
 */
export function generateHermesInstructions(role, files) {
  const skillFiles = files.filter((f) => f.type === 'skill' && f.relativePath.endsWith('SKILL.md'));
  const ruleFiles = files.filter((f) => f.type === 'rule');

  let text = `# Hermes Agent System Prompt — STeP AI Harness\n\n`;
  text += `You are the STeP AI Assistant running on Nous Research Hermes / Local AI architecture.\n`;
  text += `Organization: Science and Technology Park, Chiang Mai University (STeP / RSP North).\n`;
  text += `Assigned Primary Team: ${role.id} (${role.name || role.id}) — ${role.description || ''}\n\n`;

  text += `## Core Directives & Authority Boundaries\n`;
  text += `1. **Human-in-the-loop Mandate**: You are an advisory assistant. All legally binding actions, budget approvals, procurement awards, official sign-offs, and external disclosures REQUIRE explicit human staff authorization.\n`;
  text += `2. **Data Classification & Privacy**: Strictly protect CMU student/staff PII, citizen data under Thai PDPA, trade secrets of incubated startups, and private financial figures.\n`;
  text += `3. **Thai Official Standard**: Produce polite, structured, and formal Thai documentation matching CMU and Ministry of Higher Education, Science, Research and Innovation (MHESI / อว.) guidelines.\n\n`;

  text += `## 3-Layer Progressive Disclosure & Skill Router\n`;
  text += `Hermes Agent operates as Layer 1 Dynamic Router. Never load all organization skills into context at once.\n\n`;
  text += buildRouterGuidelines();
  text += `\n\n`;

  text += `## Active Organization Rules\n`;
  for (const r of ruleFiles) {
    text += `- [Rule] ${r.relativePath}: Read and enforce strictly.\n`;
  }

  text += `\n## Approved Organization Skills for Team ${role.id.toUpperCase()}\n`;
  for (const s of skillFiles) {
    const parts = s.relativePath.split('/');
    const skillName = parts.length >= 3 ? parts[2] : s.relativePath;
    text += `- **${skillName}**: Reference file at \`${s.relativePath}\`\n`;
  }

  text += `\n## Hermes Tool Calling Convention\n`;
  text += `When calling functions or routing requests to specialized skills:\n`;
  text += `1. Analyze user intent and team scope.\n`;
  text += `2. Read corresponding SKILL.md before generating complex output.\n`;
  text += `3. Follow boundary policies defined in rules/human-approval.md.\n`;

  return text;
}

export function getInstructionFiles(role, files) {
  const hermesContent = generateHermesInstructions(role, files);
  return [
    { filename: 'HERMES.md', content: hermesContent },
    { filename: 'AGENTS.md', content: hermesContent },
  ];
}

export async function install({ workspaceDir, role, files, dryRun = false }) {
  const installedFiles = await copyRoleFiles(workspaceDir, files, dryRun);
  const instructions = getInstructionFiles(role, files);

  for (const inst of instructions) {
    const result = await writeInstructionFile(workspaceDir, inst.filename, inst.content, dryRun);
    installedFiles.push(result);
  }

  return { installedFiles, instructionsFile: 'HERMES.md' };
}
