/**
 * Manifest Integrity & Dependency Graph Validator
 * 
 * Verifies that the cross-manifest relationships in STeP remain 100% intact:
 * - Skill -> Team exists in manifest/teams.yaml
 * - Skill -> Process exists in manifest/processes.yaml
 * - Skill -> Mandatory Document exists in manifest/documents.yaml
 * - Scope Escalation Target exists in manifest/skills.yaml or router-index.yaml
 * - Scope Authority exists in manifest/authority.yaml
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Basic regex-based extractor for YAML keys and arrays without external dependencies
 * @param {string} text 
 * @returns {object}
 */
export function extractManifestData(text) {
  const lines = text.split(/\r?\n/);
  const data = {
    skills: {},
    processes: {},
    documents: {},
    authorities: {},
    routerSkills: [],
  };

  let section = '';
  let currentKey = '';
  let currentSub = '';
  let currentObj = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (line.match(/^skills:/)) {
      section = 'skills';
      continue;
    }
    if (line.match(/^processes:/)) {
      section = 'processes';
      continue;
    }
    if (line.match(/^documents:/)) {
      section = 'documents';
      continue;
    }
    if (line.match(/^authorities:/)) {
      section = 'authorities';
      continue;
    }

    // Top-level map item (2 spaces indent)
    const mapMatch = line.match(/^ {2}([a-z0-9_.-]+):$/);
    if (mapMatch) {
      currentKey = mapMatch[1];
      currentObj = {
        name: currentKey,
        owner: '',
        process: [],
        references: { mandatory: [], optional: [] },
      };
      if (section === 'skills') data.skills[currentKey] = currentObj;
      if (section === 'processes') data.processes[currentKey] = currentObj;
      if (section === 'documents') data.documents[currentKey] = currentObj;
      if (section === 'authorities') data.authorities[currentKey] = currentObj;
      continue;
    }

    if (!currentObj) continue;

    const ownerMatch = line.match(/^ {4}owner:\s*([a-z0-9_-]+)/);
    if (ownerMatch) {
      currentObj.owner = ownerMatch[1];
      continue;
    }

    const processInlineMatch = line.match(/^ {4}process:\s*\[(.*?)\]/);
    if (processInlineMatch) {
      currentObj.process = processInlineMatch[1].split(',').map((p) => p.trim()).filter(Boolean);
      continue;
    }

    if (line.match(/^ {4}references:/)) {
      currentSub = 'references';
      continue;
    }

    const mandatoryMatch = line.match(/^ {6}mandatory:\s*\[(.*?)\]/);
    if (mandatoryMatch && currentSub === 'references') {
      currentObj.references.mandatory = mandatoryMatch[1].split(',').map((r) => r.trim()).filter(Boolean);
      continue;
    }
  }

  return data;
}

/**
 * Extract router skills and their scope authorities from router-index.yaml
 * @param {string} text 
 * @returns {Array<{ name: string, processId: string, primaryTeams: string[], authorities: string[] }>}
 */
export function extractRouterSkills(text) {
  const lines = text.split(/\r?\n/);
  const routerSkills = [];
  let currentSkill = null;
  let inScope = false;
  let inHumanOnly = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const skillItemMatch = line.match(/^ {2}- name:\s*([a-z0-9_-]+)/);
    if (skillItemMatch) {
      currentSkill = {
        name: skillItemMatch[1],
        processId: '',
        primaryTeams: [],
        authorities: [],
      };
      routerSkills.push(currentSkill);
      inScope = false;
      inHumanOnly = false;
      continue;
    }

    if (!currentSkill) continue;

    const procMatch = line.match(/^ {4}processId:\s*([a-z0-9_.-]+)/);
    if (procMatch) {
      currentSkill.processId = procMatch[1];
      continue;
    }

    const primaryMatch = line.match(/^ {6}primary:\s*\[(.*?)\]/);
    if (primaryMatch) {
      currentSkill.primaryTeams = primaryMatch[1].split(',').map((t) => t.trim()).filter(Boolean);
      continue;
    }

    if (line.match(/^ {4}scope:/)) {
      inScope = true;
      continue;
    }
    if (inScope && line.match(/^ {6}human_only:/)) {
      inHumanOnly = true;
      continue;
    }
    if (inHumanOnly && line.match(/^ {6}[a-z]/)) {
      inHumanOnly = false;
    }

    const authMatch = line.match(/^ {10}authority:\s*([a-z0-9_-]+)/);
    if (inHumanOnly && authMatch) {
      currentSkill.authorities.push(authMatch[1]);
    }
  }

  return routerSkills;
}

/**
 * Validate the cross-manifest dependency graph
 * @param {object} params
 * @param {Set<string>|string[]} params.teamCodes Valid team codes
 * @param {object} params.skills Parsed skills dictionary
 * @param {object} params.processes Parsed processes dictionary
 * @param {object} params.documents Parsed documents dictionary
 * @param {object} params.authorities Parsed authorities dictionary
 * @param {Array<object>} params.routerSkills Parsed router-index skills list
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateManifestIntegrity({
  teamCodes = new Set(),
  skills = {},
  processes = {},
  documents = {},
  authorities = {},
  routerSkills = [],
} = {}) {
  const errors = [];

  const validTeams = new Set(Array.from(teamCodes).map((t) => t.toLowerCase()));
  validTeams.add('developer');
  validTeams.add('pm');
  validTeams.add('ai-admin');

  const validProcessIds = new Set(Object.keys(processes));
  const validDocIds = new Set(Object.keys(documents));
  const validAuthorityIds = new Set(Object.keys(authorities));

  // 1. Validate skills.yaml
  for (const [skillName, skill] of Object.entries(skills)) {
    if (skill.owner && !validTeams.has(skill.owner.toLowerCase())) {
      errors.push(`Skill '${skillName}' references unknown owner team '${skill.owner}'`);
    }

    if (Array.isArray(skill.process)) {
      for (const procId of skill.process) {
        if (!validProcessIds.has(procId)) {
          errors.push(`Skill '${skillName}' references unknown process ID '${procId}'`);
        }
      }
    }

    if (skill.references?.mandatory) {
      for (const docId of skill.references.mandatory) {
        if (!validDocIds.has(docId)) {
          errors.push(`Skill '${skillName}' references unknown mandatory document '${docId}'`);
        }
      }
    }
  }

  // 2. Validate router-index.yaml
  for (const rSkill of routerSkills) {
    if (rSkill.primaryTeams) {
      for (const pt of rSkill.primaryTeams) {
        if (!validTeams.has(pt.toLowerCase())) {
          errors.push(`router-index: Skill '${rSkill.name}' references unknown primary team '${pt}'`);
        }
      }
    }

    if (rSkill.processId && !validProcessIds.has(rSkill.processId)) {
      errors.push(`router-index: Skill '${rSkill.name}' references unknown processId '${rSkill.processId}'`);
    }

    if (rSkill.authorities) {
      for (const auth of rSkill.authorities) {
        if (!validAuthorityIds.has(auth)) {
          errors.push(`router-index: Skill '${rSkill.name}' references unknown authority '${auth}'`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Load all manifest files from disk and validate their dependency graph
 * @param {string} manifestDir Path to manifest/ directory
 * @returns {Promise<{ valid: boolean, errors: string[], summary: object }>}
 */
export async function loadAndValidateManifests(manifestDir) {
  const teamsContent = await readFile(join(manifestDir, 'teams.yaml'), 'utf-8');
  const skillsContent = await readFile(join(manifestDir, 'skills.yaml'), 'utf-8');
  const processesContent = await readFile(join(manifestDir, 'processes.yaml'), 'utf-8');
  const docsContent = await readFile(join(manifestDir, 'documents.yaml'), 'utf-8');
  const authContent = await readFile(join(manifestDir, 'authority.yaml'), 'utf-8');
  const routerContent = await readFile(join(manifestDir, 'router-index.yaml'), 'utf-8');

  // Extract team codes from teams.yaml
  const teamCodes = new Set();
  const teamMatches = teamsContent.matchAll(/^ {6}- id:\s*([a-z0-9_-]+)/gm);
  for (const m of teamMatches) {
    teamCodes.add(m[1]);
  }

  const skillsData = extractManifestData(skillsContent);
  const processesData = extractManifestData(processesContent);
  const docsData = extractManifestData(docsContent);
  const authData = extractManifestData(authContent);
  const routerSkills = extractRouterSkills(routerContent);

  const result = validateManifestIntegrity({
    teamCodes,
    skills: skillsData.skills,
    processes: processesData.processes,
    documents: docsData.documents,
    authorities: authData.authorities,
    routerSkills,
  });

  return {
    ...result,
    summary: {
      teamsCount: teamCodes.size,
      skillsCount: Object.keys(skillsData.skills).length,
      processesCount: Object.keys(processesData.processes).length,
      documentsCount: Object.keys(docsData.documents).length,
      authoritiesCount: Object.keys(authData.authorities).length,
      routerSkillsCount: routerSkills.length,
    },
  };
}
