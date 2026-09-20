import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createProvenanceRecord } from '../provenance/index.js';
import { sanitizeRunData, evaluatePrivacyGate } from '../privacy/index.js';
import { evaluateActionGate, loadActionRegistry, consumeActionApproval } from '../actions/index.js';
import { verifyActionOutput, getOutputReference } from '../actions/output-verification.js';
import { fileURLToPath } from 'node:url';
import {
  buildStructuredHandoff,
  getStepHandoffContext,
  createUsageTelemetry,
  mergeActualUsage,
} from '../context-budget/index.js';
import { parseYamlInlineList, stripYamlScalar } from '../../utils/simple-yaml.js';

export function parsePlaybooksYaml(text) {
  const playbooks = [];
  let current = null;
  let currentStep = null;
  let section = '';

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const pbMatch = line.match(/^ {2}- id:\s*([a-z0-9_-]+)/);
    if (pbMatch) {
      current = {
        id: pbMatch[1],
        name: pbMatch[1],
        owner: '',
        consumers: [],
        description: '',
        requiredSignals: [],
        minSignals: 2,
        sourcePolicy: '',
        factPolicy: '',
        budgetPolicy: '',
        schedulePolicy: '',
        parameters: [],
        outputSchema: '',
        specPath: '',
        signals: {},
        steps: [],
      };
      playbooks.push(current);
      currentStep = null;
      section = '';
      continue;
    }

    if (!current) continue;

    const nameMatch = line.match(/^ {4}name:\s*(.+)/);
    if (nameMatch) {
      current.name = stripYamlScalar(nameMatch[1]);
      continue;
    }

    const ownerMatch = line.match(/^ {4}owner:\s*([a-z0-9_-]+)/);
    if (ownerMatch) {
      current.owner = ownerMatch[1];
      continue;
    }

    const consumersMatch = line.match(/^ {4}consumers:\s*\[(.*?)\]/);
    if (consumersMatch) {
      current.consumers = parseYamlInlineList(consumersMatch[1]);
      continue;
    }

    const descriptionMatch = line.match(/^ {4}description:\s*(.+)/);
    if (descriptionMatch && !currentStep) {
      current.description = stripYamlScalar(descriptionMatch[1]);
      continue;
    }

    const requiredMatch = line.match(/^ {4}requiredSignals:\s*\[(.*?)\]/);
    if (requiredMatch) {
      current.requiredSignals = parseYamlInlineList(requiredMatch[1]);
      continue;
    }

    const minMatch = line.match(/^ {4}minSignals:\s*(\d+)/);
    if (minMatch) {
      current.minSignals = Number(minMatch[1]);
      continue;
    }

    const policyMatch = line.match(/^ {4}(sourcePolicy|factPolicy|budgetPolicy|schedulePolicy|outputSchema|specPath|clarificationLabel):\s*(.+)/);
    if (policyMatch) {
      current[policyMatch[1]] = stripYamlScalar(policyMatch[2]);
      continue;
    }

    const parametersMatch = line.match(/^ {4}parameters:\s*\[(.*?)\]/);
    if (parametersMatch) {
      current.parameters = parseYamlInlineList(parametersMatch[1]);
      continue;
    }

    if (/^ {4}signals:/.test(line)) {
      section = 'signals';
      currentStep = null;
      continue;
    }

    if (/^ {4}steps:/.test(line)) {
      section = 'steps';
      currentStep = null;
      continue;
    }

    const signalMatch = line.match(/^ {6}([a-z0-9_-]+):\s*\[(.*?)\]/);
    if (section === 'signals' && signalMatch) {
      current.signals[signalMatch[1]] = parseYamlInlineList(signalMatch[2]);
      continue;
    }

    const stepMatch = line.match(/^ {6}- id:\s*([a-z0-9_-]+)/);
    if (section === 'steps' && stepMatch) {
      currentStep = {
        id: stepMatch[1],
        type: '',
        skill: '',
        action: '',
        when: '',
        preferredTool: '',
        fallback: '',
        description: '',
        consumes: [],
        produces: [],
      };
      current.steps.push(currentStep);
      continue;
    }

    if (!currentStep) continue;

    const scalar = line.match(/^ {8}([a-zA-Z][a-zA-Z0-9_-]*):\s*(.+)/);
    if (!scalar) continue;

    const [, key, raw] = scalar;
    if (['consumes', 'produces'].includes(key)) {
      const listMatch = raw.match(/^\[(.*?)\]$/);
      currentStep[key] = listMatch ? parseYamlInlineList(listMatch[1]) : [];
    } else {
      currentStep[key] = stripYamlScalar(raw);
    }
  }

  return playbooks;
}

export async function loadPlaybooks(packageRoot) {
  const path = join(packageRoot, 'manifest', 'playbooks.yaml');
  const text = await readFile(path, 'utf-8');
  return parsePlaybooksYaml(text);
}

function normalize(text = '') {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function matchPlaybook(playbook, query) {
  const lower = normalize(query);
  const matchedSignals = [];

  for (const [signal, keywords] of Object.entries(playbook.signals || {})) {
    if (keywords.some((keyword) => lower.includes(normalize(keyword)))) {
      matchedSignals.push(signal);
    }
  }

  const requiredMatched = (playbook.requiredSignals || []).every((signal) =>
    matchedSignals.includes(signal)
  );

  const eligible = requiredMatched && matchedSignals.length >= Number(playbook.minSignals || 2);
  const signalCount = Object.keys(playbook.signals || {}).length || 1;
  const score = matchedSignals.length / signalCount;

  return {
    playbook,
    eligible,
    matchedSignals,
    matchedCount: matchedSignals.length,
    score,
  };
}

function rankPlaybookMatches(playbooks, query) {
  return (playbooks || [])
    .map((playbook) => matchPlaybook(playbook, query))
    .filter((match) => match.eligible)
    .sort((a, b) => {
      if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount;
      return b.score - a.score || a.playbook.id.localeCompare(b.playbook.id);
    });
}

function closePlaybookMatches(matches) {
  const best = matches[0];
  if (!best) return [];
  // One signal (20% for a five-signal flow) is insufficient separation.
  return matches.filter((match) => best.matchedCount - match.matchedCount <= 1
    && Math.abs(best.score - match.score) <= 0.20 + Number.EPSILON);
}

function choosePlaybookFromAnswer(candidates, answer) {
  // Adapters accumulate replies one per line. The latest reply decides which
  // flow to start; earlier context still supplies its requested output steps.
  const latest = normalize(String(answer || '').split(/\r?\n/).filter((line) => line.trim()).at(-1));
  if (!latest || /ไม่|ยกเว้น|\b(?:not|neither|except)\b/.test(latest)) return null;
  if (/^[1-9]\d*$/.test(latest)) return candidates[Number(latest) - 1] || null;

  const explicit = candidates.filter(({ playbook }) =>
    [playbook.id, playbook.clarificationLabel, playbook.name]
      .filter(Boolean).some((label) => normalize(label) === latest));
  if (explicit.length === 1) return explicit[0];

  // Shared planning/output words must not resolve the tie. A unique source
  // or other required-domain signal can: e.g. "เริ่มจากบันทึกประชุม".
  const domainMatches = candidates.filter(({ playbook }) => {
    const match = matchPlaybook(playbook, latest);
    const required = playbook.requiredSignals || [];
    return required.length > 0
      && required.every((signal) => match.matchedSignals.includes(signal));
  });
  return domainMatches.length === 1 ? domainMatches[0] : null;
}

export function detectCompositePlaybook(playbooks, query, { clarificationAnswer = '' } = {}) {
  const initialMatches = rankPlaybookMatches(playbooks, query);
  const initialCandidates = closePlaybookMatches(initialMatches);
  const combinedQuery = `${query}\n${typeof clarificationAnswer === 'string' ? clarificationAnswer : ''}`;
  // Preserve the original displayed choices when the reply is an option number.
  const matches = initialCandidates.length > 1 || !clarificationAnswer
    ? initialMatches
    : rankPlaybookMatches(playbooks, combinedQuery);
  const candidates = closePlaybookMatches(matches);
  if (candidates.length < 2) return matches[0] || null;

  const chosen = choosePlaybookFromAnswer(candidates, clarificationAnswer);
  if (chosen) return matchPlaybook(chosen.playbook, combinedQuery);
  return { playbook: null, ambiguous: true, candidates };
}

export function buildPlaybookPlan(playbook, matchedSignals = []) {
  const signalSet = new Set(matchedSignals);
  return (playbook.steps || [])
    .filter((step) => !step.when || signalSet.has(step.when))
    .map((step, index) => ({
      order: index + 1,
      ...step,
      status: 'pending',
    }));
}

function makeRunId(playbookId, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
  return `${stamp}-${playbookId}-${randomUUID()}`;
}

export function validatePlaybookSources(playbook, sourceRefs = []) {
  const refs = Array.isArray(sourceRefs) ? sourceRefs.filter(Boolean) : [];

  if (playbook?.sourcePolicy === 'one-tor-per-run' && refs.length > 1) {
    return {
      valid: false,
      error: 'This Playbook requires one TOR source per run. Create separate runs for separate TOR documents.',
    };
  }

  return { valid: true, error: '' };
}

export function buildRunState({
  playbook,
  query,
  team = '',
  matchedSignals = [],
  sourceRefs = [],
  routingContract = null,
  execution = {},
  now = new Date(),
}) {
  const sourceCheck = validatePlaybookSources(playbook, sourceRefs);
  if (!sourceCheck.valid) throw new Error(sourceCheck.error);

  const plan = buildPlaybookPlan(playbook, matchedSignals);
  const privacy = evaluatePrivacyGate(query || '');
  const usage = createUsageTelemetry({
    queryText: privacy.redactedText,
    routingContract,
    governanceText: JSON.stringify(routingContract?.authority || {}),
  });
  return sanitizeRunData({
    version: 3,
    runId: makeRunId(playbook.id, now),
    playbookId: playbook.id,
    playbookName: playbook.name,
    query: privacy.redactedText,
    team,
    execution: {
      modelId: execution.modelId || null,
      harnessRevision: execution.harnessRevision || null,
      skillVersions: execution.skillVersions || {},
      sourceVersions: execution.sourceVersions || {},
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    currentStep: plan[0]?.id || null,
    matchedSignals,
    sourceRefs,
    policies: {
      sourcePolicy: playbook.sourcePolicy || '',
      factPolicy: playbook.factPolicy || '',
      budgetPolicy: playbook.budgetPolicy || '',
      schedulePolicy: playbook.schedulePolicy || '',
    },
    parameters: Object.fromEntries((playbook.parameters || []).map((key) => [key, null])),
    outputSchema: playbook.outputSchema || '',
    specPath: playbook.specPath || '',
    status: 'active',
    context: {
      facts: {},
      assumptions: {},
      missingInformation: [],
      outputs: {},
      handoffs: {},
      provenance: [],
      privacy: privacy.logSafeMetadata,
    },
    events: [
      {
        at: now.toISOString(),
        type: 'run-created',
        stepId: plan[0]?.id || null,
      },
    ],
    feedback: [],
    usage,
    steps: plan,
  });
}

function runPath(workspaceDir, runId) {
  if (typeof runId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error('Invalid run ID');
  return join(workspaceDir, '.step-ai', 'runs', runId, 'state.json');
}

async function persistRun(statePath, state) {
  const safe = sanitizeRunData(state);
  const tempPath = `${statePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, JSON.stringify(safe, null, 2), { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
    await rename(tempPath, statePath);
  } finally {
    await rm(tempPath, { force: true });
  }
  return safe;
}

export async function createPlaybookRun(workspaceDir, args) {
  const state = buildRunState(args);
  const runDir = join(workspaceDir, '.step-ai', 'runs', state.runId);
  const statePath = runPath(workspaceDir, state.runId);
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  const safe = await persistRun(statePath, state);
  return { ...safe, runDir, statePath };
}

export async function readPlaybookRun(workspaceDir, runId) {
  const statePath = runPath(workspaceDir, runId);
  return sanitizeRunData(JSON.parse(await readFile(statePath, 'utf-8')));
}

function assertStableStepPlan(currentSteps = [], nextSteps = []) {
  if (!Array.isArray(nextSteps) || currentSteps.length !== nextSteps.length) {
    throw new Error('Cannot change Playbook step plan during a run');
  }

  for (let index = 0; index < currentSteps.length; index++) {
    const current = currentSteps[index];
    const next = nextSteps[index];
    if (!next
        || next.id !== current.id
        || next.type !== current.type
        || (current.type === 'skill' && next.skill !== current.skill)
        || (current.type === 'action' && next.action !== current.action)) {
      throw new Error('Cannot change Playbook step plan during a run');
    }
  }
}

export async function updatePlaybookRun(workspaceDir, runId, updater) {
  const current = await readPlaybookRun(workspaceDir, runId);
  const previousActions = new Map(current.steps?.filter((step) => step.type === 'action').map((step) => [step.id, step.status]));
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  if (next.runId !== runId) throw new Error('Cannot change run ID');
  assertStableStepPlan(current.steps || [], next.steps);
  if (next.status === 'completed' && next.steps.some((step) => step.status !== 'completed')) {
    throw new Error('A completed run requires every step to be completed');
  }
  const completesAction = next.steps?.some((step) => (step.type === 'action' || previousActions.has(step.id))
    && step.status === 'completed' && previousActions.get(step.id) !== 'completed');
  if (completesAction && verifiedCompletedStates.get(next) !== stateDigest(next)) {
    throw new Error('Persisting completed action requires completePlaybookAction verification');
  }
  next.updatedAt = new Date().toISOString();
  return persistRun(runPath(workspaceDir, runId), next);
}


export function validatePlaybookRegistry(playbooks, { skills = new Set(), teams = new Set(), actions = new Set() } = {}) {
  const errors = [];
  const seen = new Set();

  for (const playbook of playbooks || []) {
    if (seen.has(playbook.id)) errors.push(`Duplicate playbook id '${playbook.id}'`);
    seen.add(playbook.id);

    if (!playbook.owner) errors.push(`Playbook '${playbook.id}' has no owner`);
    if (playbook.owner && teams.size > 0 && !teams.has(playbook.owner)) {
      errors.push(`Playbook '${playbook.id}' references unknown owner '${playbook.owner}'`);
    }

    if (!Array.isArray(playbook.steps) || playbook.steps.length < 2) {
      errors.push(`Playbook '${playbook.id}' must contain at least 2 steps`);
    }

    if (playbook.sourcePolicy === 'one-tor-per-run' && !playbook.specPath) {
      errors.push(`Playbook '${playbook.id}' with one-tor-per-run policy must define specPath`);
    }

    if (playbook.budgetPolicy === 'source-only-no-auto-allocation' && !playbook.outputSchema) {
      errors.push(`Playbook '${playbook.id}' with source-only budget policy must define outputSchema`);
    }

    for (const required of playbook.requiredSignals || []) {
      if (!Object.hasOwn(playbook.signals || {}, required)) {
        errors.push(`Playbook '${playbook.id}' requires unknown signal '${required}'`);
      }
    }

    const stepIds = new Set();
    for (const step of playbook.steps || []) {
      if (stepIds.has(step.id)) errors.push(`Playbook '${playbook.id}' has duplicate step '${step.id}'`);
      stepIds.add(step.id);

      if (step.when && !Object.hasOwn(playbook.signals || {}, step.when)) {
        errors.push(`Playbook '${playbook.id}' step '${step.id}' references unknown signal '${step.when}'`);
      }

      if (step.type === 'skill') {
        if (!step.skill) {
          errors.push(`Playbook '${playbook.id}' step '${step.id}' has no Skill`);
        } else if (skills.size > 0 && !skills.has(step.skill)) {
          errors.push(`Playbook '${playbook.id}' step '${step.id}' references unknown Skill '${step.skill}'`);
        }
      } else if (step.type === 'action') {
        if (!step.action) errors.push(`Playbook '${playbook.id}' step '${step.id}' has no action`);
        else if (actions.size > 0 && !actions.has(step.action)) {
          errors.push(`Playbook '${playbook.id}' step '${step.id}' references unknown Action '${step.action}'`);
        }
        if (step.completionCriteria === 'output-reference-required' && !step.actionSpecPath) {
          errors.push(`Playbook '${playbook.id}' action '${step.id}' requires actionSpecPath for output-reference completion`);
        }
      } else {
        errors.push(`Playbook '${playbook.id}' step '${step.id}' has unsupported type '${step.type}'`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}


export function resolvePlaybookAction(step, availableTools = [], actionRegistry = {}, authorization = {}) {
  if (!step || step.type !== 'action') {
    return { status: 'not-action', tool: '', fallback: '', reason: '' };
  }

  const tools = new Set((availableTools || []).map((tool) => String(tool).toLowerCase().trim()));
  const registered = actionRegistry?.[step.action];
  if (registered?.confirmation === 'user-confirm' && authorization.operation?.stepId !== step.id) {
    return { status: 'waiting-confirmation', reason: 'confirmation-step-mismatch', tool: '', fallback: '' };
  }
  const gate = evaluateActionGate(registered, authorization);
  if (gate.status !== 'allowed') return { ...gate, tool: '', fallback: '' };
  const registryTools = Array.isArray(registered.preferredTools) ? registered.preferredTools : [];
  const preferred = String(step.preferredTool || registryTools[0] || '').toLowerCase().trim();
  const fallback = String(step.fallback || registryTools[1] || '').toLowerCase().trim();

  if (preferred && tools.has(preferred)) {
    return {
      status: 'ready',
      tool: preferred,
      fallback,
      reason: 'preferred-tool-available',
      capability: step.capability || registered.capability || '',
      risk: registered.risk || '',
      confirmation: registered.confirmation || '',
    };
  }

  if (fallback && tools.has(fallback)) {
    return {
      status: 'fallback',
      tool: fallback,
      fallback,
      reason: preferred ? 'preferred-tool-unavailable' : 'fallback-only',
      capability: step.capability || registered.capability || '',
      risk: registered.risk || '',
      confirmation: registered.confirmation || '',
    };
  }

  return {
    status: 'blocked',
    tool: '',
    fallback: '',
    reason: 'no-supported-tool',
    capability: step.capability || registered.capability || '',
    risk: registered.risk || '',
    confirmation: registered.confirmation || '',
  };
}

const verifiedActionOutputs = new WeakMap();
const verifiedCompletedStates = new WeakMap();

function stateDigest(state) {
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

/** Verification only: does not execute the external action or fabricate output.
 * Host adapters must gate BEFORE execution and supply a trusted remote verifier.
 */
export async function completePlaybookAction(state, stepId, outputs = {}, options = {}) {
  const step = state.steps?.find((item) => item.id === stepId);
  if (!step || step.type !== 'action') throw new Error('Unknown action step');
  if (step.status === 'completed') throw new Error('Action already completed; reconcile before retry');
  if (state.currentStep !== stepId) throw new Error('Complete previous steps first');
  const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const registry = await loadActionRegistry(packageRoot);
  if (registry[step.action]?.confirmation === 'user-confirm'
      && (options.authorization?.operation?.runId !== state.runId || options.authorization?.operation?.stepId !== stepId)) {
    throw new Error('Action blocked: confirmation must match this run and step');
  }
  const gate = evaluateActionGate(registry[step.action], options.authorization);
  if (gate.status !== 'allowed') throw new Error(`Action blocked: ${gate.reason}`);
  const snapshot = structuredClone(outputs);
  const verification = await verifyActionOutput(snapshot, options);
  verifiedActionOutputs.set(snapshot, { runId: state.runId, stepId, verification });
  const completed = completePlaybookStep(state, stepId, snapshot);
  consumeActionApproval(options.authorization?.approval);
  return completed;
}

export function completePlaybookStep(state, stepId, outputs = {}) {
  const next = structuredClone(state);
  const step = next.steps?.find((item) => item.id === stepId);
  if (!step) throw new Error(`Unknown Playbook step '${stepId}'`);

  if (step.status === 'completed') throw new Error('Step already completed');
  if (state.currentStep !== stepId) throw new Error('Complete previous steps first');
  if (step.type === 'action') {
    getOutputReference(outputs);
    const receipt = verifiedActionOutputs.get(outputs);
    if (!receipt || receipt.runId !== state.runId || receipt.stepId !== stepId) {
      throw new Error('Action requires verified output; use completePlaybookAction');
    }
    step.outputVerification = receipt.verification;
    verifiedActionOutputs.delete(outputs);
  }

  step.status = 'completed';
  step.completedAt = new Date().toISOString();

  next.context ||= {};
  next.context.outputs ||= {};
  next.context.handoffs ||= {};
  const safeOutputs = sanitizeRunData(outputs);
  next.context.outputs[stepId] = safeOutputs;

  const handoff = buildStructuredHandoff(step, safeOutputs);
  next.context.handoffs[stepId] = handoff;

  next.events ||= [];
  next.events.push({ at: new Date().toISOString(), type: 'step-completed', stepId });
  next.events.push({
    at: new Date().toISOString(),
    type: 'handoff-created',
    stepId,
    estimatedTokens: handoff.telemetry?.estimatedTokens || 0,
    truncated: Boolean(handoff.truncated),
  });

  const currentIndex = next.steps.findIndex((item) => item.id === stepId);
  const nextStep = next.steps.slice(currentIndex + 1).find((item) => item.status !== 'completed');
  next.currentStep = nextStep?.id || null;
  next.status = nextStep ? 'active' : 'completed';

  const safe = sanitizeRunData(next);
  if (step.type === 'action') verifiedCompletedStates.set(safe, stateDigest(safe));
  return safe;
}


export function getPlaybookStepContext(state, stepId = '') {
  const handoffContext = getStepHandoffContext(state, stepId);
  return {
    ...handoffContext,
    parameters: state?.parameters || {},
    policies: state?.policies || {},
    sourceRefs: state?.sourceRefs || [],
  };
}

export function recordRunUsage(state, {
  inputTokens = null,
  outputTokens = null,
} = {}) {
  const next = structuredClone(state);
  next.usage = mergeActualUsage(next.usage || {}, { inputTokens, outputTokens });
  next.events ||= [];
  next.events.push({
    at: new Date().toISOString(),
    type: 'usage-recorded',
    inputTokens,
    outputTokens,
    accounting: next.usage.accounting,
  });
  return next;
}

export function markPlaybookActionState(state, stepId, actionResolution) {
  const next = structuredClone(state);
  const step = next.steps?.find((item) => item.id === stepId);
  if (!step) throw new Error(`Unknown Playbook step '${stepId}'`);
  if (step.type !== 'action') throw new Error(`Playbook step '${stepId}' is not an action`);

  step.actionState = {
    status: actionResolution?.status || 'blocked',
    tool: actionResolution?.tool || '',
    reason: actionResolution?.reason || '',
  };

  next.events ||= [];
  next.events.push({
    at: new Date().toISOString(),
    type: 'action-resolved',
    stepId,
    status: step.actionState.status,
    tool: step.actionState.tool,
  });

  if (step.actionState.status === 'waiting-confirmation') {
    next.status = 'waiting-confirmation';
    next.currentStep = stepId;
  } else if (step.actionState.status === 'blocked') {
    next.status = step.actionState.reason === 'no-supported-tool' ? 'waiting-tool' : 'blocked';
    next.currentStep = stepId;
  }

  return sanitizeRunData(next);
}


export function addRunProvenance(state, record) {
  const next = structuredClone(state);
  next.context ||= {};
  next.context.provenance ||= [];
  const normalized = sanitizeRunData(createProvenanceRecord(record));
  next.context.provenance.push(normalized);
  next.events ||= [];
  next.events.push({
    at: normalized.createdAt,
    type: 'provenance-added',
    provenanceType: normalized.type,
    sourceRef: normalized.sourceRef || '',
  });
  return sanitizeRunData(next);
}

export function recordRunFeedback(state, {
  rating,
  category = '',
  note = '',
  createdAt = new Date().toISOString(),
} = {}) {
  const allowedRatings = new Set(['useful', 'needs-fix', 'not-useful']);
  if (!allowedRatings.has(rating)) {
    throw new Error("Feedback rating must be one of: useful, needs-fix, not-useful");
  }

  const next = structuredClone(state);
  next.feedback ||= [];
  const safeNote = sanitizeRunData(String(note || ''));
  next.feedback.push({
    rating,
    category: String(category || '').slice(0, 80),
    note: safeNote.slice(0, 500),
    createdAt,
  });
  next.events ||= [];
  next.events.push({ at: createdAt, type: 'feedback-recorded', rating, category: String(category || '').slice(0, 80) });
  return sanitizeRunData(next);
}
