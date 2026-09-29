import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PACKAGE_ROOT } from '../../modules/role-resolver.js';
import { loadUserMemory } from '../../modules/user-memory.js';
import {
  loadPlaybooks,
  detectCompositePlaybook,
  buildPlaybookPlan,
} from '../../modules/playbooks/index.js';
import {
  buildContext,
  rankSkillCandidates,
  checkScope,
  deriveRoutingConfidence,
} from '../../modules/router/index.js';
import {
  buildCompactRoutingContract,
  buildContextBudgetPlan,
} from '../../modules/context-budget/index.js';
import { parseYamlInlineList, stripYamlScalar } from '../../utils/simple-yaml.js';
import { loadAuthorityRegistry, evaluateAuthorityPreflight } from '../../modules/router/authority-preflight.js';
import { evaluatePrivacyGate } from '../../modules/privacy/index.js';

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
      current.intent = intentMatch[1].split(',').map((i) => i.trim()).filter(Boolean);
      continue;
    }

    const triggersMatch = line.match(/^ {4}triggers:\s*\[(.*?)\]/);
    if (triggersMatch) {
      current.triggers = triggersMatch[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      continue;
    }

    const pathsMatch = line.match(/^ {4}paths:\s*\[(.*?)\]/);
    if (pathsMatch) {
      current.paths = pathsMatch[1].split(',').map((p) => p.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      continue;
    }

    const fileTypesMatch = line.match(/^ {4}fileTypes:\s*\[(.*?)\]/);
    if (fileTypesMatch) {
      current.fileTypes = fileTypesMatch[1].split(',').map((f) => f.trim()).filter(Boolean);
      continue;
    }

    const primaryMatch = line.match(/^ {6}primary:\s*\[(.*?)\]/);
    if (primaryMatch) {
      current.teams.primary = primaryMatch[1].split(',').map((t) => t.trim()).filter(Boolean);
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

/**
 * Programmatic query function for testing and external consumers
 * @param {string} query 
 * @param {object} options 
 * @returns {Promise<{
 *   query: string,
 *   selectedSkill: object,
 *   ranked: Array<object>,
 *   scopeResult: object,
 *   teamInfo: object
 * }>}
 */
export async function queryStepRouter(query, options = {}) {
  const originalQuery = query;
  if (typeof options.clarificationAnswer === 'string' && options.clarificationAnswer.trim()) {
    query = `${query}\nข้อมูลเพิ่มเติม: ${options.clarificationAnswer.trim()}`;
  }

  // The request itself is the one piece of text this command always handles, and
  // employees paste identifiers straight into it. Scan before anything is routed,
  // reported or persisted, and route on the redacted text so a pasted identifier
  // never reaches a Skill, a log line or a diagnostic.
  const privacy = evaluatePrivacyGate(query);
  query = privacy.redactedText;

  const skills = await loadRouterIndex();
  const teams = await loadTeamsDictionary();
  const playbooks = await loadPlaybooks(PACKAGE_ROOT);
  const authorities = await loadAuthorityRegistry(PACKAGE_ROOT);
  const authorityPreflight = evaluateAuthorityPreflight(query, authorities);

  let resolvedTeam = options.team || '';
  let resolvedCluster = options.cluster || '';
  let userMemory = null;
  if (!resolvedTeam || !resolvedCluster) {
    try {
      userMemory = await loadUserMemory(options.workspaceDir || process.cwd());
      if (!resolvedTeam && userMemory?.profile?.team) {
        resolvedTeam = userMemory.profile.team;
      }
      if (!resolvedCluster && userMemory?.profile?.cluster) {
        resolvedCluster = userMemory.profile.cluster;
      }
    } catch {
      // ignore memory read error
    }
  }

  const context = buildContext({
    promptText: query,
    path: options.path || '',
    filenames: options.filenames || [],
    team: resolvedTeam,
    cluster: resolvedCluster,
  });

  const ranked = rankSkillCandidates(skills, context);
  // An employee who invokes a routed Skill by name skips scoring and playbooks, never
  // the authority preflight or the Skill's own scope check below.
  const explicitSkillName = typeof options.skill === 'string' && skills.some((skill) => skill.name === options.skill) ? options.skill : '';
  const playbookMatch = options.disablePlaybooks || explicitSkillName ? null : detectCompositePlaybook(playbooks, originalQuery, {
    clarificationAnswer: options.clarificationAnswer,
  });
  const competingPlaybooks = playbookMatch?.ambiguous ? playbookMatch.candidates : [];
  const selectedPlaybook = playbookMatch?.playbook || null;
  const playbookPlan = selectedPlaybook
    ? buildPlaybookPlan(selectedPlaybook, playbookMatch.matchedSignals)
    : [];

  let bestMatch = ranked[0] || null;
  let runnerUp = ranked[1] || null;
  let selectedSkill = null;

  if (selectedPlaybook) {
    const firstSkillStep = playbookPlan.find((step) => step.type === 'skill' && step.skill);
    const primarySkillName = firstSkillStep?.skill || '';
    selectedSkill = skills.find((skill) => skill.name === primarySkillName) || null;
    const primaryRank = ranked.find((item) => item.skill === primarySkillName);
    if (primaryRank) bestMatch = primaryRank;
  } else if (bestMatch && competingPlaybooks.length === 0) {
    selectedSkill = skills.find((skill) => skill.name === bestMatch.skill);
  }

  // An employee who picked from the clarification menu has already told us the
  // route; honouring it here stops the router asking the same question again.
  const chosenSkillName = explicitSkillName || (selectedPlaybook || competingPlaybooks.length
    ? ''
    : resolveSkillMenuChoice(options.clarificationAnswer, ranked, skills));
  if (chosenSkillName) {
    const chosenSkill = skills.find((skill) => skill.name === chosenSkillName);
    const chosenRank = ranked.find((item) => item.skill === chosenSkillName);
    if (chosenSkill) {
      selectedSkill = chosenSkill;
      if (chosenRank) bestMatch = chosenRank;
    }
  }

  const preflightPlaybookStep = selectedPlaybook
    ? playbookPlan.find((step) => step.type === 'skill' && step.skill)?.id || ''
    : '';
  const hasGlobalAuthorityBlock = authorityPreflight.status === 'BLOCK';

  let scopeResult = hasGlobalAuthorityBlock
    ? {
        ...authorityPreflight,
        ...(selectedPlaybook
          ? { playbookStep: preflightPlaybookStep, playbookId: selectedPlaybook.id }
          : {}),
      }
    : (selectedSkill ? checkScope(selectedSkill, query) : { status: 'ALLOW', inScope: true });

  if ((selectedPlaybook || competingPlaybooks.length) && !hasGlobalAuthorityBlock) {
    // The initially selected Skill is normally the first Playbook Skill.
    // Preserve its local BLOCK/ESCALATE provenance instead of dropping the step id.
    if (scopeResult.status !== 'ALLOW' && preflightPlaybookStep) {
      scopeResult = {
        ...scopeResult,
        playbookStep: preflightPlaybookStep,
        playbookId: selectedPlaybook.id,
      };
    }

    const scopePlans = selectedPlaybook
      ? [{ playbook: selectedPlaybook, plan: playbookPlan }]
      : competingPlaybooks.map((match) => ({
        playbook: match.playbook,
        plan: buildPlaybookPlan(match.playbook, match.matchedSignals),
      }));
    for (const { playbook, plan } of scopePlans) {
      for (const step of plan) {
        if (step.type !== 'skill' || !step.skill) continue;
        const stepSkill = skills.find((skill) => skill.name === step.skill);
        if (!stepSkill) continue;
        const stepScope = checkScope(stepSkill, query);
        if (stepScope.status === 'BLOCK') {
          scopeResult = { ...stepScope, playbookStep: step.id, playbookId: playbook.id };
          break;
        }
        if (
          stepScope.status === 'ESCALATE' &&
          stepScope.targetSkill === step.skill &&
          scopeResult.status === 'ALLOW'
        ) {
          scopeResult = { ...stepScope, playbookStep: step.id, playbookId: playbook.id };
        }
      }
      if (scopeResult.status === 'BLOCK') break;
    }
  }

  const primaryTeamCode = selectedPlaybook?.owner || selectedSkill?.teams?.primary?.[0] || 'common';
  const teamInfo = teams[primaryTeamCode] || { id: primaryTeamCode, name: primaryTeamCode };

  const routingConfidence = competingPlaybooks.length
    ? { tier: 'AMBIGUOUS', margin: 0, reason: 'competing-playbooks' }
    : deriveRoutingConfidence(bestMatch, runnerUp);
  const isAmbiguous = !selectedPlaybook && !chosenSkillName && routingConfidence.tier !== 'HIGH';
  const clarification = isAmbiguous && scopeResult.status === 'ALLOW'
    ? competingPlaybooks.length
      ? {
        field: 'playbook',
        question: 'ต้องการเริ่มจากงานไหนก่อนครับ?',
        options: competingPlaybooks.map(({ playbook }) => ({
          value: playbook.id,
          label: playbook.clarificationLabel || playbook.description || playbook.name,
        })),
      }
      : buildRoutingClarification(query, context, options.clarificationAnswer, ranked, skills)
    : null;

  const halted = scopeResult.status !== 'ALLOW';
  const readiness = { status: halted ? 'not-checked' : 'ready', issues: [] };
  const skillMetadata = selectedSkill && !clarification && !halted
    ? await loadSkillContextMetadata(selectedSkill.name)
    : null;
  const skillMetadatas = skillMetadata ? [skillMetadata] : [];
  if (!halted && !clarification && selectedPlaybook) {
    for (const step of playbookPlan.filter((item) => item.type === 'skill' && item.skill !== selectedSkill?.name)) {
      skillMetadatas.push(await loadSkillContextMetadata(step.skill));
    }
  }
  const referenceMetadata = await loadDocumentContextMetadata([...new Set(skillMetadatas.flatMap((item) => item?.mandatory || []))]);

  let skillText = '';
  if (skillMetadata?.path) {
    try {
      skillText = await readFile(join(PACKAGE_ROOT, skillMetadata.path), 'utf-8');
      if (!skillText.trim()) throw new Error('Empty Skill');
    } catch {
      readiness.status = 'unavailable';
      readiness.issues.push({ type: 'skill-unreadable', id: selectedSkill.name });
    }
  } else if (selectedSkill && !clarification && !halted) {
    readiness.status = 'unavailable';
    readiness.issues.push({ type: 'skill-path-missing', id: selectedSkill.name });
  }
  for (const metadata of skillMetadatas.slice(1)) {
    try {
      if (!metadata?.path || !(await readFile(join(PACKAGE_ROOT, metadata.path), 'utf-8')).trim()) throw new Error('Missing Skill');
    } catch {
      readiness.status = 'unavailable';
      readiness.issues.push({ type: 'skill-unreadable', id: metadata?.name || 'unknown' });
    }
  }

  const ruleTexts = [];
  for (const ref of referenceMetadata) {
    ref.availability = 'missing';
    if (ref.path) {
      try {
        const content = await readFile(join(PACKAGE_ROOT, ref.path), 'utf-8');
        if (content.trim()) { ruleTexts.push(content); ref.availability = 'readable'; }
      } catch { /* Report missing content below without substituting another source. */ }
    }
    if (ref.availability !== 'readable' || !['active', 'active-reference'].includes(ref.status)
      || ref.authority === 'unverified' || /pending|unverified/i.test(ref.verification)) {
      if (readiness.status !== 'unavailable') readiness.status = 'partial';
      readiness.issues.push({ type: 'mandatory-reference-unverified', id: ref.id,
        status: ref.status, availability: ref.availability, verification: ref.verification });
    }
  }
  if (readiness.status === 'unavailable') { skillText = ''; ruleTexts.length = 0; }

  const routingContract = buildCompactRoutingContract({
    selectedSkill: clarification ? null : selectedSkill,
    selectedPlaybook,
    playbookPlan,
    teamInfo,
    scopeResult,
    bestMatch,
    routingConfidence,
    skillMetadata,
    referenceMetadata,
    clarification,
    readiness,
  });
  const contextPlan = buildContextBudgetPlan({
    routingContract,
    skillText,
    ruleTexts,
    governanceText: JSON.stringify(routingContract.authority),
  });

  const candidateSkills = ranked
    .slice(0, 3)
    .filter((r) => r.score >= 0.20)
    .map((r) => {
      const sObj = skills.find((s) => s.name === r.skill);
      const pTeam = sObj?.teams?.primary?.[0] || 'common';
      const tInfo = teams[pTeam] || { id: pTeam, name: pTeam };
      return {
        skill: sObj,
        score: r.score,
        tier: r.tier,
        teamInfo: tInfo,
      };
    });

  return {
    query,
    // Retained as a candidate for existing diagnostic consumers. Only the
    // routing contract activates a Skill; CLARIFY has no Skill or Skill context.
    selectedSkill,
    ranked,
    bestMatch,
    scopeResult,
    teamInfo,
    isAmbiguous,
    candidateSkills,
    userMemory,
    routingMode: routingContract.mode,
    clarification,
    selectedPlaybook,
    playbookPlan,
    playbookMatch,
    skillMetadata,
    referenceMetadata,
    routingContract,
    contextPlan,
    routingConfidence,
    authorityPreflight,
    // Metadata only: class, action and hash. The raw request never leaves here.
    privacy: privacy.logSafeMetadata,
  };
}

const CLARIFICATION_QUESTIONS = {
  purpose: 'เอกสารนี้ใช้ทำเรื่องอะไรครับ เช่น เบิกค่าใช้จ่าย ขอใช้สถานที่ หรือสมัครงาน?',
  task: 'ต้องการให้ช่วยทำอะไรกับเรื่องไหนครับ?',
  outcome: 'ในงานที่บอกมา ต้องการให้ช่วยตรวจอะไร สรุปอะไร หรือจัดทำอะไรให้ครับ?',
  scope: 'งานนี้เกี่ยวกับเรื่องอะไรหรือใช้เอกสารประเภทไหนครับ?',
};

const MAX_CLARIFICATION_CHOICES = 3;

/**
 * Count how many answers the employee has already given. Accumulated answers
 * arrive newline-separated with the latest answer last, per the adapter contract
 * in docs/step-router.md.
 */
function countClarificationRounds(answer) {
  if (typeof answer !== 'string') return 0;
  return answer.split(/\r?\n/).filter((line) => line.trim()).length;
}

/**
 * Ask for one missing piece at a time and never repeat a question already asked.
 * When every question has been asked and routing is still unresolved, stop
 * asking open questions and offer the leading candidates as a numbered menu —
 * the employee picks work language, never a Skill name they have to know.
 */
function buildRoutingClarification(query, context, answer, ranked = [], skills = []) {
  const fields = [];
  if (/ต้องแนบอะไร/.test(query)) fields.push('purpose');
  if (context.intent === 'unknown') fields.push('task');
  fields.push('outcome', 'scope');

  const round = countClarificationRounds(answer);
  const field = fields[round];

  if (field) {
    return { field, question: CLARIFICATION_QUESTIONS[field] };
  }

  const options = buildSkillChoiceOptions(ranked, skills);

  if (options.length === 0) {
    return { field: 'scope', question: CLARIFICATION_QUESTIONS.scope };
  }

  return {
    field: 'skill',
    question: 'ยังระบุงานไม่ได้ชัด ตรงกับข้อไหนมากที่สุดครับ?',
    options,
  };
}

/**
 * Leading candidates described in work language, never by Skill name.
 */
function buildSkillChoiceOptions(ranked = [], skills = []) {
  return ranked
    .filter((item) => item.score > 0)
    .slice(0, MAX_CLARIFICATION_CHOICES)
    .map((item) => {
      const skill = skills.find((candidate) => candidate.name === item.skill);
      return { value: item.skill, label: skill?.description || item.skill };
    });
}

/**
 * Resolve a reply to the clarification menu: the displayed option number, the
 * displayed label, or the Skill name itself. Anything else is treated as more
 * context, not as a choice.
 */
function resolveSkillMenuChoice(answer, ranked = [], skills = []) {
  if (typeof answer !== 'string') return '';
  const lines = answer.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) return '';

  const options = buildSkillChoiceOptions(ranked, skills);
  if (options.length === 0) return '';

  const numeric = last.match(/^(\d+)$/);
  if (numeric) {
    return options[Number(numeric[1]) - 1]?.value || '';
  }

  return options.find((option) => option.label === last || option.value === last)?.value || '';
}

