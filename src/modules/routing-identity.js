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
  const broadAliases = new Set(['all', 'staff', 'shared', 'universal']);
  const validTeam = value => {
    const normalized = String(value || '').trim().toLowerCase();
    if (broadAliases.has(normalized)) return '';
    return knownTeams.has(normalized) ? normalized : '';
  };

  if (explicitTeam) {
    if (broadAliases.has(explicitTeam)) {
      return { team: '', cluster: explicitCluster, source: 'explicit' };
    }
    if (!knownTeams.has(explicitTeam)) {
      throw new Error(`Unknown team '${explicitTeam}'. Run 'step-ai teams' to see valid team IDs.`);
    }
    return { team: explicitTeam, cluster: explicitCluster, source: 'explicit' };
  }
  if (explicitCluster) {
    return { team: '', cluster: explicitCluster, source: 'explicit' };
  }

  const memory = await loadUserMemory(workspaceDir);
  const manifest = await readManifest(workspaceDir);
  const config = await loadUserConfig();

  const memoryTeam = validTeam(memory.profile?.team);
  const manifestTeam = validTeam(
    manifest?.team || (manifest?.targetType === 'team' ? manifest?.role : ''),
  );
  const globalTeam = validTeam(config.team);
  const teamValue = memoryTeam || manifestTeam || globalTeam;

  const memoryCluster = String(memory.profile?.cluster || '').trim().toLowerCase();
  const manifestCluster = String(manifest?.cluster || '').trim().toLowerCase();
  const globalCluster = String(config.cluster || '').trim().toLowerCase();
  const clusterValue = memoryCluster || manifestCluster || globalCluster;

  const source = memoryTeam
    ? 'USER.md'
    : manifestTeam
      ? 'manifest'
      : globalTeam
        ? 'global-config'
        : memoryCluster
          ? 'USER.md-cluster'
          : manifestCluster
            ? 'manifest-cluster'
            : 'global-config';

  return { team: teamValue, cluster: clusterValue, source };
}
