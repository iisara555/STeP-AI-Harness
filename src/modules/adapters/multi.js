import { copyRoleFiles, writeInstructionFile } from './base.js';
import { generateCodexInstructions } from './codex.js';
import { generateClaudeInstructions } from './claude.js';
import { generateCursorRules } from './cursor.js';
import { generateHermesInstructions } from './hermes.js';
import { generateWindsurfRules } from './windsurf.js';
import { generateOpenCodeInstructions } from './opencode.js';
import { generateGeminiInstructions } from './gemini.js';
import { generateChatGPTInstructions } from './chatgpt.js';

export function getInstructionFiles(role, files) {
  const codexContent = generateCodexInstructions(role, files);
  const claudeContent = generateClaudeInstructions(role, files);
  const cursorContent = generateCursorRules(role, files);
  const hermesContent = generateHermesInstructions(role, files);
  const windsurfContent = generateWindsurfRules(role, files);
  const opencodeContent = generateOpenCodeInstructions(role, files);
  const geminiContent = generateGeminiInstructions(role, files);
  const chatgptContent = generateChatGPTInstructions(role, files);

  return [
    { filename: 'CODEX_INSTRUCTIONS.md', content: codexContent },
    { filename: 'CLAUDE.md', content: claudeContent },
    { filename: '.cursorrules', content: cursorContent },
    { filename: '.windsurfrules', content: windsurfContent },
    { filename: 'HERMES.md', content: hermesContent },
    { filename: 'OPENCODE.md', content: opencodeContent },
    { filename: 'GEMINI.md', content: geminiContent },
    { filename: 'CHATGPT.md', content: chatgptContent },
    { filename: 'AGENTS.md', content: codexContent },
  ];
}

export async function install({ workspaceDir, role, files, dryRun = false }) {
  const installedFiles = await copyRoleFiles(workspaceDir, files, dryRun);
  const instructions = getInstructionFiles(role, files);

  for (const inst of instructions) {
    const result = await writeInstructionFile(workspaceDir, inst.filename, inst.content, dryRun);
    installedFiles.push(result);
  }

  return { installedFiles, instructionsFile: 'AGENTS.md (Multi-Agent)' };
}
