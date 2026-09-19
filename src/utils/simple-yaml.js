export function stripYamlScalar(raw = '') {
  return String(raw).trim().replace(/^['"]|['"]$/g, '');
}

export function parseYamlInlineList(raw = '') {
  return String(raw)
    .split(',')
    .map((value) => stripYamlScalar(value))
    .filter(Boolean);
}

export function parseYamlBracketList(raw = '') {
  const match = String(raw).trim().match(/^\[(.*?)\]$/);
  return match ? parseYamlInlineList(match[1]) : [];
}
