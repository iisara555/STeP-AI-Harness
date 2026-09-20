import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseYamlInlineList, stripYamlScalar } from '../../utils/simple-yaml.js';

export function parseAuthorityRegistry(text = '') {
  const authorities = [];
  let current = null;

  for (const line of String(text).split(/\r?\n/)) {
    const entry = line.match(/^ {2}([a-z0-9-]+):\s*$/);
    if (entry) {
      current = {
        id: entry[1],
        name: '',
        authorizedRole: '',
        alternateRole: '',
        humanInTheLoop: '',
        description: '',
        triggers: [],
      };
      authorities.push(current);
      continue;
    }
    if (!current) continue;

    const scalar = line.match(/^ {4}(name|authorizedRole|alternateRole|humanInTheLoop|description):\s*(.+)$/);
    if (scalar) {
      current[scalar[1]] = stripYamlScalar(scalar[2]);
      continue;
    }

    const triggers = line.match(/^ {4}triggers:\s*\[(.*?)\]\s*$/);
    if (triggers) current.triggers = parseYamlInlineList(triggers[1]);
  }

  return authorities;
}

export async function loadAuthorityRegistry(packageRoot) {
  const text = await readFile(join(packageRoot, 'manifest', 'authority.yaml'), 'utf-8');
  return parseAuthorityRegistry(text);
}

function normalize(value = '') {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function evaluateAuthorityPreflight(query = '', authorities = []) {
  const lower = normalize(query);
  const matches = [];

  for (const authority of authorities || []) {
    if (String(authority.humanInTheLoop).toLowerCase() !== 'mandatory') continue;
    for (const trigger of authority.triggers || []) {
      const normalizedTrigger = normalize(trigger);
      if (!normalizedTrigger || !lower.includes(normalizedTrigger)) continue;
      matches.push({ authority, trigger, specificity: normalizedTrigger.length });
    }
  }

  if (!matches.length) {
    return { status: 'ALLOW', inScope: true, source: 'global-authority-preflight' };
  }

  matches.sort((a, b) => b.specificity - a.specificity);
  const winner = matches[0];

  return {
    status: 'BLOCK',
    inScope: false,
    ruleKey: winner.authority.id,
    targetRole: winner.authority.authorizedRole || 'authorized-human',
    alternateRole: winner.authority.alternateRole || '',
    authority: winner.authority.id,
    matchedTrigger: winner.trigger,
    reason: `คำขอนี้แตะอำนาจมนุษย์ที่บังคับ Human-in-the-loop: ${winner.authority.name}. ${winner.authority.description}`,
    source: 'global-authority-preflight',
  };
}
