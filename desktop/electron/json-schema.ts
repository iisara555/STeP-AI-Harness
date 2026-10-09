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
