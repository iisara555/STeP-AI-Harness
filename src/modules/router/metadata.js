import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../role-resolver.js';
import { parseYamlInlineList, stripYamlScalar } from '../../utils/simple-yaml.js';

/**
 * Load router index skills from manifest/router-index.yaml
 */
export async function loadRouterIndex() {
  const routerPath = join(PACKAGE_ROOT, 'manifest', 'router-index.yaml');
  const text = await readFile(routerPath, 'utf-8');

  // Parse skills from router-index.yaml
  const lines = text.split(/\r?\n/);
  const skills = [];
  let current = null;
  let inScope = false;
  let currentScopeKey = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const nameMatch = line.match(/^ {2}- name:\s*([a-z0-9_-]+)/);
    if (nameMatch) {
      current = {
        name: nameMatch[1],
        cluster: '',
        domain: '',
        processId: '',
        teams: { primary: [], consumers: [] },
        description: '',
        intent: [],
        triggers: [],
        paths: [],
        fileTypes: [],
        scope: { allow: [], escalate: {}, human_only: {} },
      };
      skills.push(current);
      inScope = false;
      continue;
    }

    if (!current) continue;

    const clusterMatch = line.match(/^ {4}cluster:\s*([a-z0-9_-]+)/);
    if (clusterMatch) {
      current.cluster = clusterMatch[1];
      continue;
    }

    const domainMatch = line.match(/^ {4}domain:\s*([a-z0-9_-]+)/);
    if (domainMatch) {
      current.domain = domainMatch[1];
      continue;
    }

    const procMatch = line.match(/^ {4}processId:\s*([a-z0-9_.-]+)/);
    if (procMatch) {
      current.processId = procMatch[1];
      continue;
    }

    const descMatch = line.match(/^ {4}description:\s*(.+)/);
    if (descMatch) {
      current.description = descMatch[1].trim();
      continue;
    }

    const intentMatch = line.match(/^ {4}intent:\s*\[(.*?)\]/);
    if (intentMatch) {
      current.intent = parseYamlInlineList(intentMatch[1]);
      continue;
    }

    const triggersMatch = line.match(/^ {4}triggers:\s*\[(.*?)\]/);
    if (triggersMatch) {
      current.triggers = parseYamlInlineList(triggersMatch[1]);
      continue;
    }

    const pathsMatch = line.match(/^ {4}paths:\s*\[(.*?)\]/);
    if (pathsMatch) {
      current.paths = parseYamlInlineList(pathsMatch[1]);
      continue;
    }

    const fileTypesMatch = line.match(/^ {4}fileTypes:\s*\[(.*?)\]/);
    if (fileTypesMatch) {
      current.fileTypes = parseYamlInlineList(fileTypesMatch[1]);
      continue;
    }

    const primaryMatch = line.match(/^ {6}primary:\s*\[(.*?)\]/);
    if (primaryMatch) {
      current.teams.primary = parseYamlInlineList(primaryMatch[1]);
      continue;
    }

    const consumerMatch = line.match(/^ {6}consumers:\s*\[(.*?)\]/);
    if (consumerMatch) {
      current.teams.consumers = consumerMatch[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      continue;
    }

    if (line.match(/^ {4}scope:/)) {
      inScope = true;
      continue;
    }

    if (inScope) {
      if (line.match(/^ {6}allow:/)) {
        currentScopeKey = 'allow';
        continue;
      }
      if (line.match(/^ {6}escalate:/)) {
        currentScopeKey = 'escalate';
        continue;
      }
      if (line.match(/^ {6}human_only:/)) {
        currentScopeKey = 'human_only';
        continue;
      }

      const allowItemMatch = line.match(/^ {8}-\s*(.+)/);
      if (currentScopeKey === 'allow' && allowItemMatch) {
        current.scope.allow.push(allowItemMatch[1].trim());
        continue;
      }

      const mapKeyMatch = line.match(/^ {8}([a-z0-9_-]+):$/);
      if (mapKeyMatch) {
        current.scope[currentScopeKey][mapKeyMatch[1]] = {};
        continue;
      }
      const descLineMatch = line.match(/^ {10}description:\s*(.+)/);
      if (descLineMatch) {
        const lastKey = Object.keys(current.scope[currentScopeKey]).pop();
        if (lastKey) current.scope[currentScopeKey][lastKey].description = descLineMatch[1].trim();
        continue;
      }
      const roleLineMatch = line.match(/^ {10}role:\s*([a-z0-9_-]+)/);
      if (roleLineMatch) {
        const lastKey = Object.keys(current.scope[currentScopeKey]).pop();
        if (lastKey) current.scope[currentScopeKey][lastKey].role = roleLineMatch[1].trim();
        continue;
      }
      const authLineMatch = line.match(/^ {10}authority:\s*([a-z0-9_-]+)/);
      if (authLineMatch) {
        const lastKey = Object.keys(current.scope[currentScopeKey]).pop();
        if (lastKey) current.scope[currentScopeKey][lastKey].authority = authLineMatch[1].trim();
        continue;
      }
      const skillLineMatch = line.match(/^ {10}skill:\s*([a-z0-9_-]+)/);
      if (skillLineMatch) {
        const lastKey = Object.keys(current.scope[currentScopeKey]).pop();
        if (lastKey) current.scope[currentScopeKey][lastKey].skill = skillLineMatch[1].trim();
        continue;
      }
    }
  }

  return skills;
}

/**
 * Load human-readable names for teams from manifest/teams.yaml
 */
export async function loadTeamsDictionary() {
  const teamsPath = join(PACKAGE_ROOT, 'manifest', 'teams.yaml');
  const text = await readFile(teamsPath, 'utf-8');
  const dict = {};

  const lines = text.split(/\r?\n/);
  let curId = '';
  for (const line of lines) {
    const m = line.match(/^ {6}- id:\s*([a-z0-9_-]+)/);
    if (m) {
      curId = m[1];
      dict[curId] = { id: curId, name: curId, nameEn: '', clusterName: '' };
      continue;
    }
    if (!curId) continue;
    const nameM = line.match(/^ {8}name:\s*(.+)/);
    if (nameM) {
      dict[curId].name = nameM[1].trim();
      continue;
    }
    const nameEnM = line.match(/^ {8}nameEn:\s*(.+)/);
    if (nameEnM) {
      dict[curId].nameEn = nameEnM[1].trim();
      continue;
    }
  }

  return dict;
}

export async function loadSkillContextMetadata(skillName) {
  if (!skillName) return null;
  const text = await readFile(join(PACKAGE_ROOT, 'manifest', 'skills.yaml'), 'utf-8');
  const lines = text.split(/\r?\n/);
  let active = false;
  let inReferences = false;
  const result = { name: skillName, path: '', mandatory: [], optional: [] };

  for (const line of lines) {
    const key = line.match(/^  ([a-z0-9_-]+):\s*$/);
    if (key) {
      if (active && key[1] !== skillName) break;
      active = key[1] === skillName;
      inReferences = false;
      continue;
    }
    if (!active) continue;

    const pathMatch = line.match(/^    path:\s*(.+)/);
    if (pathMatch) {
      result.path = stripYamlScalar(pathMatch[1]);
      continue;
    }
    if (/^    references:/.test(line)) {
      inReferences = true;
      continue;
    }
    if (inReferences) {
      const mandatory = line.match(/^      mandatory:\s*\[(.*?)\]/);
      if (mandatory) result.mandatory = parseYamlInlineList(mandatory[1]);
      const optional = line.match(/^      optional:\s*\[(.*?)\]/);
      if (optional) result.optional = parseYamlInlineList(optional[1]);
    }
  }

  return result;
}

export async function loadDocumentContextMetadata(ids = []) {
  const wanted = new Set(ids || []);
  if (wanted.size === 0) return [];

  const text = await readFile(join(PACKAGE_ROOT, 'manifest', 'documents.yaml'), 'utf-8');
  const lines = text.split(/\r?\n/);
  const results = [];
  let current = null;

  for (const line of lines) {
    const key = line.match(/^  ([a-z0-9_-]+):\s*$/);
    if (key) {
      current = wanted.has(key[1])
        ? { id: key[1], title: '', path: '', status: '', authority: '', verification: '' }
        : null;
      if (current) results.push(current);
      continue;
    }
    if (!current) continue;

    const title = line.match(/^    title:\s*(.+)/);
    if (title) current.title = stripYamlScalar(title[1]);
    const pathMatch = line.match(/^    path:\s*(.+)/);
    if (pathMatch) current.path = stripYamlScalar(pathMatch[1]);
    const status = line.match(/^    status:\s*(.+)/);
    if (status) current.status = stripYamlScalar(status[1]);
    const governance = line.match(/^    (authority|verification):\s*(.+)/);
    if (governance) current[governance[1]] = stripYamlScalar(governance[2]);
  }

  return [...wanted].map((id) => results.find((ref) => ref.id === id)
    || { id, title: '', path: '', status: 'unregistered', authority: 'unverified', verification: '' });
}
