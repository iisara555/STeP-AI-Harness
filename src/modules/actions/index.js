import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
    if (action.outputReferenceRequired && !action.specPath) {
      errors.push(`Action '${id}' requires specPath when outputReferenceRequired=true`);
    }
  }

  return { valid: errors.length === 0, errors };
}
