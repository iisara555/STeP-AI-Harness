import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathExists } from '../utils/file-ops.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Detect installed AI tools on Windows
 * @param {object} [options]
 * @param {string} [options.home]
 * @returns {Promise<Array<{
 *   id: string,
 *   name: string,
 *   installed: boolean,
 *   url: string,
 *   description: string,
 *   recommendation: string,
 *   instructionFile: string
 * }>>}
 */
export async function detectWindowsTools(options = {}) {
  const home = options.home || homedir();
  const appData = options.appData || (options.home ? join(home, 'AppData', 'Roaming') : (process.env.APPDATA || join(home, 'AppData', 'Roaming')));
  const localAppData = options.localAppData || (options.home ? join(home, 'AppData', 'Local') : (process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')));

  const codePaths = [
    join(appData, 'Code'),
    join(home, '.vscode'),
    join(localAppData, 'Programs', 'Microsoft VS Code'),
  ];
  const cursorPaths = [
    join(localAppData, 'Programs', 'cursor'),
    join(appData, 'Cursor'),
    join(home, '.cursor'),
  ];
  const claudePaths = [
    join(appData, 'Claude'),
    join(home, '.claude'),
    join(localAppData, 'Programs', 'Claude'),
  ];
  const hermesPaths = [
    join(home, '.hermes'),
    join(home, 'hermes'),
    join(localAppData, 'Programs', 'Hermes'),
    join(appData, 'Hermes'),
  ];
  const windsurfPaths = [
    join(localAppData, 'Programs', 'Windsurf'),
    join(appData, 'Windsurf'),
    join(home, '.windsurf'),
  ];

  let codexFound = false;
  for (const p of codePaths) {
    if (await pathExists(p)) {
      codexFound = true;
      break;
    }
  }

  let cursorFound = false;
  for (const p of cursorPaths) {
    if (await pathExists(p)) {
      cursorFound = true;
      break;
    }
  }

  let claudeFound = false;
  for (const p of claudePaths) {
    if (await pathExists(p)) {
      claudeFound = true;
      break;
    }
  }

  let hermesFound = false;
  for (const p of hermesPaths) {
    if (await pathExists(p)) {
      hermesFound = true;
      break;
    }
  }
  // If not found in paths and running without custom home override, check PATH via where
  if (!hermesFound && !options.home) {
    try {
      await execFileAsync('where', ['hermes']);
      hermesFound = true;
    } catch {
      try {
        await execFileAsync('where', ['hermes-agent']);
        hermesFound = true;
      } catch {
        hermesFound = false;
      }
    }
  }

  let windsurfFound = false;
  for (const p of windsurfPaths) {
    if (await pathExists(p)) {
      windsurfFound = true;
      break;
    }
  }

  return [
    {
      id: 'cursor',
      name: 'Cursor IDE',
      installed: cursorFound,
      url: 'https://cursor.com',
      description: 'AI Code & Document Editor ที่ฉลาดและใช้งานง่ายที่สุดสำหรับพนักงานทั่วไป',
      recommendation: '⭐ แนะนำอันดับ 1 (เปิดโฟลเดอร์แล้วเริ่มคุยภาษาไทยได้ทันที)',
      instructionFile: '.cursorrules',
    },
    {
      id: 'codex',
      name: 'OpenAI Codex / VS Code',
      installed: codexFound,
      url: 'https://code.visualstudio.com',
      description: 'Editor ยอดนิยมระดับสากล รองรับ GitHub Copilot และส่วนขยาย AI หลากหลาย',
      recommendation: 'เหมาะสำหรับผู้ที่มี VS Code อยู่แล้วและต้องการใช้ส่วนขยาย AI',
      instructionFile: 'CODEX_INSTRUCTIONS.md',
    },
    {
      id: 'claude',
      name: 'Claude Desktop / Claude Code',
      installed: claudeFound,
      url: 'https://claude.ai/download',
      description: 'ผู้ช่วย AI ด้านการเขียนภาษาไทย ร่างหนังสือราชการ และวิเคราะห์เอกสาร',
      recommendation: 'เหมาะสำหรับงานเอกสาร สรุปรายงาน และตรวจทานภาษาไทย',
      instructionFile: 'CLAUDE.md',
    },
    {
      id: 'hermes',
      name: 'Hermes Agent (Nous Research / Local AI)',
      installed: hermesFound,
      url: 'https://github.com/NousResearch/Hermes-Agent',
      description: 'สุดยอด Open-Source AI Agent (Local AI) สำหรับประมวลผลภายในเครื่อง ปลอดภัยสูงสุด',
      recommendation: 'เหมาะสำหรับ Local AI, ความเป็นส่วนตัวข้อมูล และสายเทคนิค (pip install hermes-agent)',
      instructionFile: 'HERMES.md',
    },
    {
      id: 'windsurf',
      name: 'Windsurf AI IDE (Codeium)',
      installed: windsurfFound,
      url: 'https://codeium.com/windsurf',
      description: 'AI IDE เจเนอเรชันใหม่พร้อมระบบ Cascade Agent ทำงานต่อเนื่องอัตโนมัติ',
      recommendation: 'ทางเลือกใหม่อันทรงพลังเทียบเคียง Cursor',
      instructionFile: '.windsurfrules',
    },
  ];
}
