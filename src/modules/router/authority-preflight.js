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

// Only remove the approval word inside an explicit request to draft a request
// document. Independent approval/signing clauses remain visible to the gates.
/**
 * A clause that declines an action is not a request to perform it: "ยังไม่ต้องกด
 * Submit" must not trip the submission gate. Drop the negated clause up to the
 * next clause boundary so its verb never reaches a trigger match.
 */
const DECLINED_ACTION = /(?:แต่)?[ \t]*(?:ยังไม่ต้อง|ไม่ต้อง|ยังไม่|อย่าเพิ่ง|อย่า|ห้าม|ไม่ควร|do(?:es)? not|don['’]t|no need to|without)[^,;\n]*/gi;

export function authorityIntentText(query = '') {
  return String(query)
    .replace(/((?:ร่าง|จัดทำ)(?:บันทึก|หนังสือ|เอกสาร)(?:เพื่อ)?(?:ขอ|เสนอขอ))อนุมัติ/g, '$1เสนอพิจารณา')
    .replace(DECLINED_ACTION, ' ');
}

export function evaluateAuthorityPreflight(query = '', authorities = []) {
  const lower = normalize(authorityIntentText(query));
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
