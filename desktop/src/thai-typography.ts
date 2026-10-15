// ICU word boundaries are used for layout estimates only. Never insert invisible characters into source/export text.
const words = new Intl.Segmenter('th', { granularity: 'word' });
const graphemes = new Intl.Segmenter('th', { granularity: 'grapheme' });

export const THAI_DOCUMENT_LANGUAGE = { value: 'th-TH' } as const;
export const THAI_DOCUMENT_CSS = 'word-break:normal;overflow-wrap:break-word;line-break:auto;hyphens:none;';

/** Approximate visible units; combining vowels/tones and emoji sequences are not counted as separate letters. */
export function textUnits(text: string) {
  let count = 0;
  for (const _part of graphemes.segment(text)) count++;
  return count;
}

/** A Thai header may have many words without spaces. Do not shrink an entire table to fit it on one line. */
export function longestWordUnits(text: string) {
  let longest = 0;
  for (const part of words.segment(text)) {
    if (!part.segment.trim()) continue;
    longest = Math.max(longest, textUnits(part.segment));
  }
  return longest;
}
