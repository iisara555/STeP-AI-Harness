// Lightweight UI translation. Thai stays the source text in the code, so the default (Thai) UI and the tests
// that select Thai labels are unchanged; English comes from a dictionary keyed by the Thai text.
import { en } from './locales/en';

export type Language = 'th' | 'en';
let current: Language = 'th';

export function setLanguage(value: unknown) {
  current = value === 'en' ? 'en' : 'th';
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
export const language = () => current;
/** Locale for numbers and dates, following the UI language. */
export const locale = () => (current === 'en' ? 'en-GB' : 'th-TH');

/** A team's display name in the current language (the manifest carries an English name). */
export const teamName = (team: { name: string; nameEn?: string }) => (current === 'en' && team.nameEn ? team.nameEn : team.name);

/** Translates Thai source text; `{0}`, `{1}` … are replaced with `args`. Unknown text falls back to Thai. */
export function t(text: string, ...args: unknown[]): string {
  const template = current === 'en' ? (en[text] ?? text) : text;
  return args.length
    ? template.replace(/\{(\d+)\}/g, (m: string, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m))
    : template;
}

/** Wraps a label table so each lookup is translated when it is read, not when the module loads. */
export function localized<T extends Record<string, string>>(table: T): T {
  return new Proxy(table, {
    get: (target, key) => {
      const value = Reflect.get(target, key);
      return typeof value === 'string' ? t(value) : value;
    },
  });
}
