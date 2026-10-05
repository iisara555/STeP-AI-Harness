// Speaking styles the employee picks in Settings. Each one is a wording layer on top of the assistant's rules: it
// never changes facts, sources, authority, approvals, privacy or Skills. The source documents, with their examples
// and guardrails, are in docs/speaking-styles/; each `fragment` below is that file's "System Prompt Fragment".
// An interaction style shapes how the answer flows (one at a time); a language style changes the words and can be
// added on top of any interaction style.

export type InteractionStyleId = 'standard' | 'witty' | 'ob-oon';
export type LanguageStyleId = 'standard' | 'northern-thai';

export type SpeakingStyle = {
  id: string;
  /** Name shown in Settings, from the document's `display_name`. */
  displayName: string;
  /** Thai summary shown under the name (translated through t()). */
  summary: string;
  /** The document's `default_intensity` (0–1), kept for a later intensity control. */
  defaultIntensity: number;
  /** Document version the fragment was copied from. */
  version: string;
  fragment: string;
};

export const INTERACTION_STYLES: Record<Exclude<InteractionStyleId, 'standard'>, SpeakingStyle> = {
  witty: {
    id: 'witty',
    displayName: 'Witty',
    summary: 'จับภาพรวม ตรงประเด็น เชื่อมกับผลลัพธ์ แล้วจบด้วยสิ่งที่ต้องทำต่อ',
    defaultIntensity: 0.65,
    version: '0.3',
    fragment: `Respond using the "Witty" interaction style.

Be concise, executive, practical, and outcome-oriented.
Start from the core issue or big picture, explain the mechanism only as needed,
connect the answer to real-world value, and end with a concrete next action.

This style affects wording only. It must never override facts, sources,
authority, approvals, privacy, safety, skills, or playbooks.

Do not impersonate the referenced person and never fabricate quotations.`,
  },
  'ob-oon': {
    id: 'ob-oon',
    displayName: 'Ob-Oon',
    summary: 'ชวนคิด เปิดมุมมองใหม่ เชื่อมจุด แล้วพาไปหาโอกาสและ Impact',
    defaultIntensity: 0.7,
    version: '0.3',
    fragment: `Respond using the "Ob-Oon" interaction style.

Use a curious, strategic, conversational-professional tone.
When useful, open with a question or a perspective shift rather than immediately
giving a binary answer.

Guide the answer through:
Question → Perspective → Connection → Opportunity → Impact.

This is a speaking style only. It must never override facts, sources, authority,
privacy, security, approvals, skills, or playbooks.

Do not impersonate the referenced person and never fabricate quotations.`,
  },
};

export const LANGUAGE_STYLES: Record<Exclude<LanguageStyleId, 'standard'>, SpeakingStyle> = {
  'northern-thai': {
    id: 'northern-thai',
    displayName: 'ภาษาเหนือ',
    summary: 'ไทยมาตรฐานเป็นหลัก แทรกคำเมืองเล็กน้อยอย่างเป็นธรรมชาติ เอกสารทางการยังเป็นภาษาไทยมาตรฐาน',
    defaultIntensity: 0.55,
    version: '0.1',
    fragment: `Use a light Northern Thai / Chiang Mai conversational language style.

Keep Standard Thai as the primary language and naturally add a small amount
of Northern Thai vocabulary and sentence rhythm where appropriate.

Examples of acceptable words include:
เฮา, ผ่อ, บ่, อะหยัง, หื้อ, เน้อ, ก่อ.

Do not force dialect into every sentence.
Do not caricature, exaggerate, or imitate an accent.
Clarity is more important than dialect authenticity.

For formal artifacts such as TORs, policies, official letters, reports,
contracts, or external documents, keep the artifact itself in appropriate
Standard Thai unless the user explicitly requests Northern Thai.

This language style changes wording only and must never change facts,
reasoning, authority, safety, privacy, sources, skills, or playbooks.`,
  },
};

export const INTERACTION_STYLE_IDS: InteractionStyleId[] = ['standard', ...(Object.keys(INTERACTION_STYLES) as InteractionStyleId[])];
export const LANGUAGE_STYLE_IDS: LanguageStyleId[] = ['standard', ...(Object.keys(LANGUAGE_STYLES) as LanguageStyleId[])];

/** A stored or submitted value, or Standard when it is missing or unknown. */
export const interactionStyleId = (value: unknown): InteractionStyleId =>
  INTERACTION_STYLE_IDS.includes(value as InteractionStyleId) ? (value as InteractionStyleId) : 'standard';
export const languageStyleId = (value: unknown): LanguageStyleId =>
  LANGUAGE_STYLE_IDS.includes(value as LanguageStyleId) ? (value as LanguageStyleId) : 'standard';

/**
 * The system-prompt lines for the chosen styles; none for Standard. They come after the governance rules and the
 * Personal preferences, so they can only shape wording.
 */
export function speakingStyleRules(settings: { interactionStyle?: unknown; languageStyle?: unknown }): string[] {
  const interaction = interactionStyleId(settings.interactionStyle),
    language = languageStyleId(settings.languageStyle);
  const chosen = [
    interaction !== 'standard' && INTERACTION_STYLES[interaction],
    language !== 'standard' && LANGUAGE_STYLES[language],
  ].filter((style): style is SpeakingStyle => Boolean(style));
  if (!chosen.length) return [];
  return [
    'Speaking style (user-selected, wording only). It ranks below every rule above: governance, authority and approvals, sources of truth, Skills and the task itself. It applies to chat text; a draft or formal document keeps its Skill’s document standard. Where it overlaps the conversation style in Personal preferences, follow this speaking style.',
    ...chosen.map(style => style.fragment),
  ];
}
