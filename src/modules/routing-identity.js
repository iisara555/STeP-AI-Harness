import { loadUserConfig } from '../utils/user-config.js';
import { readManifest } from './manifest.js';
import { loadUserMemory } from './user-memory.js';

/**
 * Resolve routing identity from the narrowest current-workspace source first.
 *
 * Explicit CLI flags win. USER.md is the employee's workspace-local choice,
 * then the managed workspace manifest, then ~/.step-ai/config.json as a default
 * for workspaces that have not been initialized yet.
 */
export async function resolveRoutingIdentity(
  workspaceDir = process.cwd(),
  { team = '', cluster = '' } = {},
) {
  const explicitTeam = String(team || '').trim().toLowerCase();
  const explicitCluster = String(cluster || '').trim().toLowerCase();

  if (explicitTeam) {
    return { team: explicitTeam, cluster: explicitCluster, source: 'explicit' };
  }
  if (explicitCluster) {
    return { team: '', cluster: explicitCluster, source: 'explicit' };
  }

  const memory = await loadUserMemory(workspaceDir);
  if (memory.profile?.team || memory.profile?.cluster) {
    return {
      team: String(memory.profile.team || '').trim().toLowerCase(),
      cluster: String(memory.profile.cluster || '').trim().toLowerCase(),
      source: 'USER.md',
    };
  }

  const manifest = await readManifest(workspaceDir);
  const manifestTeam = String(manifest?.team || (manifest?.targetType === 'team' ? manifest?.role : '') || '')
    .trim()
    .toLowerCase();
  const manifestCluster = String(manifest?.cluster || '').trim().toLowerCase();
  if (manifestTeam || manifestCluster) {
    return { team: manifestTeam, cluster: manifestCluster, source: 'manifest' };
  }

  const config = await loadUserConfig();
  return {
    team: String(config.team || '').trim().toLowerCase(),
    cluster: String(config.cluster || '').trim().toLowerCase(),
    source: 'global-config',
  };
}
