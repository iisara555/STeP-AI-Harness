/** Slash commands typed in the composer that open a screen instead of sending a request to the AI. */
export type ComposerCommand =
  { kind: 'aside'; text: string } | { kind: 'credentials' } | { kind: 'learning'; text: string } | { kind: 'memory' } | { kind: 'usage' };

export function composerCommand(query: string): ComposerCommand | null {
  const text = query.trim();
  if (/^\/btw\s+/i.test(text)) return { kind: 'aside', text: text.replace(/^\/btw\s+/i, '') };
  if (text === '/vault' || text === '/google') return { kind: 'credentials' };
  if (/^\/(learn|learning)(?:\s|$)/.test(text)) return { kind: 'learning', text: text.replace(/^\/(learning|learn)\s*/, '') };
  if (text === '/memory') return { kind: 'memory' };
  if (text === '/usage') return { kind: 'usage' };
  return null;
}

/** A slash starts a picker at a word boundary, including after a request or on its next line. */
export function trailingSkillToken(text: string) {
  const match = /(?:^|\s)\/([\p{L}\p{M}\p{N}_-]*)$/u.exec(text);
  if (!match) return undefined;
  return { query: match[1], start: match.index + match[0].indexOf('/') };
}

/** A known Skill before or after a request is selected without sending the command token as part of the request. */
export function typedSkill(request: string, known: (name: string) => boolean) {
  const trimmed = request.trim();
  const prefix = /^\/([a-z0-9-]+)\s+([\s\S]+)$/i.exec(trimmed);
  if (prefix && known(prefix[1].toLowerCase())) return { skill: prefix[1].toLowerCase(), text: prefix[2] };
  const suffix = trailingSkillToken(trimmed);
  const name = suffix?.query.toLowerCase();
  return suffix?.start && name && known(name)
    ? { skill: name, text: trimmed.slice(0, suffix.start).trimEnd() }
    : { skill: '', text: request };
}
