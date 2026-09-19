const DEFAULT_BUDGETS = Object.freeze({
  startup: 800,
  routing: 300,
  skill: 2500,
  rules: 800,
  sources: 3000,
  handoff: 1500,
  governance: 200,
});

const ESTIMATE_CHARS_PER_TOKEN = 2.5;

export function estimateTextTokens(text = '') {
  const value = String(text || '');
  return {
    chars: value.length,
    estimatedTokens: value ? Math.ceil(value.length / ESTIMATE_CHARS_PER_TOKEN) : 0,
    actualTokens: null,
    method: 'char-estimate-v1',
  };
}

function compactScope(scopeResult = {}) {
  return {
    status: scopeResult.status || 'ALLOW',
    inScope: scopeResult.inScope !== false,
    targetRole: scopeResult.targetRole || '',
    authority: scopeResult.authority || '',
    targetSkill: scopeResult.targetSkill || '',
    playbookStep: scopeResult.playbookStep || '',
  };
}

export function buildCompactRoutingContract({
  selectedSkill = null,
  selectedPlaybook = null,
  playbookPlan = [],
  teamInfo = {},
  scopeResult = {},
  bestMatch = null,
  skillMetadata = null,
  referenceMetadata = [],
} = {}) {
  const contract = {
    version: 1,
    routingEngine: 'local-deterministic',
    routerRegistrySentToModel: false,
    mode: selectedPlaybook ? 'PLAYBOOK' : 'SKILL',
    team: teamInfo?.id || '',
    skill: selectedSkill?.name || '',
    skillPath: skillMetadata?.path || '',
    process: selectedSkill?.processId || '',
    confidence: bestMatch ? Number(bestMatch.score.toFixed(3)) : null,
    playbook: selectedPlaybook?.id || '',
    steps: (playbookPlan || []).map((step) => ({
      id: step.id,
      type: step.type,
      skill: step.skill || '',
      action: step.action || '',
    })),
    mandatoryReferences: (referenceMetadata || []).map((ref) => ({
      id: ref.id,
      path: ref.path || '',
      status: ref.status || '',
    })),
    authority: compactScope(scopeResult),
  };

  return contract;
}

export function buildContextBudgetPlan({
  routingContract = {},
  skillText = '',
  ruleTexts = [],
  sourceTexts = [],
  handoff = null,
  budgets = {},
} = {}) {
  const limit = { ...DEFAULT_BUDGETS, ...budgets };
  const routingText = JSON.stringify(routingContract);
  const rulesText = (ruleTexts || []).join('\n');
  const sourcesText = (sourceTexts || []).join('\n');
  const handoffText = handoff ? JSON.stringify(handoff) : '';

  const components = {
    routing: { ...estimateTextTokens(routingText), budget: limit.routing },
    skill: { ...estimateTextTokens(skillText), budget: limit.skill },
    rules: { ...estimateTextTokens(rulesText), budget: limit.rules },
    sources: { ...estimateTextTokens(sourcesText), budget: limit.sources },
    handoff: { ...estimateTextTokens(handoffText), budget: limit.handoff },
    governance: { estimatedTokens: 0, actualTokens: null, chars: 0, method: 'char-estimate-v1', budget: limit.governance },
  };

  for (const value of Object.values(components)) {
    value.overBudget = value.estimatedTokens > value.budget;
  }

  return {
    version: 1,
    policy: 'progressive-disclosure',
    budgets: limit,
    components,
    estimatedHarnessTokens: Object.values(components)
      .reduce((sum, item) => sum + item.estimatedTokens, 0),
    routerRegistryIncluded: false,
    fullSkillInventoryIncluded: false,
    unrelatedRulesIncluded: false,
  };
}

function clampString(value, maxChars) {
  const text = String(value || '');
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 24)) + '…[handoff-truncated]';
}

function compactValue(value, depth = 0) {
  if (depth > 5) return '[max-depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return clampString(value, 1200);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => compactValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([key, item]) => [key, compactValue(item, depth + 1)])
    );
  }
  return String(value);
}

export function buildStructuredHandoff(step, outputs = {}, {
  maxEstimatedTokens = DEFAULT_BUDGETS.handoff,
} = {}) {
  const compacted = compactValue(outputs);
  const produces = Array.isArray(step?.produces) ? step.produces : [];
  const envelope = {
    version: 1,
    fromStep: step?.id || '',
    producedKeys: produces,
    data: compacted,
  };

  let telemetry = estimateTextTokens(JSON.stringify(envelope));
  if (telemetry.estimatedTokens <= maxEstimatedTokens) {
    return { ...envelope, truncated: false, telemetry };
  }

  const maxChars = Math.floor(maxEstimatedTokens * ESTIMATE_CHARS_PER_TOKEN);
  const serialized = JSON.stringify(compacted);
  const fallback = {
    version: 1,
    fromStep: step?.id || '',
    producedKeys: produces,
    data: {
      compactSummary: clampString(serialized, Math.max(200, maxChars - 300)),
    },
    truncated: true,
  };
  telemetry = estimateTextTokens(JSON.stringify(fallback));
  return { ...fallback, telemetry };
}

export function getStepHandoffContext(state, stepId = '') {
  const step = state?.steps?.find((item) => item.id === stepId)
    || state?.steps?.find((item) => item.id === state?.currentStep);
  if (!step) return { version: 1, consumes: [], inputs: {} };

  const consumes = Array.isArray(step.consumes) ? step.consumes : [];
  const inputs = {};
  const handoffs = state?.context?.handoffs || {};

  for (const handoff of Object.values(handoffs)) {
    const data = handoff?.data;
    if (!data || typeof data !== 'object') continue;

    for (const key of consumes) {
      if (Object.hasOwn(data, key)) inputs[key] = data[key];
    }
  }

  // Compatibility fallback: some current Skills return compact objects whose
  // keys do not exactly match Playbook produces/consumes yet.
  if (Object.keys(inputs).length === 0 && consumes.length > 0) {
    const previous = Object.values(handoffs).at(-1);
    if (previous?.data) inputs.previousStep = previous.data;
  }

  return {
    version: 1,
    stepId: step.id,
    consumes,
    inputs,
    telemetry: estimateTextTokens(JSON.stringify(inputs)),
  };
}

export function createUsageTelemetry({
  queryText = '',
  routingContract = null,
  skillText = '',
  ruleTexts = [],
  sourceTexts = [],
  handoff = null,
  actualInputTokens = null,
  actualOutputTokens = null,
} = {}) {
  const task = estimateTextTokens(queryText);
  const plan = buildContextBudgetPlan({
    routingContract: routingContract || {},
    skillText,
    ruleTexts,
    sourceTexts,
    handoff,
  });

  return {
    version: 1,
    accounting: actualInputTokens === null && actualOutputTokens === null
      ? 'estimated'
      : 'provider-reported-partial',
    estimateMethod: 'char-estimate-v1',
    inputTokens: actualInputTokens,
    outputTokens: actualOutputTokens,
    taskData: task,
    harnessContext: {
      estimatedTokens: plan.estimatedHarnessTokens,
      actualTokens: null,
    },
    components: plan.components,
  };
}

export function mergeActualUsage(usage = {}, {
  inputTokens = null,
  outputTokens = null,
} = {}) {
  return {
    ...usage,
    accounting: inputTokens !== null || outputTokens !== null
      ? 'provider-reported-partial'
      : usage.accounting || 'estimated',
    inputTokens: inputTokens ?? usage.inputTokens ?? null,
    outputTokens: outputTokens ?? usage.outputTokens ?? null,
  };
}

export { DEFAULT_BUDGETS };
