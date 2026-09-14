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
