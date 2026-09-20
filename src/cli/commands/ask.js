import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import readline from 'node:readline';
import { header, success, info, warn, table } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';
import { PACKAGE_ROOT } from '../../modules/role-resolver.js';
import { getUserTeam, getUserCluster } from '../../utils/user-config.js';
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
  inspectCheapContext,
  rescoreWithCheapContext,
  deriveRoutingConfidence,
} from '../../modules/router/index.js';
import {
  buildCompactRoutingContract,
  buildContextBudgetPlan,
} from '../../modules/context-budget/index.js';
import { parseYamlInlineList, stripYamlScalar } from '../../utils/simple-yaml.js';
import { loadAuthorityRegistry, evaluateAuthorityPreflight } from '../../modules/router/authority-preflight.js';

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
        ? { id: key[1], title: '', path: '', status: '' }
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
  }

  return results;
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
  const playbookMatch = options.disablePlaybooks ? null : detectCompositePlaybook(playbooks, originalQuery, {
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
  const isAmbiguous = !selectedPlaybook && routingConfidence.tier !== 'HIGH';
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
      : buildRoutingClarification(query, context, options.clarificationAnswer)
    : null;

  const skillMetadata = selectedSkill && !clarification
    ? await loadSkillContextMetadata(selectedSkill.name)
    : null;
  const referenceMetadata = await loadDocumentContextMetadata(skillMetadata?.mandatory || []);

  let skillText = '';
  if (skillMetadata?.path) {
    try {
      skillText = await readFile(join(PACKAGE_ROOT, skillMetadata.path), 'utf-8');
    } catch {
      skillText = '';
    }
  }

  const ruleTexts = [];
  for (const ref of referenceMetadata) {
    if (!ref.path) continue;
    try {
      ruleTexts.push(await readFile(join(PACKAGE_ROOT, ref.path), 'utf-8'));
    } catch {
      // Missing reference content stays visible in metadata without guessing.
    }
  }

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
  };
}

function buildRoutingClarification(query, context, answer) {
  if (typeof answer === 'string' && answer.trim()) {
    return {
      field: 'outcome',
      question: 'ในงานที่บอกมา ต้องการให้ช่วยตรวจอะไร สรุปอะไร หรือจัดทำอะไรให้ครับ?',
    };
  }
  if (/ต้องแนบอะไร/.test(query)) {
    return {
      field: 'purpose',
      question: 'เอกสารนี้ใช้ทำเรื่องอะไรครับ เช่น เบิกค่าใช้จ่าย ขอใช้สถานที่ หรือสมัครงาน?',
    };
  }
  if (context.intent === 'unknown') {
    return {
      field: 'task',
      question: 'ต้องการให้ช่วยทำอะไรกับเรื่องไหนครับ?',
    };
  }
  return {
    field: 'scope',
    question: 'งานนี้เกี่ยวกับเรื่องอะไรหรือใช้เอกสารประเภทไหนครับ?',
  };
}

/**
 * CLI command runner: `step-ai ask`
 */
export async function runAsk(args) {
  const machineMode = Boolean(args.json);
  if (!machineMode) header('STeP AI Assistant — ผู้ช่วยค้นหาทักษะและมาตรฐานงานองค์กร');

  let query = args._ ? args._.slice(1).join(' ') : '';
  if (!query && args.q) query = args.q;

  // If no query provided, prompt interactively
  if (!query) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(colors.dim('พิมพ์คำถามหรือเนื้องานที่ต้องการให้ AI ช่วยเหลือ (ภาษาไทยทั่วไป):'));
    console.log(colors.dim('ตัวอย่าง: "ช่วยตรวจ TOR หน่อย", "ทำสไลด์ Pitching", "ร่างหนังสือเชิญประชุม"\n'));

    query = await new Promise((res) => {
      rl.question(colors.bold(colors.cyan('คำถามของคุณ: ')), (ans) => {
        rl.close();
        res(ans.trim());
      });
    });

    if (!query) {
      warn('ไม่มีคำถาม ระงับการค้นหา');
      return;
    }
  }

  if (!machineMode) info(`วิเคราะห์คำถาม: "${colors.bold(query)}" ...\n`);

  const userTeam = args.team || args.m || (await getUserTeam()) || '';
  const userCluster = args.cluster || args.c || (await getUserCluster()) || '';
  const result = await queryStepRouter(query, {
    team: userTeam, cluster: userCluster, clarificationAnswer: args.answer,
  });
  if (machineMode) {
    console.log(JSON.stringify({
      routing: result.routingContract,
      contextPlan: result.contextPlan,
    }, null, 2));
    return;
  }
  const {
    selectedSkill,
    bestMatch,
    scopeResult,
    teamInfo,
    routingMode,
    selectedPlaybook,
    playbookPlan,
    routingConfidence,
    authorityPreflight,
    clarification,
  } = result;

  const authorityDecision = authorityPreflight?.status === 'BLOCK'
    ? authorityPreflight
    : !selectedSkill && scopeResult.status === 'BLOCK' ? scopeResult : null;
  if (authorityDecision) {
    console.log(colors.bold(colors.red('┌─────────────────────────────────────────────────────────────────────────────┐')));
    console.log(colors.bold(colors.red('│  ⚠️  Human Authority Required — AI cannot make this decision                │')));
    console.log(colors.bold(colors.red('└─────────────────────────────────────────────────────────────────────────────┘')));
    console.log(`  • Authority:          ${colors.bold(authorityDecision.authority)}`);
    console.log(`  • ผู้มีอำนาจ:         ${colors.bold(authorityDecision.targetRole || 'Authorized Human')}`);
    if (authorityDecision.alternateRole) {
      console.log(`  • ผู้รับช่วงสำรอง:     ${colors.dim(authorityDecision.alternateRole)}`);
    }
    console.log(`  • เหตุผล:             ${colors.dim(authorityDecision.reason)}`);
    console.log(colors.dim('  AI ช่วยเตรียมข้อมูล ร่างเอกสาร หรือ checklist ก่อนส่งให้ผู้มีอำนาจได้ แต่ไม่อนุมัติ ตัดสิน หรือกดดำเนินการแทน'));
    return;
  }

  if (routingMode === 'PLAYBOOK' && selectedPlaybook) {
    console.log(colors.bold(colors.green('┌─────────────────────────────────────────────────────────────────────────────┐')));
    console.log(colors.bold(colors.green('│  🧭 พบงานหลายขั้น — จัดเป็นแผนงานต่อเนื่องให้แล้ว                          │')));
    console.log(colors.bold(colors.green('└─────────────────────────────────────────────────────────────────────────────┘')));
    console.log(`  • แผนงาน:           ${colors.bold(colors.cyan(selectedPlaybook.name))}`);
    console.log(`  • ทีมเจ้าของ Flow:   ${colors.bold(teamInfo.name)} (${teamInfo.id.toUpperCase()})`);
    console.log('  • ขั้นตอน:');
    playbookPlan.forEach((step) => {
      const kind = step.type === 'skill' ? 'วิเคราะห์/เตรียมงาน' : 'ลงมือสร้างผลลัพธ์';
      console.log(`    ${step.order}. ${step.description || step.id} [${kind}]`);
    });
    console.log();
    console.log(colors.dim('  ระบบควรทำทีละขั้น และส่งเฉพาะผลลัพธ์ที่จำเป็นไปขั้นถัดไป ไม่โหลดทุกทักษะพร้อมกัน'));

    if (scopeResult.status === 'BLOCK') {
      console.log();
      console.log(colors.bold(colors.red('⚠️  มีขั้นตอนที่ต้องให้ผู้มีอำนาจตัดสินใจ:')));
      console.log(`  • ขั้นตอน:            ${scopeResult.playbookStep || '-'}`);
      console.log(`  • ผู้มีอำนาจ:         ${colors.bold(scopeResult.targetRole || 'Authorized Human')}`);
      if (scopeResult.authority) console.log(`  • Authority:          ${colors.dim(scopeResult.authority)}`);
      console.log(`  • คำแนะนำ:            ${colors.dim(scopeResult.reason)}`);
    }

    console.log();
    console.log(colors.cyan(`   "${query}"`));
    console.log(colors.dim('   AI จะใช้ manifest/playbooks.yaml เพื่อทำงานต่อเนื่อง และบันทึก run state ใต้ .step-ai/runs/ เมื่อเครื่องมือรองรับการเขียนไฟล์\n'));
    return;
  }

  if (clarification) {
    console.log(colors.bold(clarification.question));
    for (const [index, option] of (clarification.options || []).entries()) {
      console.log(`  ${index + 1}. ${option.label}`);
    }
    console.log(colors.dim('ตอบเพิ่มได้ตามงานจริง แล้วผมจะช่วยต่อจากคำขอเดิมครับ'));
    return;
  }

  if (!selectedSkill && scopeResult.status === 'ESCALATE') {
    console.log(colors.bold('งานนี้มีขั้นตอนที่ต้องยืนยันหรือส่งต่อก่อนดำเนินการครับ'));
    console.log(colors.dim(scopeResult.reason));
    return;
  }

  const isMatched = selectedSkill && (bestMatch.score >= 0.20 || bestMatch.breakdown.keyword > 0);
  if (!isMatched) {
    warn('ไม่พบทักษะเฉพาะทางที่ตรงกับคำถามอย่างชัดเจน');
    console.log(colors.dim('ลองเพิ่มกริยางานหรือสิ่งที่ต้องการให้ทำ เช่น ตรวจ, เขียน, กรอก, สรุป, วางแผน พร้อมเอกสาร/บริบทที่เกี่ยวข้อง ระบบจะยังคงตรวจ Authority และ Guardrails ก่อนดำเนินการ'));
    return;
  }

  // Display Friendly Result Card
  console.log(colors.bold(colors.green('┌─────────────────────────────────────────────────────────────────────────────┐')));
  console.log(colors.bold(colors.green('│  🎯 ทักษะที่แนะนำสำหรับงานนี้                                               │')));
  console.log(colors.bold(colors.green('└─────────────────────────────────────────────────────────────────────────────┘')));
  console.log(`  • ทักษะ (Skill):   ${colors.bold(colors.cyan(selectedSkill.name))} (${selectedSkill.description})`);
  console.log(`  • ความมั่นใจ:      ${colors.bold(routingConfidence.tier)} · Match score ${Math.round(bestMatch.score * 100)}% (${routingConfidence.reason})`);
  console.log(`  • ทีมที่รับผิดชอบ:  ${colors.bold(teamInfo.name)} (${teamInfo.id.toUpperCase()})`);
  if (selectedSkill.processId) {
    console.log(`  • กระบวนการ (HOW): ${colors.yellow(selectedSkill.processId)}`);
  }
  console.log();

  // Scope & Governance Check
  if (scopeResult.status === 'BLOCK') {
    console.log(colors.bold(colors.red('⚠️  ข้อควรระวังตามระเบียบองค์กร (Human-in-the-loop Required):')));
    console.log(`  • สถานะ:             ${colors.red('งานนี้ต้องผ่านการพิจารณาหรืออนุมัติโดยมนุษย์')}`);
    console.log(`  • ผู้มีอำนาจตัดสินใจ: ${colors.bold(scopeResult.targetRole || 'Authorized Human')}`);
    if (scopeResult.authority) {
      console.log(`  • ระเบียบอ้างอิง:    ${colors.dim(scopeResult.authority)}`);
    }
    console.log(`  • คำแนะนำ:           ${colors.dim(scopeResult.reason)}`);
    console.log(colors.dim('  (AI สามารถช่วยร่างหรือเตรียมข้อมูลเปรียบเทียบได้ แต่ไม่สามารถตัดสินใจแทนได้ครับ)'));
  } else if (scopeResult.status === 'ESCALATE') {
    if (scopeResult.targetSkill === selectedSkill.name) {
      console.log(colors.bold(colors.yellow('✋  ประตูยืนยันความถูกต้อง (Human Confirmation Gate):')));
      console.log(`  • สถานะ:             ${colors.yellow('ต้องได้รับคำยืนยันจากผู้ใช้ก่อนกดส่งจริง')}`);
      console.log(`  • คำแนะนำ:           ${colors.dim(scopeResult.reason)}`);
    } else {
      console.log(colors.bold(colors.yellow('🔄  การส่งต่องาน (Cross-Skill Escalation):')));
      console.log(`  • ทักษะที่ควรรับช่วงต่อ: ${colors.bold(colors.cyan(scopeResult.targetSkill))}`);
      console.log(`  • คำแนะนำ:             ${colors.dim(scopeResult.reason)}`);
    }
  } else {
    success(`ขอบเขตงาน (Scope Guard): อนุญาตให้ AI ช่วยดำเนินการได้ตามระเบียบ STeP`);
    if (selectedSkill.scope?.allow && selectedSkill.scope.allow.length > 0) {
      console.log(colors.dim(`  สิ่งที่ AI ช่วยได้: ${selectedSkill.scope.allow.join(', ')}`));
    }
  }

  console.log();
  console.log(colors.bold('💡 ตัวอย่างคำสั่งที่คุณสั่ง AI ใน Claude / Cursor / Codex ได้ทันที:'));
  console.log(colors.cyan(`   "${query}"`));
  console.log(colors.dim('   (AI จะเปิดใช้ทักษะ ') + colors.bold(selectedSkill.name) + colors.dim(' และปฏิบัติตามมาตรฐานให้อัตโนมัติ)\n'));
}
