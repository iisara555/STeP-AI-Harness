import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFilesRecursive, pathExists } from '../utils/file-ops.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = resolve(__dirname, '../../');

/**
 * Parse roles.yaml without external dependencies
 * @param {string} yamlText 
 * @returns {Array<{id: string, description: string, skills: string[], knowledge: string[]}>}
 */
export function parseRolesYaml(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const roles = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idMatch = line.match(/^ {2}- id:\s*([a-z0-9_-]+)/);
    if (idMatch) {
      if (current) roles.push(current);
      current = { id: idMatch[1], description: '', skills: [], knowledge: [] };
      continue;
    }

    if (!current) continue;

    const descMatch = line.match(/^ {4}description:\s*(.+)/);
    if (descMatch) {
      current.description = descMatch[1].trim();
      continue;
    }

    const skillsMatch = line.match(/^ {6}skills:\s*\[(.*?)\]/);
    if (skillsMatch) {
      current.skills = skillsMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
      continue;
    }

    const knowledgeMatch = line.match(/^ {6}knowledge:\s*\[(.*?)\]/);
    if (knowledgeMatch) {
      current.knowledge = knowledgeMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
      continue;
    }
  }

  if (current) roles.push(current);
  return roles;
}

/**
 * Load all roles from manifest/roles.yaml
 */
export async function getAvailableRoles() {
  const rolesPath = join(PACKAGE_ROOT, 'manifest', 'roles.yaml');
  const content = await readFile(rolesPath, 'utf-8');
  return parseRolesYaml(content);
}

/**
 * Resolve all files for a specific role
 * @param {string} roleId 
 * @returns {Promise<{
 *   role: { id: string, description: string, skills: string[], knowledge: string[] },
 *   files: Array<{ relativePath: string, sourcePath: string, type: 'skill'|'rule'|'doc' }>
 * }>}
 */
export async function resolveRoleFiles(roleId) {
  const roles = await getAvailableRoles();
  const role = roles.find((r) => r.id.toLowerCase() === roleId.toLowerCase());

  if (!role) {
    const available = roles.map((r) => r.id).join(', ');
    throw new Error(`Unknown role '${roleId}'. Available roles: ${available}`);
  }

  const files = [];

  // 1. Resolve skills for this role
  for (const group of role.skills) {
    const groupDir = join(PACKAGE_ROOT, 'skills', group);
    if (await pathExists(groupDir)) {
      const relFiles = await listFilesRecursive(groupDir);
      for (const rel of relFiles) {
        files.push({
          relativePath: `skills/${group}/${rel}`,
          sourcePath: join(groupDir, rel),
          type: 'skill',
        });
      }
    }
  }

  // 2. Resolve approved rules
  const rulesDir = join(PACKAGE_ROOT, 'rules');
  if (await pathExists(rulesDir)) {
    const relRules = await listFilesRecursive(rulesDir);
    for (const rel of relRules) {
      files.push({
        relativePath: `rules/${rel}`,
        sourcePath: join(rulesDir, rel),
        type: 'rule',
      });
    }
  }

  // 3. Resolve safe docs
  const safeDocs = [
    'step-context.md',
    'roles-and-ownership.md',
    'knowledge-policy.md',
    'teams.md',
    'step-router.md',
  ];
  for (const doc of safeDocs) {
    const docPath = join(PACKAGE_ROOT, 'docs', doc);
    if (await pathExists(docPath)) {
      files.push({
        relativePath: `docs/${doc}`,
        sourcePath: docPath,
        type: 'doc',
      });
    }
  }

  return { role, files };
}

/**
 * Parse teams.yaml without external dependencies
 * @param {string} yamlText 
 * @returns {Array<{
 *   id: string,
 *   name: string,
 *   nameEn: string,
 *   description: string,
 *   clusterId: string,
 *   clusterName: string,
 *   clusterRouter: string,
 *   skills: string[],
 *   paths: string[]
 * }>}
 */
export function parseTeamsYaml(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const teams = [];
  let currentCluster = { id: '', name: '', router: '' };
  let currentTeam = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Cluster header (starts with 2 spaces)
    const clusterIdMatch = line.match(/^ {2}- id:\s*([a-z0-9_-]+)/);
    if (clusterIdMatch && !line.startsWith('      - id:')) {
      if (currentTeam) teams.push(currentTeam);
      currentTeam = null;
      currentCluster = { id: clusterIdMatch[1], name: '', router: '' };
      continue;
    }
    const clusterNameMatch = line.match(/^ {4}name:\s*(.+)/);
    if (clusterNameMatch && !currentTeam) {
      currentCluster.name = clusterNameMatch[1].trim();
      continue;
    }
    const clusterRouterMatch = line.match(/^ {4}router:\s*(.+)/);
    if (clusterRouterMatch && !currentTeam) {
      currentCluster.router = clusterRouterMatch[1].trim();
      continue;
    }

    // Team header (starts with 6 spaces)
    const teamIdMatch = line.match(/^ {6}- id:\s*([a-z0-9_-]+)/);
    if (teamIdMatch) {
      if (currentTeam) teams.push(currentTeam);
      currentTeam = {
        id: teamIdMatch[1],
        name: '',
        nameEn: '',
        description: '',
        clusterId: currentCluster.id,
        clusterName: currentCluster.name,
        clusterRouter: currentCluster.router,
        skills: [],
        paths: [],
      };
      continue;
    }

    if (!currentTeam) continue;

    const nameMatch = line.match(/^ {8}name:\s*(.+)/);
    if (nameMatch) {
      currentTeam.name = nameMatch[1].trim();
      continue;
    }

    const nameEnMatch = line.match(/^ {8}nameEn:\s*(.+)/);
    if (nameEnMatch) {
      currentTeam.nameEn = nameEnMatch[1].trim();
      continue;
    }

    const descMatch = line.match(/^ {8}description:\s*(.+)/);
    if (descMatch) {
      currentTeam.description = descMatch[1].trim();
      continue;
    }

    const skillsMatch = line.match(/^ {8}skills:\s*\[(.*?)\]/);
    if (skillsMatch) {
      currentTeam.skills = skillsMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
      continue;
    }

    const pathsMatch = line.match(/^ {8}paths:\s*\[(.*?)\]/);
    if (pathsMatch) {
      currentTeam.paths = pathsMatch[1].split(',').map((p) => p.trim().replace(/['"]/g, '')).filter(Boolean);
      continue;
    }
  }

  if (currentTeam) teams.push(currentTeam);
  return teams;
}

/**
 * Load all 22 teams from manifest/teams.yaml
 */
export async function getAvailableTeams() {
  const teamsPath = join(PACKAGE_ROOT, 'manifest', 'teams.yaml');
  const content = await readFile(teamsPath, 'utf-8');
  return parseTeamsYaml(content);
}

/**
 * Resolve all files for a specific team
 * @param {string} teamCode 
 * @returns {Promise<{
 *   team: { id: string, name: string, nameEn: string, description: string, clusterId: string, clusterName: string, clusterRouter: string, skills: string[], paths: string[] },
 *   files: Array<{ relativePath: string, sourcePath: string, type: 'skill'|'rule'|'doc' }>
 * }>}
 */
export async function resolveTeamFiles(teamCode) {
  const teams = await getAvailableTeams();
  const team = teams.find((t) => t.id.toLowerCase() === teamCode.toLowerCase());

  if (!team) {
    const available = teams.map((t) => t.id).join(', ');
    throw new Error(`Unknown team '${teamCode}'. Available teams (22): ${available}`);
  }

  const files = [];

  // 1. Resolve skills for this team
  for (const group of team.skills) {
    const groupDir = join(PACKAGE_ROOT, 'skills', group);
    if (await pathExists(groupDir)) {
      const relFiles = await listFilesRecursive(groupDir);
      for (const rel of relFiles) {
        files.push({
          relativePath: `skills/${group}/${rel}`,
          sourcePath: join(groupDir, rel),
          type: 'skill',
        });
      }
    }
  }

  // 2. Resolve approved rules
  const rulesDir = join(PACKAGE_ROOT, 'rules');
  if (await pathExists(rulesDir)) {
    const relRules = await listFilesRecursive(rulesDir);
    for (const rel of relRules) {
      files.push({
        relativePath: `rules/${rel}`,
        sourcePath: join(rulesDir, rel),
        type: 'rule',
      });
    }
  }

  // 3. Resolve safe docs
  const safeDocs = [
    'step-context.md',
    'roles-and-ownership.md',
    'knowledge-policy.md',
    'teams.md',
    'step-router.md',
  ];
  for (const doc of safeDocs) {
    const docPath = join(PACKAGE_ROOT, 'docs', doc);
    if (await pathExists(docPath)) {
      files.push({
        relativePath: `docs/${doc}`,
        sourcePath: docPath,
        type: 'doc',
      });
    }
  }

  return { team, files };
}

