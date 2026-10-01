// Main-process side of the UI translation (see src/i18n.ts): dialogs, statuses and connection notes the
// person reads follow the language chosen in Settings. Prompts and stored identifiers stay untranslated.
import { en } from '../src/locales/en';

let read: () => unknown = () => 'th';
/** Called once the settings store exists, so later text follows the saved language. */
export function useLanguage(source: () => unknown) {
  read = source;
}
export function tm(text: string, ...args: unknown[]): string {
  const template = read() === 'en' ? (en[text] ?? text) : text;
  return args.length
    ? template.replace(/\{(\d+)\}/g, (m: string, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m))
    : template;
}
/** Number formatting that follows the UI language. */
export const mainLocale = () => (read() === 'en' ? 'en-GB' : 'th-TH');
