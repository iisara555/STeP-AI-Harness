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

/** "/skill-name request" runs that Skill when it is one the person can use; otherwise the text is sent as typed. */
export function typedSkill(request: string, known: (name: string) => boolean) {
  const typed = /^\/([a-z0-9-]+)\s+([\s\S]+)$/.exec(request.trim());
  return typed && known(typed[1]) ? { skill: typed[1], text: typed[2] } : { skill: '', text: request };
}
