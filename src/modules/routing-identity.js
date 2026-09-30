import { loadUserConfig } from '../utils/user-config.js';
import { readManifest } from './manifest.js';
import { loadUserMemory } from './user-memory.js';
import { getAvailableTeams } from './role-resolver.js';

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
  const teams = await getAvailableTeams();
  const knownTeams = new Set(teams.map(item => item.id.toLowerCase()));
  const validTeam = value => {
    const normalized = String(value || '').trim().toLowerCase();
    return knownTeams.has(normalized) ? normalized : '';
  };

  if (explicitTeam) {
    if (!knownTeams.has(explicitTeam)) {
      throw new Error(`Unknown team '${explicitTeam}'. Run 'step-ai teams' to see valid team IDs.`);
    }
    return { team: explicitTeam, cluster: explicitCluster, source: 'explicit' };
  }
  if (explicitCluster) {
    return { team: '', cluster: explicitCluster, source: 'explicit' };
  }

  const memory = await loadUserMemory(workspaceDir);
  const memoryTeam = validTeam(memory.profile?.team);
  if (memoryTeam || memory.profile?.cluster) {
    return {
      team: memoryTeam,
      cluster: String(memory.profile.cluster || '').trim().toLowerCase(),
      source: memoryTeam ? 'USER.md' : 'USER.md-cluster',
    };
  }

  const manifest = await readManifest(workspaceDir);
  const manifestTeam = validTeam(
    manifest?.team || (manifest?.targetType === 'team' ? manifest?.role : ''),
  );
  const manifestCluster = String(manifest?.cluster || '').trim().toLowerCase();
  if (manifestTeam || manifestCluster) {
    return { team: manifestTeam, cluster: manifestCluster, source: 'manifest' };
  }

  const config = await loadUserConfig();
  return {
    team: validTeam(config.team),
    cluster: String(config.cluster || '').trim().toLowerCase(),
    source: 'global-config',
  };
}
