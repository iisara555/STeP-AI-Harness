import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createProvenanceRecord } from '../provenance/index.js';

function parseList(raw = '') {
  return raw
    .split(',')
    .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function stripValue(raw = '') {
  return raw.trim().replace(/^['"]|['"]$/g, '');
}

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
      current.name = stripValue(nameMatch[1]);
      continue;
    }

    const ownerMatch = line.match(/^ {4}owner:\s*([a-z0-9_-]+)/);
    if (ownerMatch) {
      current.owner = ownerMatch[1];
      continue;
    }

    const consumersMatch = line.match(/^ {4}consumers:\s*\[(.*?)\]/);
    if (consumersMatch) {
      current.consumers = parseList(consumersMatch[1]);
      continue;
    }

    const descriptionMatch = line.match(/^ {4}description:\s*(.+)/);
    if (descriptionMatch && !currentStep) {
      current.description = stripValue(descriptionMatch[1]);
      continue;
    }

    const requiredMatch = line.match(/^ {4}requiredSignals:\s*\[(.*?)\]/);
    if (requiredMatch) {
      current.requiredSignals = parseList(requiredMatch[1]);
      continue;
    }

    const minMatch = line.match(/^ {4}minSignals:\s*(\d+)/);
    if (minMatch) {
      current.minSignals = Number(minMatch[1]);
      continue;
    }

    const policyMatch = line.match(/^ {4}(sourcePolicy|factPolicy|budgetPolicy|schedulePolicy|outputSchema|specPath):\s*(.+)/);
    if (policyMatch) {
      current[policyMatch[1]] = stripValue(policyMatch[2]);
      continue;
    }

    const parametersMatch = line.match(/^ {4}parameters:\s*\[(.*?)\]/);
    if (parametersMatch) {
      current.parameters = parseList(parametersMatch[1]);
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
      current.signals[signalMatch[1]] = parseList(signalMatch[2]);
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
      currentStep[key] = listMatch ? parseList(listMatch[1]) : [];
    } else {
      currentStep[key] = stripValue(raw);
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

export function detectCompositePlaybook(playbooks, query) {
  const matches = (playbooks || [])
    .map((playbook) => matchPlaybook(playbook, query))
    .filter((match) => match.eligible)
    .sort((a, b) => {
      if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount;
      return b.score - a.score;
    });

  return matches[0] || null;
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
  return `${stamp}-${playbookId}`;
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
  now = new Date(),
}) {
  const sourceCheck = validatePlaybookSources(playbook, sourceRefs);
  if (!sourceCheck.valid) throw new Error(sourceCheck.error);

  const plan = buildPlaybookPlan(playbook, matchedSignals);
  return {
    version: 3,
    runId: makeRunId(playbook.id, now),
    playbookId: playbook.id,
    playbookName: playbook.name,
    query,
    team,
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
      provenance: [],
    },
    events: [
      {
        at: now.toISOString(),
        type: 'run-created',
        stepId: plan[0]?.id || null,
      },
    ],
    feedback: [],
    steps: plan,
  };
}

export async function createPlaybookRun(workspaceDir, args) {
  const state = buildRunState(args);
  const runDir = join(workspaceDir, '.step-ai', 'runs', state.runId);
  await mkdir(runDir, { recursive: true });
  const statePath = join(runDir, 'state.json');
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
  return { ...state, runDir, statePath };
}

export async function readPlaybookRun(workspaceDir, runId) {
  const statePath = join(workspaceDir, '.step-ai', 'runs', runId, 'state.json');
  return JSON.parse(await readFile(statePath, 'utf-8'));
}

export async function updatePlaybookRun(workspaceDir, runId, updater) {
  const current = await readPlaybookRun(workspaceDir, runId);
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  next.updatedAt = new Date().toISOString();
  const statePath = join(workspaceDir, '.step-ai', 'runs', runId, 'state.json');
  await writeFile(statePath, JSON.stringify(next, null, 2), 'utf-8');
  return next;
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


export function resolvePlaybookAction(step, availableTools = [], actionRegistry = {}) {
  if (!step || step.type !== 'action') {
    return { status: 'not-action', tool: '', fallback: '', reason: '' };
  }

  const tools = new Set((availableTools || []).map((tool) => String(tool).toLowerCase().trim()));
  const registered = actionRegistry?.[step.action] || {};
  const preferred = String(step.preferredTool || '').toLowerCase().trim();
  const fallback = String(step.fallback || '').toLowerCase().trim();

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

  if (fallback) {
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

export function completePlaybookStep(state, stepId, outputs = {}) {
  const next = structuredClone(state);
  const step = next.steps?.find((item) => item.id === stepId);
  if (!step) throw new Error(`Unknown Playbook step '${stepId}'`);

  step.status = 'completed';
  step.completedAt = new Date().toISOString();

  next.context ||= {};
  next.context.outputs ||= {};
  next.context.outputs[stepId] = outputs;
  next.events ||= [];
  next.events.push({ at: new Date().toISOString(), type: 'step-completed', stepId });

  const currentIndex = next.steps.findIndex((item) => item.id === stepId);
  const nextStep = next.steps.slice(currentIndex + 1).find((item) => item.status !== 'completed');
  next.currentStep = nextStep?.id || null;
  next.status = nextStep ? 'active' : 'completed';

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

  if (step.actionState.status === 'blocked') {
    next.status = 'waiting-tool';
    next.currentStep = stepId;
  }

  return next;
}


export function addRunProvenance(state, record) {
  const next = structuredClone(state);
  next.context ||= {};
  next.context.provenance ||= [];
  const normalized = createProvenanceRecord(record);
  next.context.provenance.push(normalized);
  next.events ||= [];
  next.events.push({
    at: normalized.createdAt,
    type: 'provenance-added',
    provenanceType: normalized.type,
    sourceRef: normalized.sourceRef || '',
  });
  return next;
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
  next.feedback.push({
    rating,
    category: String(category || '').slice(0, 80),
    note: String(note || '').slice(0, 500),
    createdAt,
  });
  next.events ||= [];
  next.events.push({ at: createdAt, type: 'feedback-recorded', rating, category: String(category || '').slice(0, 80) });
  return next;
}
