/**
 * Manifest Integrity & Dependency Graph Validator
 *
 * Cross-checks the STeP registries before a Pilot/Release:
 * - registered Skill -> owner/process/document/path exists
 * - Router Skill -> registered Skill/process/team exists
 * - Router consumer teams -> valid team or wildcard
 * - Scope escalation target -> registered Skill exists
 * - Human-only authority -> authority registry exists
 * - every registered user-facing Skill is reachable from the Router
 */

import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parsePlaybooksYaml, validatePlaybookRegistry } from '../playbooks/index.js';

export function extractManifestData(text) {
  const lines = text.split(/\r?\n/);
  const data = {
    skills: {},
    processes: {},
    documents: {},
    authorities: {},
  };

  let section = '';
  let currentObj = null;
  let currentSub = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (/^skills:/.test(line)) {
      section = 'skills';
      currentObj = null;
      continue;
    }
    if (/^processes:/.test(line)) {
      section = 'processes';
      currentObj = null;
      continue;
    }
    if (/^documents:/.test(line)) {
      section = 'documents';
      currentObj = null;
      continue;
    }
    if (/^authorities:/.test(line)) {
      section = 'authorities';
      currentObj = null;
      continue;
    }

    const mapMatch = line.match(/^ {2}([a-z0-9_.-]+):$/);
    if (mapMatch) {
      const key = mapMatch[1];
      currentObj = {
        name: key,
        owner: '',
        process: [],
        path: '',
        references: { mandatory: [], optional: [] },
      };
      currentSub = '';
      if (section === 'skills') data.skills[key] = currentObj;
      if (section === 'processes') data.processes[key] = currentObj;
      if (section === 'documents') data.documents[key] = currentObj;
      if (section === 'authorities') data.authorities[key] = currentObj;
      continue;
    }

    if (!currentObj) continue;

    const ownerMatch = line.match(/^ {4}owner:\s*([a-z0-9_-]+)/);
    if (ownerMatch) {
      currentObj.owner = ownerMatch[1];
      continue;
    }

    const pathMatch = line.match(/^ {4}path:\s*(.+)/);
    if (pathMatch) {
      currentObj.path = pathMatch[1].trim().replace(/^['"]|['"]$/g, '');
      continue;
    }

    const processInlineMatch = line.match(/^ {4}process:\s*\[(.*?)\]/);
    if (processInlineMatch) {
      currentObj.process = processInlineMatch[1].split(',').map((p) => p.trim()).filter(Boolean);
      continue;
    }

    const processScalarMatch = line.match(/^ {4}process:\s*([a-z0-9_.-]+)/);
    if (processScalarMatch) {
      currentObj.process = [processScalarMatch[1]];
      continue;
    }

    if (/^ {4}references:/.test(line)) {
      currentSub = 'references';
      continue;
    }

    const mandatoryMatch = line.match(/^ {6}mandatory:\s*\[(.*?)\]/);
    if (mandatoryMatch && currentSub === 'references') {
      currentObj.references.mandatory = mandatoryMatch[1].split(',').map((r) => r.trim()).filter(Boolean);
      continue;
    }

    const optionalMatch = line.match(/^ {6}optional:\s*\[(.*?)\]/);
    if (optionalMatch && currentSub === 'references') {
      currentObj.references.optional = optionalMatch[1].split(',').map((r) => r.trim()).filter(Boolean);
    }
  }

  return data;
}

export function extractRouterSkills(text) {
  const lines = text.split(/\r?\n/);
  const routerSkills = [];
  let currentSkill = null;
  let scopeSection = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const skillItemMatch = line.match(/^ {2}- name:\s*([a-z0-9_-]+)/);
    if (skillItemMatch) {
      currentSkill = {
        name: skillItemMatch[1],
        processId: '',
        primaryTeams: [],
        consumerTeams: [],
        authorities: [],
        escalationTargets: [],
      };
      routerSkills.push(currentSkill);
      scopeSection = '';
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
      currentSkill.primaryTeams = primaryMatch[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      continue;
    }

    const consumerMatch = line.match(/^ {6}consumers:\s*\[(.*?)\]/);
    if (consumerMatch) {
      currentSkill.consumerTeams = consumerMatch[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      continue;
    }

    if (/^ {4}scope:/.test(line)) {
      scopeSection = '';
      continue;
    }
    if (/^ {6}allow:/.test(line)) {
      scopeSection = 'allow';
      continue;
    }
    if (/^ {6}escalate:/.test(line)) {
      scopeSection = 'escalate';
      continue;
    }
    if (/^ {6}human_only:/.test(line)) {
      scopeSection = 'human_only';
      continue;
    }

    const skillTargetMatch = line.match(/^ {10}skill:\s*([a-z0-9_-]+)/);
    if (scopeSection === 'escalate' && skillTargetMatch) {
      currentSkill.escalationTargets.push(skillTargetMatch[1]);
      continue;
    }

    const authMatch = line.match(/^ {10}authority:\s*([a-z0-9_-]+)/);
    if (scopeSection === 'human_only' && authMatch) {
      currentSkill.authorities.push(authMatch[1]);
    }
  }

  return routerSkills;
}

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
  for (const special of ['developer', 'pm', 'ai-admin']) validTeams.add(special);

  const validProcessIds = new Set(Object.keys(processes));
  const validDocIds = new Set(Object.keys(documents));
  const validAuthorityIds = new Set(Object.keys(authorities));
  const validSkillIds = new Set(Object.keys(skills));
  const routerNames = routerSkills.map((s) => s.name);
  const routerNameSet = new Set(routerNames);

  if (routerNameSet.size !== routerNames.length) {
    const seen = new Set();
    for (const name of routerNames) {
      if (seen.has(name)) errors.push(`router-index: duplicate Skill '${name}'`);
      seen.add(name);
    }
  }

  for (const [skillName, skill] of Object.entries(skills)) {
    if (skill.owner && !validTeams.has(skill.owner.toLowerCase())) {
      errors.push(`Skill '${skillName}' references unknown owner team '${skill.owner}'`);
    }

    for (const procId of skill.process || []) {
      if (!validProcessIds.has(procId)) {
        errors.push(`Skill '${skillName}' references unknown process ID '${procId}'`);
      }
    }

    for (const docId of skill.references?.mandatory || []) {
      if (!validDocIds.has(docId)) {
        errors.push(`Skill '${skillName}' references unknown mandatory document '${docId}'`);
      }
    }

    if (skillName !== 'step-router' && !routerNameSet.has(skillName)) {
      errors.push(`Skill '${skillName}' is registered but unreachable from router-index`);
    }
  }

  for (const rSkill of routerSkills) {
    if (!validSkillIds.has(rSkill.name)) {
      errors.push(`router-index: Skill '${rSkill.name}' is not registered in skills.yaml`);
    }

    for (const pt of rSkill.primaryTeams || []) {
      if (!validTeams.has(pt.toLowerCase())) {
        errors.push(`router-index: Skill '${rSkill.name}' references unknown primary team '${pt}'`);
      }
    }

    for (const ct of rSkill.consumerTeams || []) {
      if (ct !== '*' && !validTeams.has(ct.toLowerCase())) {
        errors.push(`router-index: Skill '${rSkill.name}' references unknown consumer team '${ct}'`);
      }
    }

    if (rSkill.processId && !validProcessIds.has(rSkill.processId)) {
      errors.push(`router-index: Skill '${rSkill.name}' references unknown processId '${rSkill.processId}'`);
    }

    for (const auth of rSkill.authorities || []) {
      if (!validAuthorityIds.has(auth)) {
        errors.push(`router-index: Skill '${rSkill.name}' references unknown authority '${auth}'`);
      }
    }

    for (const target of rSkill.escalationTargets || []) {
      if (!validSkillIds.has(target)) {
        errors.push(`router-index: Skill '${rSkill.name}' escalates to unknown Skill '${target}'`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function loadAndValidateManifests(manifestDir) {
  const teamsContent = await readFile(join(manifestDir, 'teams.yaml'), 'utf-8');
  const skillsContent = await readFile(join(manifestDir, 'skills.yaml'), 'utf-8');
  const processesContent = await readFile(join(manifestDir, 'processes.yaml'), 'utf-8');
  const docsContent = await readFile(join(manifestDir, 'documents.yaml'), 'utf-8');
  const authContent = await readFile(join(manifestDir, 'authority.yaml'), 'utf-8');
  const routerContent = await readFile(join(manifestDir, 'router-index.yaml'), 'utf-8');
  const playbooksContent = await readFile(join(manifestDir, 'playbooks.yaml'), 'utf-8');

  const teamCodes = new Set();
  for (const m of teamsContent.matchAll(/^ {6}- id:\s*([a-z0-9_-]+)/gm)) teamCodes.add(m[1]);

  const skillsData = extractManifestData(skillsContent);
  const processesData = extractManifestData(processesContent);
  const docsData = extractManifestData(docsContent);
  const authData = extractManifestData(authContent);
  const routerSkills = extractRouterSkills(routerContent);
  const playbooks = parsePlaybooksYaml(playbooksContent);

  const result = validateManifestIntegrity({
    teamCodes,
    skills: skillsData.skills,
    processes: processesData.processes,
    documents: docsData.documents,
    authorities: authData.authorities,
    routerSkills,
  });

  const playbookTeams = new Set([...teamCodes, 'developer', 'pm', 'ai-admin']);
  const playbookResult = validatePlaybookRegistry(playbooks, {
    skills: new Set(Object.keys(skillsData.skills)),
    teams: playbookTeams,
  });

  const rootDir = join(manifestDir, '..');
  const pathErrors = [];

  for (const [skillName, skill] of Object.entries(skillsData.skills)) {
    if (!skill.path) {
      pathErrors.push(`Skill '${skillName}' has no path in skills.yaml`);
      continue;
    }
    if (skill.path.startsWith('/') || skill.path.includes('..')) {
      pathErrors.push(`Skill '${skillName}' has unsafe path '${skill.path}'`);
      continue;
    }
    if (!(await pathExists(join(rootDir, skill.path)))) {
      pathErrors.push(`Skill '${skillName}' path does not exist: ${skill.path}`);
    }
  }

  for (const [docId, doc] of Object.entries(docsData.documents)) {
    if (!doc.path) continue; // some controlled templates are external/not yet stored in repo
    if (doc.path.startsWith('/') || doc.path.includes('..')) {
      pathErrors.push(`Document '${docId}' has unsafe path '${doc.path}'`);
      continue;
    }
    if (!(await pathExists(join(rootDir, doc.path)))) {
      pathErrors.push(`Document '${docId}' path does not exist: ${doc.path}`);
    }
  }

  for (const playbook of playbooks) {
    if (!playbook.specPath) continue;
    if (playbook.specPath.startsWith('/') || playbook.specPath.includes('..')) {
      pathErrors.push(`Playbook '${playbook.id}' has unsafe specPath '${playbook.specPath}'`);
      continue;
    }
    if (!(await pathExists(join(rootDir, playbook.specPath)))) {
      pathErrors.push(`Playbook '${playbook.id}' specPath does not exist: ${playbook.specPath}`);
    }
  }

  const errors = [...result.errors, ...playbookResult.errors, ...pathErrors];

  return {
    valid: errors.length === 0,
    errors,
    summary: {
      teamsCount: teamCodes.size,
      skillsCount: Object.keys(skillsData.skills).length,
      processesCount: Object.keys(processesData.processes).length,
      documentsCount: Object.keys(docsData.documents).length,
      authoritiesCount: Object.keys(authData.authorities).length,
      routerSkillsCount: routerSkills.length,
      playbooksCount: playbooks.length,
    },
  };
}
