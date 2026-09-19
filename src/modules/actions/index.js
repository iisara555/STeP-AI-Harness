import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const approvals = new WeakSet();

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  throw new Error('Action operation must contain JSON values');
}

export function getOperationHash(actionId, operation) {
  if (!['runId', 'stepId', 'target'].every((key) => typeof operation?.[key] === 'string' && operation[key].trim())
      || !Object.hasOwn(operation, 'payload')) {
    throw new Error('Action operation requires runId, stepId, target and payload');
  }
  return createHash('sha256').update(JSON.stringify([actionId, canonical(operation)])).digest('hex');
}

/** Host integration only. The callback must use an authenticated human UI or
 * existing scoped authorization, never a model-supplied boolean or JSON file.
 * Approvals are in-memory, short-lived and bound to the exact operation.
 */
export async function requestActionApproval(actionId, operation, confirmWithUser) {
  if (typeof confirmWithUser !== 'function') throw new Error('Human confirmation provider is required');
  const snapshot = structuredClone(operation);
  const operationHash = getOperationHash(actionId, snapshot);
  const confirmed = await confirmWithUser({ actionId, operation: snapshot });
  if (confirmed !== true) return null;
  if (getOperationHash(actionId, snapshot) !== operationHash) throw new Error('Action operation changed during confirmation');
  const approval = Object.freeze({ actionId, operationHash, confirmedAt: new Date().toISOString(), expiresAt: Date.now() + 300_000 });
  approvals.add(approval);
  return approval;
}

export function consumeActionApproval(approval) {
  if (approval) approvals.delete(approval);
}

export function evaluateActionGate(action, { operation, approval } = {}) {
  if (!action || !validateActionRegistry({ [action.id || 'action']: action }).valid) {
    return { status: 'blocked', reason: 'unregistered-or-invalid-action' };
  }
  if (action.confirmation === 'human-only' || action.risk === 'restricted') {
    return { status: 'blocked', reason: 'human-only-authority' };
  }
  if (action.confirmation === 'none') return { status: 'allowed', reason: 'no-confirmation-required' };
  let operationHash;
  try { operationHash = getOperationHash(action.id, operation); } catch { /* No complete operation: fail closed. */ }
  if (!approval || !approvals.has(approval) || approval.actionId !== action.id
      || approval.operationHash !== operationHash || approval.expiresAt <= Date.now()) {
    return { status: 'waiting-confirmation', reason: 'scoped-human-confirmation-required' };
  }
  return { status: 'allowed', reason: 'scoped-human-confirmation', operationHash };
}

function strip(raw = '') {
  return raw.trim().replace(/^['"]|['"]$/g, '');
}

function list(raw = '') {
  const match = raw.trim().match(/^\[(.*?)\]$/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((v) => strip(v))
    .filter(Boolean);
}

export function parseActionsYaml(text) {
  const actions = {};
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed === 'actions:' || /^version:/.test(trimmed)) continue;

    const actionMatch = line.match(/^ {2}([a-z0-9_-]+):$/);
    if (actionMatch) {
      current = {
        id: actionMatch[1],
        name: actionMatch[1],
        capability: '',
        risk: '',
        sideEffect: '',
        confirmation: '',
        preferredTools: [],
        outputReferenceRequired: false,
        specPath: '',
      };
      actions[current.id] = current;
      continue;
    }

    if (!current) continue;
    const scalar = line.match(/^ {4}([a-zA-Z][a-zA-Z0-9_-]*):\s*(.+)/);
    if (!scalar) continue;
    const [, key, raw] = scalar;

    if (key === 'preferredTools') current.preferredTools = list(raw);
    else if (key === 'outputReferenceRequired') current.outputReferenceRequired = strip(raw) === 'true';
    else current[key] = strip(raw);
  }

  return actions;
}

export async function loadActionRegistry(packageRoot) {
  const text = await readFile(join(packageRoot, 'manifest', 'actions.yaml'), 'utf-8');
  return parseActionsYaml(text);
}

export function validateActionRegistry(actions = {}) {
  const errors = [];
  const risks = new Set(['low', 'medium', 'high', 'restricted']);
  const confirmations = new Set(['none', 'user-confirm', 'human-only']);
  const effects = new Set(['reversible', 'external', 'irreversible']);

  for (const [id, action] of Object.entries(actions)) {
    if (!action.capability) errors.push(`Action '${id}' has no capability`);
    if (!risks.has(action.risk)) errors.push(`Action '${id}' has invalid risk '${action.risk}'`);
    if (!confirmations.has(action.confirmation)) {
      errors.push(`Action '${id}' has invalid confirmation '${action.confirmation}'`);
    }
    if (!effects.has(action.sideEffect)) {
      errors.push(`Action '${id}' has invalid sideEffect '${action.sideEffect}'`);
    }
    if (!Array.isArray(action.preferredTools) || action.preferredTools.length === 0) {
      errors.push(`Action '${id}' must declare at least one preferred tool`);
    }
    if (action.risk === 'high' && action.confirmation === 'none') {
      errors.push(`Action '${id}' with high risk must require user-confirm or human-only`);
    }
    if (action.risk === 'restricted' && action.confirmation !== 'human-only') {
      errors.push(`Action '${id}' with restricted risk must require human-only`);
    }
    if (action.outputReferenceRequired && !action.specPath) {
      errors.push(`Action '${id}' requires specPath when outputReferenceRequired=true`);
    }
  }

  return { valid: errors.length === 0, errors };
}
