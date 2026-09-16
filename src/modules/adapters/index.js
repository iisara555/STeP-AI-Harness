import * as codexAdapter from './codex.js';
import * as claudeAdapter from './claude.js';
import * as cursorAdapter from './cursor.js';
import * as hermesAdapter from './hermes.js';
import * as windsurfAdapter from './windsurf.js';
import * as opencodeAdapter from './opencode.js';
import * as geminiAdapter from './gemini.js';
import * as chatgptAdapter from './chatgpt.js';
import * as multiAdapter from './multi.js';

const ADAPTERS = {
  cursor: cursorAdapter,
  opencode: opencodeAdapter,
  claude: claudeAdapter,
  chatgpt: chatgptAdapter,
  antigravity: geminiAdapter,
  spark: geminiAdapter,
  gemini: geminiAdapter,
  hermes: hermesAdapter,
  windsurf: windsurfAdapter,
  codex: codexAdapter,
  all: multiAdapter,
  multi: multiAdapter,
  generic: multiAdapter,
};

/**
 * Get the adapter module for a given tool name
 * @param {string} toolName 
 */
export function getAdapter(toolName = 'codex') {
  const normalized = String(toolName).toLowerCase().trim();
  const adapter = ADAPTERS[normalized];
  if (!adapter) {
    const supported = getSupportedTools().join(', ');
    throw new Error(`Unsupported tool '${toolName}'. Supported tools: ${supported}`);
  }
  return adapter;
}

/**
 * Check if a tool is supported
 * @param {string} toolName 
 * @returns {boolean}
 */
export function isToolSupported(toolName) {
  if (!toolName) return false;
  return Boolean(ADAPTERS[String(toolName).toLowerCase().trim()]);
}

/**
 * Get list of all supported canonical tool names
 * @returns {string[]}
 */
export function getSupportedTools() {
  return [
    'cursor',
    'opencode',
    'claude',
    'chatgpt',
    'antigravity',
    'gemini',
    'hermes',
    'windsurf',
    'codex',
    'all',
  ];
}

export {
  codexAdapter,
  claudeAdapter,
  cursorAdapter,
  hermesAdapter,
  windsurfAdapter,
  opencodeAdapter,
  geminiAdapter,
  chatgptAdapter,
  multiAdapter,
};

