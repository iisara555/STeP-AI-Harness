export const STANDARD_PROVENANCE_TYPES = Object.freeze([
  'SOURCE_FACT',
  'DERIVED_FACT',
  'USER_INPUT',
  'PLANNING_ASSUMPTION',
  'ORGANIZATION_RULE',
  'AI_RECOMMENDATION',
]);

const TYPE_SET = new Set(STANDARD_PROVENANCE_TYPES);
export const SOURCE_REQUIRED_TYPES = Object.freeze([
  'SOURCE_FACT',
  'DERIVED_FACT',
  'ORGANIZATION_RULE',
]);
const SOURCE_REQUIRED_SET = new Set(SOURCE_REQUIRED_TYPES);

export function parseProvenanceYaml(text) {
  const types = [];
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed === 'types:' || /^version:/.test(trimmed)) continue;

    const match = line.match(/^ {2}- id:\s*([A-Z_]+)/);
    if (match) {
      current = { id: match[1], description: '', sourceRequired: false };
      types.push(current);
      continue;
    }

    if (!current) continue;
    const description = line.match(/^ {4}description:\s*["']?(.*?)["']?\s*$/);
    if (description) {
      current.description = description[1];
      continue;
    }
    const sourceRequired = line.match(/^ {4}sourceRequired:\s*(true|false)/);
    if (sourceRequired) current.sourceRequired = sourceRequired[1] === 'true';
  }

  return types;
}

export function validateProvenanceTypes(types = []) {
  const errors = [];
  const ids = types.map((t) => t.id);
  const seen = new Set();

  for (const id of ids) {
    if (seen.has(id)) errors.push(`Duplicate provenance type '${id}'`);
    seen.add(id);
  }

  for (const required of STANDARD_PROVENANCE_TYPES) {
    if (!seen.has(required)) errors.push(`Missing provenance type '${required}'`);
  }

  for (const id of seen) {
    if (!TYPE_SET.has(id)) errors.push(`Unknown provenance type '${id}'`);
  }

  for (const type of types) {
    const expected = SOURCE_REQUIRED_SET.has(type.id);
    if (Boolean(type.sourceRequired) !== expected) {
      errors.push(`Provenance type '${type.id}' sourceRequired must be ${expected}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function createProvenanceRecord({
  type,
  value,
  sourceRef = '',
  sourceLocation = '',
  note = '',
  createdAt = new Date().toISOString(),
} = {}) {
  if (!TYPE_SET.has(type)) throw new Error(`Unsupported provenance type '${type}'`);
  if (value === undefined || value === null || value === '') {
    throw new Error('Provenance record requires a non-empty value');
  }
  if (SOURCE_REQUIRED_SET.has(type) && !String(sourceRef || '').trim()) {
    throw new Error(`Provenance type '${type}' requires sourceRef`);
  }

  return {
    type,
    value,
    sourceRef,
    sourceLocation,
    note,
    createdAt,
  };
}
