/**
 * STeP Skill router: turns an employee request into a routing contract. Shared by the
 * `step-ai ask` command and the desktop app.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  classifyContextPolicy,
} from '../../modules/router/index.js';
import {
  buildCompactRoutingContract,
  buildContextBudgetPlan,
} from '../../modules/context-budget/index.js';
import {
  loadRouterIndex,
  loadTeamsDictionary,
  loadSkillContextMetadata,
  loadDocumentContextMetadata,
  loadDocumentCatalog,
} from '../../modules/router/metadata.js';
import { loadAuthorityRegistry, evaluateAuthorityPreflight } from '../../modules/router/authority-preflight.js';
import { hasStartupIntakeDecision } from '../../modules/router/scope-guard.js';
import {
  classifyEntrepreneurIntent, needsEntrepreneurIntentReview,
  referencesOrganization,
} from '../../modules/router/entrepreneur-intent.js';
import { evaluatePrivacyGate, privacySafeText } from '../../modules/privacy/index.js';
import { needsPublicWebSearch } from './public-information.js';

/**
 * Router metadata loaders live in the router module. Keep CLI exports stable.
 */
export { loadRouterIndex, loadTeamsDictionary, loadSkillContextMetadata, loadDocumentContextMetadata, loadDocumentCatalog };

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
  const contextPolicy = classifyContextPolicy(originalQuery);
  if (typeof options.clarificationAnswer === 'string' && options.clarificationAnswer.trim()) {
    query = `${query}\nข้อมูลเพิ่มเติม: ${options.clarificationAnswer.trim()}`;
  }
  const unscannedQuery = query;

  // The request itself is the one piece of text this command always handles, and
  // employees paste identifiers straight into it. Scan before anything is routed,
  // reported or persisted, and route on the redacted text so a pasted identifier
  // never reaches a Skill, a log line or a diagnostic.
  const privacy = evaluatePrivacyGate(query);
  query = privacySafeText(privacy);

  const skills = await loadRouterIndex();
  const teams = await loadTeamsDictionary();
  const playbooks = await loadPlaybooks(PACKAGE_ROOT);
  const authorities = await loadAuthorityRegistry(PACKAGE_ROOT);
  // The outside-owner authority needs a host-assisted intent classification;
  // its phrase list alone is not a safe global BLOCK rule for Thai advice, but
  // a phrase it lists still forces a review instead of passing silently.
  const organizationAuthorities = authorities.filter((authority) => authority.id !== 'entrepreneur-commitment');
  const ownerPhraseMatched = evaluateAuthorityPreflight(
    query, authorities.filter((authority) => authority.id === 'entrepreneur-commitment'),
  ).status === 'BLOCK';
  let authorityPreflight = evaluateAuthorityPreflight(query, organizationAuthorities);

  let resolvedTeam = options.team || '';
  let resolvedCluster = options.cluster || '';
  // An explicitly empty field is broad routing, not permission to restore a
  // workspace default. CLI identity resolution already applied its precedence.
  const inheritTeam = options.team === undefined;
  const inheritCluster = options.cluster === undefined;
  let userMemory = null;
  if (inheritTeam || inheritCluster) {
    try {
      userMemory = await loadUserMemory(options.workspaceDir || process.cwd());
      if (inheritTeam && userMemory?.profile?.team) {
        resolvedTeam = userMemory.profile.team;
      }
      if (inheritCluster && userMemory?.profile?.cluster) {
        resolvedCluster = userMemory.profile.cluster;
      }
    } catch {
      // ignore memory read error
    }
  }

  const context = buildContext({
    // Reference URLs are evidence locations, not the employee's requested action.
    promptText: query.replace(/https?:\/\/\S+/gi, ' '),
    path: options.path || '',
    filenames: options.filenames || [],
    team: resolvedTeam,
    cluster: resolvedCluster,
  });

  const ranked = rankSkillCandidates(skills, context);
  // An employee who invokes a routed Skill by name skips scoring and playbooks, never
  // the authority preflight or the Skill's own scope check below.
  const explicitSkillName = typeof options.skill === 'string' && skills.some((skill) => skill.name === options.skill) ? options.skill : '';
  // autoRoute: false (STeP Desktop's default) never picks a Skill or Playbook and never asks a clarifying question:
  // the request goes to the model as general help, and a Skill is used only when the employee chooses one. The best
  // candidate's own scope rules and the organization authority registry still BLOCK or ESCALATE below.
  const manualRouting = options.autoRoute === false && !explicitSkillName;
  const playbookMatch = options.disablePlaybooks || explicitSkillName || manualRouting ? null : detectCompositePlaybook(playbooks, query, {
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
  const taskText = query.replace(/https?:\/\/\S+/gi, ' ');
  const concreteSkill = /(?:พัฒนา|แก้ไข|สร้าง|implement|build).*(?:ตัวเชื่อม|connector|โค้ด|code)/i.test(taskText)
    ? 'coding-git-workflow'
    : /(?:checklist|เช็กลิสต์|รายการตรวจ).*(?:ตรวจติดตาม|audit|คุณภาพ).*ISO\s*9001|ISO\s*9001.*(?:checklist|เช็กลิสต์|รายการตรวจ)/i.test(taskText)
      ? 'iso9001-audit-readiness' : '';
  const chosenSkillName = explicitSkillName || (manualRouting || selectedPlaybook || competingPlaybooks.length
    ? ''
    : resolveSkillMenuChoice(options.clarificationAnswer, ranked, skills) || concreteSkill);
  if (chosenSkillName) {
    const chosenSkill = skills.find((skill) => skill.name === chosenSkillName);
    const chosenRank = ranked.find((item) => item.skill === chosenSkillName);
    if (chosenSkill) {
      selectedSkill = chosenSkill;
      if (chosenRank) bestMatch = chosenRank;
    }
  }

  // An intake approval remains the project director's decision even when a
  // preceding annual-goal phrase makes another Skill rank first. Evaluate the
  // owning Skill's mandatory scope before offering any host intent verdict.
  if (authorityPreflight.status === 'ALLOW' && hasStartupIntakeDecision(query)) {
    const startupSkill = skills.find((skill) => skill.name === 'startup-discovery');
    const intakeScope = checkScope(startupSkill, query);
    if (intakeScope.status === 'BLOCK') {
      authorityPreflight = { ...intakeScope, source: 'cross-skill-intake' };
    }
  }

  // The AI host has already received the user's request; this opt-in path
  // accepts only its schema-bound verdict on the privacy-passed text. The CLI
  // never calls a provider. Without a verdict, risky business acts stop for a
  // human instead of being guessed from Thai keywords.
  // A model verdict never touches the organization's budget gate: ADVISORY is
  // permission to analyse, not to spend, and four review rounds showed that
  // no word list can tell the owner's money from STeP's or a funder's. Any
  // request that reaches budget-allocation keeps the finance gate (review
  // round 4). A verdict also cannot release a request naming an organization.
  const organizationNamed = referencesOrganization(query);
  const privacyRisk = privacy.action !== 'pass'
    && (ownerPhraseMatched || needsEntrepreneurIntentReview(unscannedQuery, selectedSkill?.name));
  // No keyword shortcut decides that a request is "only analysis": without the
  // host's verdict every owner's act waits for a human (review round 3).
  let intentReview = null;
  if (authorityPreflight.status === 'ALLOW') {
    intentReview = await classifyEntrepreneurIntent(query, {
      selectedSkillName: selectedSkill?.name,
      privacyAction: privacy.action,
      forceReview: privacyRisk || ownerPhraseMatched,
      intentAssessment: options.intentAssessment,
      intentClassifier: options.intentClassifier,
      intentTimeoutMs: options.intentTimeoutMs,
    });
    if (intentReview) {
      if (intentReview.status === 'NEEDS_HOST') {
        authorityPreflight = {
          status: 'ESCALATE', inScope: false, source: 'host-intent-review',
          ruleKey: 'entrepreneur-intent-review',
          authority: 'entrepreneur-commitment',
          targetRole: 'business-owner',
          reason: 'ยังไม่ชัดว่าเป็นการวิเคราะห์หรือคำสั่งผูกมัดกิจการ ต้องให้เจ้าของ/ผู้มีอำนาจตรวจ ไม่ให้ AI เดาหรือดำเนินการแทน',
        };
      } else if (intentReview.owner === 'business-owner' && intentReview.decision === 'COMMIT') {
        authorityPreflight = organizationNamed ? {
          status: 'BLOCK', inScope: false, source: 'host-intent-review',
          ruleKey: 'entrepreneur-intent-review', authority: 'ownership-review',
          targetRole: 'business-owner-or-afp-finance-head',
          reason: 'เป็นคำสั่งให้ดำเนินการจริงและอ้างถึง STeP หรือโครงการขององค์กร ต้องให้เจ้าของกิจการและผู้มีอำนาจขององค์กรตัดสินเอง',
        } : {
          status: 'BLOCK', inScope: false, source: 'host-intent-review',
          ruleKey: 'entrepreneur-commitment', authority: 'entrepreneur-commitment',
          targetRole: 'business-owner',
          reason: 'การเลือกเป้า อนุมัติเงิน จ้างคน หรือสั่งซื้อจริงเป็นอำนาจของเจ้าของกิจการ AI ช่วยร่างและวิเคราะห์ได้เท่านั้น',
        };
      } else if (intentReview.owner === 'business-owner' && intentReview.decision === 'ADVISORY') {
        // This is permission to analyse, not permission to spend. A verdict
        // about the owner's business cannot release a request that names
        // STeP, a programme, an approver or outside funding.
        authorityPreflight = organizationNamed ? {
          status: 'ESCALATE', inScope: false, source: 'host-intent-review',
          ruleKey: 'entrepreneur-intent-review', authority: 'ownership-review',
          targetRole: 'business-owner-or-afp-finance-head',
          reason: 'คำขอนี้อ้างถึง STeP โครงการ ผู้มีอำนาจ หรือแหล่งทุนภายนอก ผลจำแนกของ AI ไม่อาจยืนยันว่าไม่ใช้อำนาจหรืองบขององค์กร ต้องให้คนตรวจ',
        } : { status: 'ALLOW', inScope: true, source: 'host-intent-review' };
      } else {
        authorityPreflight = {
          status: 'ESCALATE', inScope: false, source: 'host-intent-review',
          ruleKey: 'entrepreneur-intent-review', authority: 'ownership-review',
          targetRole: 'business-owner-or-afp-finance-head',
          reason: 'ยังไม่ยืนยันว่าเป็นการตัดสินใจของกิจการหรือใช้งบองค์กร ต้องให้คนตรวจเจ้าของอำนาจก่อน',
        };
      }
    }
  }

  const preflightPlaybookStep = selectedPlaybook
    ? playbookPlan.find((step) => step.type === 'skill' && step.skill)?.id || ''
    : '';
  const hasGlobalAuthorityBlock = authorityPreflight.status === 'BLOCK';
  const localScope = hasGlobalAuthorityBlock || !selectedSkill
    ? { status: 'ALLOW', inScope: true }
    : checkScope(selectedSkill, query);
  // Mandatory local/global blocks outrank confirmation. When both the global
  // authority registry and the Skill raise a confirmation/escalation, preserve
  // the global authority provenance instead of silently dropping it.
  const useGlobalAuthority = hasGlobalAuthorityBlock
    || (authorityPreflight.status === 'ESCALATE' && localScope.status !== 'BLOCK');

  let scopeResult = useGlobalAuthority
    ? {
        ...authorityPreflight,
        ...(localScope.status === 'ESCALATE' && localScope.targetSkill
          ? { targetSkill: localScope.targetSkill, localScopeReason: localScope.reason || '' }
          : {}),
        ...(selectedPlaybook
          ? { playbookStep: preflightPlaybookStep, playbookId: selectedPlaybook.id }
          : {}),
      }
    : localScope;

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

  // authorityChecks: false (STeP Desktop's default) lets every request through as help: the AI cannot approve, sign
  // or submit anything itself, so the organization's approval and scope rules are left to people.
  if (options.authorityChecks === false) scopeResult = { status: 'ALLOW', inScope: true, source: 'authority-checks-off' };

  const primaryTeamCode = selectedPlaybook?.owner || selectedSkill?.teams?.primary?.[0] || 'common';
  const teamInfo = teams[primaryTeamCode] || { id: primaryTeamCode, name: primaryTeamCode };

  const routingConfidence = competingPlaybooks.length
    ? { tier: 'AMBIGUOUS', margin: 0, reason: 'competing-playbooks' }
    : deriveRoutingConfidence(bestMatch, runnerUp);
  const isAmbiguous = !selectedPlaybook && !chosenSkillName && routingConfidence.tier !== 'HIGH';
  // No Skill matched, but the employee asked for something concrete: translate,
  // write an email, build a sheet. Clarifying cannot produce a Skill that does
  // not exist, so it only delays help. Answer as a general assistant under the
  // organization rules instead. Attachment-purpose questions and consequential
  // requests keep asking, because there the missing context is what decides.
  const publicInformation = !chosenSkillName && !selectedPlaybook && !competingPlaybooks.length
    && scopeResult.status === 'ALLOW' && privacy.action === 'pass'
    && !CONSEQUENTIAL_ACTION_PATTERN.test(query) && !CONSEQUENTIAL_INTENTS.has(context.intent)
    && !namesOrganizationContext(query, Object.keys(teams)) && needsPublicWebSearch(originalQuery);
  // A conversational host sends the model the chat history and files, so a message
  // that matches no Skill ("อันนี้", "อ่านยัง") is answered, or asked about, by the
  // model in context instead of a fixed question here. Competing Playbooks, close
  // Skill candidates and consequential requests still ask.
  const conversationalAssist = options.conversational === true
    && isAmbiguous
    && !competingPlaybooks.length
    && routingConfidence.tier === 'FALLBACK'
    && scopeResult.status === 'ALLOW'
    && !CONSEQUENTIAL_INTENTS.has(context.intent)
    && !CONSEQUENTIAL_ACTION_PATTERN.test(query);
  const invitationDraft = !chosenSkillName && !selectedPlaybook && !competingPlaybooks.length
    && /(?:ร่าง|เขียน).*(?:อีเมล|email|ข้อความ|จดหมาย).*เชิญประชุม/i.test(taskText)
    && scopeResult.status === 'ALLOW' && privacy.action === 'pass'
    && !CONSEQUENTIAL_ACTION_PATTERN.test(query) && !CONSEQUENTIAL_INTENTS.has(context.intent);
  // Working in a registered internal system ("เปิด STeP MIS", "หาแบบฟอร์มใน MIS") is done by the employee and the
  // assistant together in the host's isolated browser, so it is general help rather than a Skill guess. Consequential
  // requests (submit, approve, sign) and Authority BLOCK/ESCALATE still stop here.
  const internalSystem = isAmbiguous && !competingPlaybooks.length
    && scopeResult.status === 'ALLOW' && privacy.action === 'pass'
    && !CONSEQUENTIAL_INTENTS.has(context.intent) && !CONSEQUENTIAL_ACTION_PATTERN.test(query)
    && INTERNAL_SYSTEM_PATTERN.test(originalQuery);
  // In chat the employee already answered a clarifying question and did not pick a menu option ("ไม่ตรง", or more
  // detail). Asking again loops; the model has the whole conversation, so it helps from there.
  const answeredInChat = options.conversational === true
    && isAmbiguous
    && countClarificationRounds(options.clarificationAnswer) > 0
    && !competingPlaybooks.length
    && scopeResult.status === 'ALLOW'
    && !ATTACHMENT_PURPOSE_PATTERN.test(query)
    && !CONSEQUENTIAL_INTENTS.has(context.intent)
    && !CONSEQUENTIAL_ACTION_PATTERN.test(query);
  const generalAssist = manualRouting || invitationDraft || publicInformation || conversationalAssist || internalSystem || answeredInChat || (isAmbiguous
    && !competingPlaybooks.length
    && routingConfidence.tier === 'FALLBACK'
    && scopeResult.status === 'ALLOW'
    && !ATTACHMENT_PURPOSE_PATTERN.test(query)
    && !CONSEQUENTIAL_INTENTS.has(context.intent)
    && !CONSEQUENTIAL_ACTION_PATTERN.test(query)
    && !namesOrganizationContext(query, Object.keys(teams))
    && hasConcreteRequest(originalQuery, options.clarificationAnswer));
  if (generalAssist) selectedSkill = null;
  const clarification = isAmbiguous && !generalAssist && scopeResult.status === 'ALLOW'
    ? competingPlaybooks.length
      ? {
        field: 'playbook',
        question: 'ต้องการเริ่มจากงานไหนก่อนครับ?',
        options: competingPlaybooks.map(({ playbook }) => ({
          value: playbook.id,
          label: playbook.clarificationLabel || playbook.description || playbook.name,
        })),
      }
      : buildRoutingClarification(query, context, options.clarificationAnswer, ranked, skills, routingConfidence.tier)
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
  const referenceMetadata = await loadDocumentContextMetadata([...new Set([
    ...skillMetadatas.flatMap((item) => item?.mandatory || []),
    ...(generalAssist ? GENERAL_ASSIST_REFERENCES : []),
  ])]);

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
    generalAssist,
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
    contextPolicy,
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
    contextPolicy,
    authorityPreflight,
    intentReview,
    // Metadata only: class, action and hash. The raw request never leaves here.
    privacy: privacy.logSafeMetadata,
  };
}

const ATTACHMENT_PURPOSE_PATTERN = /ต้องแนบอะไร/;
const CONSEQUENTIAL_INTENTS = new Set(['approve', 'form-submit']);
// Acts only a person may perform. General help could invent their result (a
// document number, a signature), so these always go through the Router's
// questions and authority gates instead of GENERAL.
const CONSEQUENTIAL_ACTION_PATTERN = /ออกเลข|ลงนาม|เซ็น|ลายเซ็น|โอนเงิน|จ่ายเงิน|สั่งจ่าย|อนุมัติ|ตัดสินผู้ชนะ|กดส่ง|ส่งฟอร์ม|\bsubmit\b|\bsign\b|\bapprove\b/i;
// With no Skill loaded, the organization floor still has to reach the model.
const GENERAL_ASSIST_REFERENCES = ['human-approval-rule', 'data-classification-rule'];

// Words that carry politeness or point at an object but name no task. A
// request made only of these ("ช่วยหน่อย", "ช่วยดูเอกสารนี้หน่อย") still has to
// be asked about: "look at this document" does not say what to look for.
const FILLER_TERMS = [
  'ช่วยด้วย', 'ช่วย', 'หน่อย', 'ครับ', 'คับ', 'ค่ะ', 'คะ', 'นะ', 'จ้า', 'ด้วย', 'ให้',
  'งาน', 'อันนี้', 'นี้', 'นี่', 'นั้น', 'เรื่อง', 'เอกสาร', 'ไฟล์', 'ดู',
  'please', 'help', 'pls',
];
const MIN_CONCRETE_CHARS = 3;
// STeP MIS (manifest/services.yaml → sources.step-mis); the desktop opens it in its isolated browser.
const INTERNAL_SYSTEM_PATTERN = /\bmis\b|mis\.step\.cmu/i;

// A request that names a STeP team or internal system ("AFP ตีกลับ", "ระเบียบ
// ISO"), or asks what the organization pays or grants ("เบิกได้เท่าไหร่",
// "สวัสดิการ"), is about how the organization works, so it must not be answered
// from general knowledge. The product's own name is not such a signal.
const ORGANIZATION_TERMS = [
  'ระเบียบ', 'หนังสือเวียน', 'แบบฟอร์ม', 'iso', 'qms', 'step mis', 'สเต็ป', 'อุทยาน', 'มช', 'cmu',
  'เบิก', 'สวัสดิการ', 'เงินเดือน', 'ค่าตอบแทน', 'วันลา', 'มีสิทธิ', 'ได้สิทธิ', 'สิทธิ์ลา', 'สิทธิลา',
];

function namesOrganizationContext(query, teamIds = []) {
  const text = String(query || '').toLowerCase().replace(/step\s*ai/g, '');
  if (ORGANIZATION_TERMS.some((term) => text.includes(term))) return true;
  if (/\bstep\b/.test(text)) return true;
  return teamIds.some((id) => new RegExp(`(^|[^a-z0-9-])${id.replace(/[-]/g, '\\-')}([^a-z0-9-]|$)`).test(text));
}

function hasConcreteRequest(query, answer) {
  let text = `${query || ''} ${typeof answer === 'string' ? answer : ''}`.toLowerCase();
  for (const term of FILLER_TERMS) text = text.split(term).join('');
  return text.replace(/[\s\p{P}\p{S}]/gu, '').length >= MIN_CONCRETE_CHARS;
}

const CLARIFICATION_QUESTIONS = {
  purpose: 'เอกสารนี้ใช้ทำเรื่องอะไรครับ เช่น เบิกค่าใช้จ่าย ขอใช้สถานที่ หรือสมัครงาน?',
  task: 'ต้องการให้ช่วยทำอะไรกับเรื่องไหนครับ?',
  outcome: 'ในงานที่บอกมา ต้องการให้ช่วยตรวจอะไร สรุปอะไร หรือจัดทำอะไรให้ครับ?',
  scope: 'งานนี้เกี่ยวกับเรื่องอะไรหรือใช้เอกสารประเภทไหนครับ?',
};

const MAX_CLARIFICATION_CHOICES = 3;
const MIN_MENU_SCORE = 0.20;

/**
 * Count how many answers the employee has already given. Accumulated answers
 * arrive newline-separated with the latest answer last, per the adapter contract
 * in docs/step-router.md.
 */
function countClarificationRounds(answer) {
  if (typeof answer !== 'string') return 0;
  return answer.split(/\r?\n/).filter((line) => line.trim()).length;
}

const DECLINE_PATTERN = /^(?:ไม่(?:ตรง|ใช่)?(?:สักข้อ|เลย)?(?:ครับ|ค่ะ|คะ|จ้า)?|no|nope|none|not (?:this|that|it))$/i;
/** The latest answer turns the offered choice down. */
function declinedMenu(answer) {
  if (typeof answer !== 'string') return false;
  const last = answer.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) || '';
  return DECLINE_PATTERN.test(last.replace(/[\s.!?,。]+/g, ''));
}

/**
 * Ask for one missing piece at a time and never repeat a question already asked.
 * When every question has been asked and routing is still unresolved, stop
 * asking open questions and offer the leading candidates as a numbered menu —
 * the employee picks work language, never a Skill name they have to know.
 */
function buildRoutingClarification(query, context, answer, ranked = [], skills = [], tier = '') {
  const options = buildSkillChoiceOptions(ranked, skills);
  const purpose = ATTACHMENT_PURPOSE_PATTERN.test(query);

  const fields = [];
  if (purpose) fields.push('purpose');
  if (context.intent === 'unknown') fields.push('task');
  fields.push('outcome', 'scope');

  const round = countClarificationRounds(answer);
  // Real candidates are best separated by naming them: one menu (or, with a
  // single candidate, one yes/no) answers in a single reply what open questions
  // would take up to three rounds to reach. Offer it in the first two rounds,
  // since the first may have been spent learning what the task was at all.
  // A menu the employee turned down ("ไม่ตรง") is never offered again.
  const offerMenuNow = !purpose && tier === 'AMBIGUOUS' && options.length >= 1 && round <= 1 && !declinedMenu(answer);
  const field = offerMenuNow ? 'skill' : fields[round];

  if (field && field !== 'skill') {
    return { field, question: CLARIFICATION_QUESTIONS[field] };
  }

  if (options.length === 0) {
    return { field: 'scope', question: CLARIFICATION_QUESTIONS.scope };
  }

  return {
    field: 'skill',
    question: options.length === 1
      ? 'งานนี้ตรงกับข้อนี้ไหมครับ? ถ้าตรงตอบ 1 ถ้าไม่ใช่ เล่าเพิ่มได้เลย'
      : 'งานนี้ใกล้กับข้อไหนที่สุดครับ? ถ้าไม่ตรงสักข้อ เล่าเพิ่มได้เลย',
    options,
  };
}

/**
 * Leading candidates described in work language, never by Skill name.
 */
function buildSkillChoiceOptions(ranked = [], skills = []) {
  // Offer only candidates with real evidence: a menu of unrelated work tells
  // the employee the assistant did not understand them.
  return ranked
    .filter((item) => item.score >= MIN_MENU_SCORE || (item.matchedTriggers || []).length > 0)
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
