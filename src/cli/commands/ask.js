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
  deriveRoutingConfidence,
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
} from '../../modules/router/metadata.js';
import { loadAuthorityRegistry, evaluateAuthorityPreflight } from '../../modules/router/authority-preflight.js';
import {
  classifyEntrepreneurIntent, needsEntrepreneurIntentReview,
  isExplicitStepBudgetApproval, isPrivateBusinessContext, referencesOrganization,
} from '../../modules/router/entrepreneur-intent.js';
import { evaluatePrivacyGate, privacySafeText } from '../../modules/privacy/index.js';

/**
 * Router metadata loaders live in the router module. Keep CLI exports stable.
 */
export { loadRouterIndex, loadTeamsDictionary, loadSkillContextMetadata, loadDocumentContextMetadata };

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
  const playbookMatch = options.disablePlaybooks ? null : detectCompositePlaybook(playbooks, query, {
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
  const chosenSkillName = selectedPlaybook || competingPlaybooks.length
    ? ''
    : resolveSkillMenuChoice(options.clarificationAnswer, ranked, skills);
  if (chosenSkillName) {
    const chosenSkill = skills.find((skill) => skill.name === chosenSkillName);
    const chosenRank = ranked.find((item) => item.skill === chosenSkillName);
    if (chosenSkill) {
      selectedSkill = chosenSkill;
      if (chosenRank) bestMatch = chosenRank;
    }
  }

  // The AI host has already received the user's request; this opt-in path
  // accepts only its schema-bound verdict on the privacy-passed text. The CLI
  // never calls a provider. Without a verdict, risky business acts stop for a
  // human instead of being guessed from Thai keywords.
  // A budget gate may be reconsidered only when the request plainly concerns
  // the entrepreneur's own business: any mention of STeP, its programmes or
  // its approvers keeps the organization's gate no matter what a model says.
  const organizationNamed = referencesOrganization(query);
  const budgetOverlap = authorityPreflight.authority === 'budget-allocation'
    && !isExplicitStepBudgetApproval(query)
    && !organizationNamed
    && (selectedSkill?.name === 'entrepreneur-annual-goal'
      || needsEntrepreneurIntentReview(query, selectedSkill?.name)
      || isPrivateBusinessContext(query)
      || /(?:เจ้าของ(?:กิจการ)?|ทีมขาย|เซลส์)/i.test(query));
  const privacyRisk = privacy.action !== 'pass'
    && (ownerPhraseMatched || needsEntrepreneurIntentReview(unscannedQuery, selectedSkill?.name));
  let intentReview = null;
  if (authorityPreflight.status === 'ALLOW' || budgetOverlap) {
    intentReview = await classifyEntrepreneurIntent(query, {
      selectedSkillName: selectedSkill?.name,
      privacyAction: privacy.action,
      forceReview: privacyRisk || budgetOverlap || ownerPhraseMatched,
      intentAssessment: options.intentAssessment,
      intentClassifier: options.intentClassifier,
      intentTimeoutMs: options.intentTimeoutMs,
    });
    if (intentReview) {
      const privateOwner = isPrivateBusinessContext(query);
      const unresolvedOwner = budgetOverlap && !privateOwner;
      if (intentReview.status === 'NEEDS_HOST') {
        authorityPreflight = {
          status: 'ESCALATE', inScope: false, source: 'host-intent-review',
          ruleKey: 'entrepreneur-intent-review',
          authority: unresolvedOwner ? 'ownership-review' : 'entrepreneur-commitment',
          targetRole: unresolvedOwner ? 'business-owner-or-afp-finance-head' : 'business-owner',
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
        // STeP, and it only lifts the budget clause: every other authority in
        // the same request is evaluated again and still wins.
        if (organizationNamed) {
          authorityPreflight = {
            status: 'ESCALATE', inScope: false, source: 'host-intent-review',
            ruleKey: 'entrepreneur-intent-review', authority: 'ownership-review',
            targetRole: 'business-owner-or-afp-finance-head',
            reason: 'คำขอนี้อ้างถึง STeP หรือโครงการขององค์กร ผลจำแนกของ AI ไม่อาจยืนยันว่าไม่ใช้อำนาจหรืองบขององค์กร ต้องให้คนตรวจ',
          };
        } else {
          const remaining = budgetOverlap
            ? evaluateAuthorityPreflight(query, organizationAuthorities
              .filter((authority) => authority.id !== 'budget-allocation'))
            : { status: 'ALLOW' };
          authorityPreflight = remaining.status === 'ALLOW'
            ? { status: 'ALLOW', inScope: true, source: 'host-intent-review' }
            : remaining;
        }
      } else if (budgetOverlap && intentReview.owner === 'step') {
        // Model classification cannot downgrade an organizational budget gate.
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
  // A global confirmation gate (sending on the employee's behalf) applies even
  // when no Skill matched. A Skill's own gate is more specific, so it wins.
  const globalGate = hasGlobalAuthorityBlock
    || (authorityPreflight.status === 'ESCALATE' && localScope.status === 'ALLOW');

  let scopeResult = globalGate
    ? {
        ...authorityPreflight,
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
  const generalAssist = isAmbiguous
    && !competingPlaybooks.length
    && routingConfidence.tier === 'FALLBACK'
    && scopeResult.status === 'ALLOW'
    && !ATTACHMENT_PURPOSE_PATTERN.test(query)
    && !CONSEQUENTIAL_INTENTS.has(context.intent)
    && !CONSEQUENTIAL_ACTION_PATTERN.test(query)
    && !namesOrganizationContext(query, Object.keys(teams))
    && hasConcreteRequest(originalQuery, options.clarificationAnswer);
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
  const offerMenuNow = !purpose && tier === 'AMBIGUOUS' && options.length >= 1 && round <= 1;
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

  const userTeam = args.team || args.m || (await getUserTeam()) || '';
  const userCluster = args.cluster || args.c || (await getUserCluster()) || '';
  let intentAssessment;
  if (args['intent-assessment'] !== undefined) {
    try { intentAssessment = JSON.parse(String(args['intent-assessment'])); }
    catch { intentAssessment = {}; } // Invalid host output must fail closed.
  }
  const result = await queryStepRouter(query, {
    team: userTeam, cluster: userCluster, clarificationAnswer: args.answer,
    intentAssessment,
  });
  if (machineMode) {
    console.log(JSON.stringify({
      routing: result.routingContract,
      contextPlan: result.contextPlan,
      privacy: result.privacy,
      ...(result.intentReview ? { intentReview: result.intentReview } : {}),
    }, null, 2));
    return;
  }

  // Echo the scanned request, not the raw one: terminal scrollback is a log too.
  info(`วิเคราะห์คำถาม: "${colors.bold(result.query)}" ...\n`);

  if (result.privacy.redactionApplied || result.privacy.privacyAction !== 'pass') {
    console.log(colors.bold(colors.yellow('🔒 ตรวจข้อมูลส่วนบุคคลในคำถาม:')));
    console.log(`  • ระดับข้อมูล: ${colors.bold(result.privacy.privacyClass)}`);
    if (result.privacy.redactionApplied) {
      console.log(`  • ${colors.dim('ปิดบังข้อมูลที่ตรวจพบก่อนจัดเส้นทางแล้ว')}`);
    }
    if (result.privacy.privacyAction !== 'pass' && result.privacy.privacyAction !== 'auto-mask') {
      console.log(colors.yellow(`  • ${'ให้ตรวจสอบก่อนส่งต่อ การสแกนรูปแบบข้อความไม่ใช่การรับรองว่าส่งได้'}`));
    }
    console.log();
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

  const authorityDecision = scopeResult.status === 'BLOCK' ? scopeResult : null;
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

  if (routingMode === 'ESCALATE' || routingMode === 'UNAVAILABLE') {
    console.log(routingMode === 'ESCALATE'
      ? `ต้องส่งต่อ/ยืนยันก่อนดำเนินงาน: ${scopeResult.targetRole || scopeResult.targetSkill || 'ผู้รับผิดชอบ'}`
      : 'ยังเปิดใช้งานไม่ได้: อ่าน Skill ไม่ได้หรือไม่มี path');
    if (scopeResult.reason) console.log(scopeResult.reason);
    return;
  }
  if (result.routingContract.readiness.status === 'partial') {
    console.log('⚠️ เอกสารอ้างอิงบังคับยังไม่พร้อม — ช่วยร่าง/ตรวจความครบถ้วนเบื้องต้นได้ แต่ยังรับรองตามระเบียบไม่ได้');
    for (const issue of result.routingContract.readiness.issues) {
      console.log(`  • ${issue.id}: ${issue.availability || issue.type} / ${issue.status || 'unverified'}`);
    }
    console.log('  ให้เจ้าของกระบวนการยืนยันเอกสารฉบับปัจจุบันก่อนตัดสินผลตามระเบียบ\n');
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
    console.log(colors.cyan(`   "${result.query}"`));
    console.log(colors.dim('   CLI นี้แสดงแผนเท่านั้น ยังไม่ได้เรียก tool หรือสร้าง run state; host integration ต้องเรียก API และผ่าน action gate แยกต่างหาก\n'));
    return;
  }

  if (routingMode === 'GENERAL') {
    console.log(colors.bold('งานนี้ AI ช่วยได้ทันทีในฐานะผู้ช่วยทั่วไป ไม่ต้องใช้ขั้นตอนเฉพาะของ STeP'));
    console.log(colors.dim('กฎองค์กรเรื่องข้อมูลส่วนบุคคลและการอนุมัติยังใช้เหมือนเดิม และคำตอบจะไม่อ้างว่าเป็นระเบียบของ STeP ถ้าไม่มีเอกสารอ้างอิง'));
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
  console.log(colors.cyan(`   "${result.query}"`));
  console.log(colors.dim('   (ใช้ทักษะ ') + colors.bold(selectedSkill.name) + colors.dim(' เพื่อช่วยเตรียมงานตามแหล่งอ้างอิงที่ตรวจได้ ให้ผู้รับผิดชอบตรวจผลก่อนใช้จริง)\n'));
}
