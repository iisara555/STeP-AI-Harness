export const DOCUMENT_PRESETS = {
  saraban: { points: 16, margins: { top: 2.5, bottom: 2, left: 3, right: 2 }, line: 1, indent: 1.25, after: 0 },
  report: { points: 14, margins: { top: 2.54, bottom: 2.54, left: 2.54, right: 2.54 }, line: 1.5, indent: 0, after: 6 },
  book: { points: 16, margins: { top: 2.54, bottom: 2.54, left: 3, right: 2.54 }, line: 1.3, indent: 1.25, after: 0 },
} as const;

export type DocumentPresentation = { preset: keyof typeof DOCUMENT_PRESETS; thaiBreaks: boolean; embedFonts: boolean };

/** Presentation is local draft metadata. No generated characters are saved in the draft. */
export function resolvePresentation(value: unknown = {}, official = false): DocumentPresentation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_DOCUMENT_PRESENTATION');
  const input = value as Partial<DocumentPresentation>;
  if (Object.keys(input).some(key => !['preset', 'thaiBreaks', 'embedFonts'].includes(key)))
    throw new Error('INVALID_DOCUMENT_PRESENTATION');
  if (input.preset !== undefined && !Object.hasOwn(DOCUMENT_PRESETS, input.preset)) throw new Error('INVALID_DOCUMENT_PRESENTATION');
  for (const key of ['thaiBreaks', 'embedFonts'] as const)
    if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new Error('INVALID_DOCUMENT_PRESENTATION');
  return {
    preset: input.preset ?? (official ? 'saraban' : 'report'),
    thaiBreaks: input.thaiBreaks ?? true,
    embedFonts: input.embedFonts ?? true,
  };
}
