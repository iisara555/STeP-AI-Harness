export { getAvailableRoles, resolveRoleFiles, getAvailableTeams, resolveTeamFiles, parseTeamsYaml } from './modules/role-resolver.js';
export { inspectWorkspace, readManifest, writeManifest } from './modules/manifest.js';
export { createSnapshot, listSnapshots, restoreSnapshot } from './modules/recovery.js';
export { getAdapter, isToolSupported, getSupportedTools } from './modules/adapters/index.js';
export { installForCodex, generateCodexInstructions } from './modules/adapter-codex.js';
export { calculateFileSha256, calculateSha256 } from './utils/checksum.js';

export {
  OUTPUT_ROOT,
  sanitizeOutputSegment,
  normalizeExtension,
  inferOutputType,
  normalizeOutputType,
  normalizeTeamCode,
  buildOutputDirectory,
  buildOutputBaseName,
  getNextOutputPath,
  initOutputWorkspace,
} from './modules/output-manager.js';

export {
  DISTRIBUTION_DIRS,
  DISTRIBUTION_FILES,
  parseVersion,
  compareVersions,
  applyDistributionUpgrade,
  rollbackDistributionUpgrade,
} from './modules/distribution-upgrade.js';

export {
  parsePlaybooksYaml,
  loadPlaybooks,
  matchPlaybook,
  detectCompositePlaybook,
  buildPlaybookPlan,
  buildRunState,
  createPlaybookRun,
  readPlaybookRun,
  updatePlaybookRun,
  validatePlaybookRegistry,
} from './modules/playbooks/index.js';
