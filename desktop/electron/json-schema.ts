/**
 * Turns a host JSON Schema into the strict form that provider structured-output modes accept (OpenAI `outputSchema` /
 * `json_schema` strict, Gemini `responseJsonSchema`): every object lists all of its properties as required and allows no
 * others, a property that was optional may be null instead of missing, and keywords strict mode rejects are dropped.
 * The host still parses and validates every reply itself; the schema only makes a well-formed reply far more likely.
 */
export function strictJsonSchema(schema: unknown): Record<string, unknown> {
  const convert = (node: any, nullable: boolean): any => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(node)) {
      // Length limits and $schema are not accepted in strict mode; the host clips text to these limits anyway.
      if (['$schema', 'maxLength', 'minLength'].includes(key)) continue;
      // An exclusive bound of 0 becomes an inclusive one; the host rejects a zero-size region when it parses.
      if (key === 'exclusiveMinimum') {
        out.minimum = value;
        continue;
      }
      out[key] = value;
    }
    if (out.items) out.items = convert(out.items, false);
    if (out.properties && typeof out.properties === 'object') {
      const required = new Set<string>(Array.isArray(node.required) ? node.required : []);
      out.properties = Object.fromEntries(Object.entries(out.properties).map(([key, value]) => [key, convert(value, !required.has(key))]));
      out.required = Object.keys(out.properties);
      out.additionalProperties = false;
    }
    if (nullable) {
      const types = Array.isArray(out.type) ? out.type : out.type ? [out.type] : [];
      if (types.length && !types.includes('null')) out.type = [...types, 'null'];
      if (Array.isArray(out.enum) && !out.enum.includes(null)) out.enum = [...out.enum, null];
    }
    return out;
  };
  return convert(schema, false);
}

/**
 * Strips `<think>...</think>` reasoning blocks emitted by local or reasoning models when they appear outside markdown
 * code fences, preserving any literal `<think>` tags inside fenced code examples.
 */
export function stripReasoningBlocks(text: string): string {
  if (!text || !/<\s*think\b/i.test(text)) return text;
  const segments = text.split(/(```[\s\S]*?```)/g);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      return segment.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
    })
    .join('')
    .trim();
}

/**
 * Extracts a JSON object or array from model output that may include `<think>` blocks, markdown code fences, or
 * brief leading/trailing prose. Returns the extracted substring (or the trimmed input if no balanced JSON is found).
 */
export function extractStructuredJson(raw: string): string {
  const cleaned = stripReasoningBlocks(String(raw || '')).trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(cleaned);
  const candidate = (fenced ? fenced[1] : cleaned).trim();
  const objStart = candidate.indexOf('{');
  const arrStart = candidate.indexOf('[');
  const start = objStart >= 0 && arrStart >= 0 ? Math.min(objStart, arrStart) : Math.max(objStart, arrStart);
  if (start < 0) return candidate;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return candidate.slice(start);
}

/**
 * System-prompt instruction for providers without a native JSON Schema wire parameter (Claude SDK, Copilot, OpenAI-compatible).
 */
export function jsonSchemaInstruction(schema: unknown): string {
  return `Respond with a single valid JSON object matching this JSON Schema (no markdown code fences or surrounding commentary):\n${JSON.stringify(strictJsonSchema(schema))}`;
}
