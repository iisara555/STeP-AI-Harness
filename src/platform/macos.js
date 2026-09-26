import { homedir, arch } from 'node:os';
import { join } from 'node:path';
import { pathExists } from '../utils/file-ops.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Get macOS CPU architecture description
 * @param {string} [overrideArch]
 * @returns {string}
 */
export function getMacCpuArch(overrideArch) {
  const a = overrideArch || arch();
  if (a === 'arm64') {
    return 'Apple Silicon (arm64)';
  }
  if (a === 'x64' || a === 'x86_64') {
    return 'Intel Mac (x86_64)';
  }
  return a;
}

/**
 * Detect installed AI tools on macOS across 8 categories
 * @param {object} [options]
 * @param {string} [options.home]
 * @returns {Promise<Array<{
 *   id: string,
 *   name: string,
 *   installed: boolean,
 *   url: string,
 *   tier: 'free_quota' | 'paid_commercial' | 'local_privacy',
 *   tierDisplay: string,
 *   description: string,
 *   recommendation: string,
 *   instructionFile: string
 * }>>}
 */
export async function detectMacTools(options = {}) {
  const home = options.home || homedir();

  const cursorPaths = [
    '/Applications/Cursor.app',
    join(home, 'Applications', 'Cursor.app'),
    join(home, 'Library', 'Application Support', 'Cursor'),
    join(home, '.cursor'),
  ];
  const opencodePaths = [
    '/Applications/OpenCode.app',
    join(home, 'Applications', 'OpenCode.app'),
    join(home, 'Library', 'Application Support', 'OpenCode'),
    join(home, '.opencode'),
  ];
  const claudePaths = [
    '/Applications/Claude.app',
    join(home, 'Applications', 'Claude.app'),
    join(home, 'Library', 'Application Support', 'Claude'),
    join(home, '.claude'),
    join(home, '.claude-code'),
  ];
  const chatgptPaths = [
    '/Applications/ChatGPT.app',
    join(home, 'Applications', 'ChatGPT.app'),
    join(home, 'Library', 'Application Support', 'ChatGPT'),
  ];
  const antigravityPaths = [
    join(home, '.gemini', 'antigravity-ide'),
    join(home, '.gemini'),
    '/Applications/Google Antigravity.app',
  ];
  const hermesPaths = [
    '/Applications/Hermes.app',
    join(home, 'Applications', 'Hermes.app'),
    join(home, '.hermes'),
    join(home, 'hermes'),
    join(home, 'Library', 'Application Support', 'hermes'),
  ];
  const windsurfPaths = [
    '/Applications/Windsurf.app',
    join(home, 'Applications', 'Windsurf.app'),
    join(home, 'Library', 'Application Support', 'Windsurf'),
    join(home, '.windsurf'),
  ];
  const codePaths = [
    '/Applications/Visual Studio Code.app',
    join(home, 'Applications', 'Visual Studio Code.app'),
    join(home, 'Library', 'Application Support', 'Code'),
    join(home, '.vscode'),
  ];

  let cursorFound = false;
  for (const p of cursorPaths) {
    if (await pathExists(p)) {
      cursorFound = true;
      break;
    }
  }

  let opencodeFound = false;
  for (const p of opencodePaths) {
    if (await pathExists(p)) {
      opencodeFound = true;
      break;
    }
  }
  if (!opencodeFound && !options.home) {
    try {
      await execFileAsync('which', ['opencode']);
      opencodeFound = true;
    } catch {
      opencodeFound = false;
    }
  }

  let claudeFound = false;
  for (const p of claudePaths) {
    if (await pathExists(p)) {
      claudeFound = true;
      break;
    }
  }
  if (!claudeFound && !options.home) {
    try {
      await execFileAsync('which', ['claude']);
      claudeFound = true;
    } catch {
      claudeFound = false;
    }
  }

  let chatgptFound = false;
  for (const p of chatgptPaths) {
    if (await pathExists(p)) {
      chatgptFound = true;
      break;
    }
  }
  if (!chatgptFound && !options.home) {
    try {
      await execFileAsync('which', ['chatgpt']);
      chatgptFound = true;
    } catch {
      chatgptFound = false;
    }
  }

  let antigravityFound = false;
  for (const p of antigravityPaths) {
    if (await pathExists(p)) {
      antigravityFound = true;
      break;
    }
  }
  if (!antigravityFound && !options.home) {
    try {
      await execFileAsync('which', ['agy']);
      antigravityFound = true;
    } catch {
      antigravityFound = false;
    }
    if (!antigravityFound) {
      try {
        await execFileAsync('which', ['gemini']);
        antigravityFound = true;
      } catch {
        antigravityFound = false;
      }
    }
  }

  let hermesFound = false;
  for (const p of hermesPaths) {
    if (await pathExists(p)) {
      hermesFound = true;
      break;
    }
  }
  if (!hermesFound && !options.home) {
    try {
      await execFileAsync('which', ['hermes']);
      hermesFound = true;
    } catch {
      try {
        await execFileAsync('which', ['hermes-agent']);
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
  if (!windsurfFound && !options.home) {
    try {
      await execFileAsync('which', ['windsurf']);
      windsurfFound = true;
    } catch {
      windsurfFound = false;
    }
  }

  let codexFound = false;
  for (const p of codePaths) {
    if (await pathExists(p)) {
      codexFound = true;
      break;
    }
  }
  if (!codexFound && !options.home) {
    try {
      await execFileAsync('which', ['code']);
      codexFound = true;
    } catch {
      codexFound = false;
    }
  }

  return [
    {
      id: 'cursor',
      name: 'Cursor IDE',
      installed: cursorFound,
      url: 'https://cursor.com',
      tier: 'free_quota',
      tierDisplay: 'สายฟรีมีโควตา (Free Quota)',
      description: 'AI Code & Document Editor ที่ฉลาดและใช้งานง่ายที่สุดสำหรับพนักงานทั่วไป',
      recommendation: 'ใช้บัญชี Cursor รุ่นฟรีได้ เปิดโฟลเดอร์ STeP AI แล้วคุยภาษาไทยได้',
      instructionFile: '.cursorrules',
    },
    {
      id: 'opencode',
      name: 'OpenCode AI Assistant',
      installed: opencodeFound,
      url: 'https://opencode.ai',
      tier: 'free_quota',
      tierDisplay: 'สายฟรีมีโควตา (Free Quota)',
      description: 'ผู้ช่วย AI พร้อมโควตาฟรี ใช้งานง่าย เหมาะสำหรับพนักงานที่เริ่มต้นใช้งาน',
      recommendation: 'ใช้โมเดลฟรีได้โดยไม่ต้องสมัคร เปิดในโฟลเดอร์ STeP AI',
      instructionFile: 'OPENCODE.md',
    },
    {
      id: 'claude',
      name: 'Claude Desktop / Claude Code',
      installed: claudeFound,
      url: 'https://claude.ai/download',
      tier: 'paid_commercial',
      tierDisplay: 'สายจ่ายตังค์ / องค์กรจัดซื้อ (Paid / Commercial)',
      description: 'ผู้ช่วย AI ชั้นนำด้านการเขียนภาษาไทย ร่างหนังสือราชการ และวิเคราะห์เอกสาร',
      recommendation: 'เหมาะสำหรับงานเอกสาร สรุปรายงาน และตรวจทานภาษาไทยขั้นสูง (Claude Pro/Team)',
      instructionFile: 'CLAUDE.md',
    },
    {
      id: 'chatgpt',
      name: 'ChatGPT Desktop',
      installed: chatgptFound,
      url: 'https://chatgpt.com',
      tier: 'paid_commercial',
      tierDisplay: 'สายจ่ายตังค์ / องค์กรจัดซื้อ (Paid / Commercial)',
      description: 'ChatGPT Desktop App สำหรับแชท วิเคราะห์ข้อมูล และทำงานร่วมกับไฟล์งาน',
      recommendation: 'เหมาะสำหรับผู้ใช้งาน ChatGPT Plus / Team หรือสิทธิ์องค์กร',
      instructionFile: 'CHATGPT.md',
    },
    {
      id: 'antigravity',
      name: 'Gemini CLI / Google Antigravity',
      installed: antigravityFound,
      url: 'https://github.com/google-gemini/gemini-cli',
      tier: 'free_quota',
      tierDisplay: 'สายฟรีมีโควตา (Free Quota)',
      description: 'ผู้ช่วย AI ของ Google ที่เปิดโฟลเดอร์งานได้ ใช้บัญชี Google รวมบัญชีที่ได้สิทธิ์นักศึกษา',
      recommendation: 'ล็อกอินด้วยบัญชี Google แล้วเลือกเชื่อถือโฟลเดอร์ STeP AI (Trust folder) เพื่อให้คำสั่ง step-ai รันได้โดยไม่ถามซ้ำ',
      instructionFile: 'GEMINI.md',
    },
    {
      id: 'hermes',
      name: 'Hermes Agent (Nous Research / Local AI)',
      installed: hermesFound,
      url: 'https://github.com/NousResearch/Hermes-Agent',
      tier: 'local_privacy',
      tierDisplay: 'สาย Local AI / ข้อมูลปลอดภัย 100% (Local / Privacy)',
      description: 'Open-Source AI Agent (Local AI) สำหรับประมวลผลภายในเครื่อง ปลอดภัยสูงสุดตามมาตรฐาน PDPA',
      recommendation: 'เหมาะสำหรับ Local AI, ความเป็นส่วนตัวข้อมูล และสายเทคนิค (pip install hermes-agent)',
      instructionFile: 'HERMES.md',
    },
    {
      id: 'windsurf',
      name: 'Windsurf AI IDE (Codeium)',
      installed: windsurfFound,
      url: 'https://codeium.com/windsurf',
      tier: 'free_quota',
      tierDisplay: 'สายฟรีมีโควตา (Free Quota)',
      description: 'AI IDE เจเนอเรชันใหม่พร้อมระบบ Cascade Agent ทำงานต่อเนื่องอัตโนมัติ',
      recommendation: 'ทางเลือกใหม่อันทรงพลังเทียบเคียง Cursor พร้อมโควตาฟรี',
      instructionFile: '.windsurfrules',
    },
    {
      id: 'codex',
      name: 'VS Code + GitHub Copilot',
      installed: codexFound,
      url: 'https://code.visualstudio.com',
      tier: 'free_quota',
      tierDisplay: 'สายฟรีมีโควตา (Free Quota)',
      description: 'VS Code กับ GitHub Copilot ใช้บัญชี GitHub รุ่นฟรีได้ และอ่านคำสั่งจาก .github/copilot-instructions.md',
      recommendation: 'เปิดโฟลเดอร์ STeP AI แล้วใช้โหมด Agent ใน Copilot Chat',
      instructionFile: '.github/copilot-instructions.md',
    },
  ];
}
