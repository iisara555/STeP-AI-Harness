export { getAvailableRoles, resolveRoleFiles } from './modules/role-resolver.js';
export { inspectWorkspace, readManifest, writeManifest } from './modules/manifest.js';
export { createSnapshot, listSnapshots, restoreSnapshot } from './modules/recovery.js';
export { getAdapter, isToolSupported, getSupportedTools } from './modules/adapters/index.js';
export { installForCodex, generateCodexInstructions } from './modules/adapter-codex.js';
export { calculateFileSha256, calculateSha256 } from './utils/checksum.js';
