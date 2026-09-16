import { platform, arch } from 'node:os';
import { detectWindowsTools } from './windows.js';
import { detectMacTools, getMacCpuArch } from './macos.js';

/**
 * Get current platform identifier ('darwin', 'win32', 'linux')
 * @returns {string}
 */
export function getPlatform() {
  return platform();
}

/**
 * Get a friendly human-readable platform description for employee display
 * @param {object} [options]
 * @param {string} [options.platform]
 * @param {string} [options.arch]
 * @returns {string}
 */
export function getPlatformDisplay(options = {}) {
  const p = options.platform || platform();
  const a = options.arch || arch();

  if (p === 'darwin') {
    return `macOS (${getMacCpuArch(a)})`;
  }
  if (p === 'win32') {
    return `Windows (${a})`;
  }
  if (p === 'linux') {
    return `Linux (${a})`;
  }
  return `${p} (${a})`;
}

/**
 * Unified tool detector delegating to platform-specific detection
 * @param {object} [options]
 * @param {string} [options.platform]
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
export async function detectTools(options = {}) {
  const p = options.platform || platform();

  if (p === 'darwin') {
    return detectMacTools(options);
  }
  if (p === 'win32') {
    return detectWindowsTools(options);
  }

  return detectWindowsTools(options);
}

/**
 * Get recommendations for AI tools, especially when none are installed
 * @param {object} [options]
 * @returns {Promise<Array<{ id: string, name: string, url: string, tier: string, tierDisplay: string, description: string, recommendation: string, installed: boolean }>>}
 */
export async function getToolRecommendations(options = {}) {
  const tools = await detectTools(options);
  return tools.map((t) => ({
    id: t.id,
    name: t.name,
    url: t.url,
    tier: t.tier,
    tierDisplay: t.tierDisplay,
    description: t.description,
    recommendation: t.recommendation,
    installed: t.installed,
  }));
}

/**
 * Get 3-Tier Categorized recommendations for guided wizard and onboarding
 * @param {object} [options]
 * @returns {Promise<{
 *   freeQuota: { title: string, description: string, tools: Array<object> },
 *   paidCommercial: { title: string, description: string, tools: Array<object> },
 *   localPrivacy: { title: string, description: string, tools: Array<object> }
 * }>}
 */
export async function getTieredRecommendations(options = {}) {
  const tools = await detectTools(options);
  return {
    freeQuota: {
      id: 'free_quota',
      title: 'สายฟรี / มี Quota ฟรี (Free Quota Tier)',
      description: 'เหมาะสำหรับพนักงานทั่วไป เริ่มต้นใช้งานได้ทันทีโดยไม่มีค่าใช้จ่าย',
      tools: tools.filter((t) => t.tier === 'free_quota'),
    },
    paidCommercial: {
      id: 'paid_commercial',
      title: 'สายจ่ายตังค์ / องค์กรจัดซื้อ (Paid / Commercial Tier)',
      description: 'สำหรับผู้มีสิทธิ์ใช้งาน Claude Pro, ChatGPT Plus/Team หรือ Google Antigravity & Spark',
      tools: tools.filter((t) => t.tier === 'paid_commercial'),
    },
    localPrivacy: {
      id: 'local_privacy',
      title: 'สาย Local AI / ข้อมูลปลอดภัย 100% (Local / Privacy Tier)',
      description: 'ประมวลผลภายในเครื่อง ปลอดภัยสูงสุดตามมาตรฐาน PDPA ไม่ส่งข้อมูลออกภายนอก',
      tools: tools.filter((t) => t.tier === 'local_privacy'),
    },
  };
}

export { detectWindowsTools, detectMacTools, getMacCpuArch };

