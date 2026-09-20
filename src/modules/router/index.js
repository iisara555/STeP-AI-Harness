export {
  scoreSkillCandidate,
  rankSkillCandidates,
  WEIGHTS,
  THRESHOLDS,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  resolveWeights,
  resolveThresholds,
  deriveRoutingConfidence,
} from './scorer.js';

export {
  inferIntentFromText,
  extractFileTypes,
  buildContext,
  inspectCheapContext,
  rescoreWithCheapContext,
  INTENT_KEYWORDS,
} from './context-scanner.js';

export { checkScope } from './scope-guard.js';
export { buildRouterGuidelines } from './router-prompt.js';
export { validateManifestIntegrity, loadAndValidateManifests } from './manifest-validator.js';

export { parseAuthorityRegistry, loadAuthorityRegistry, evaluateAuthorityPreflight } from './authority-preflight.js';
