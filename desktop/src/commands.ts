import type { PaletteItem } from './ui';
import { t } from './i18n';

export const COMMANDS = [
  ['palette', 'เปิดคำสั่ง', 'Mod+k'],
  ['new', 'เริ่มงานใหม่', 'Mod+Alt+n'],
  ['usage', 'ดูการใช้งาน AI', 'Mod+Shift+u'],
  ['memory', 'ดูและแก้ไขความจำ', 'Mod+Shift+m'],
  ['learning', 'กล่องบทเรียน', ''],
  ['automations', 'งานตามรอบและเครื่องมือเพิ่มเติม', 'Mod+Shift+b'],
  ['settings', 'ตั้งค่าพื้นที่ทำงาน', 'Mod+,'],
  ['keyboard', 'คีย์ลัดและ Vim', ''],
  ['packs', 'Skill Packs', ''],
  ['tour', 'ดูทัวร์แนะนำอีกครั้ง', ''],
  ['wizard', 'เปิดตัวช่วยตั้งค่าเริ่มต้น', ''],
  ['left', 'สลับแถบงาน', ''],
  ['right', 'สลับร่าง', ''],
  ['skills', 'ศูนย์รวม Skill', ''],
  ['receipt', 'ตรวจใบเสร็จก่อนส่ง AFP', ''],
  ['theme-system', 'ธีมตามระบบ', ''],
  ['theme-light', 'ธีมสว่าง', ''],
  ['theme-dark', 'ธีมมืด', ''],
] as const;
export type CommandId = (typeof COMMANDS)[number][0];
export type Keybindings = Partial<Record<CommandId, string>>;
export function validateKeybindings(value: unknown): Keybindings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_KEYBINDINGS');
  const result: Keybindings = {},
    used = new Set<string>();
  for (const [id, combo] of Object.entries(value)) {
    if (
      !COMMANDS.some(c => c[0] === id) ||
      typeof combo !== 'string' ||
      (combo && !/^(?:Mod\+)(?:Alt\+)?(?:Shift\+)?(?:[a-z0-9]|,|\.)$/.test(combo))
    )
      throw new Error('INVALID_KEYBINDINGS');
    result[id as CommandId] = combo;
  }
  for (const [id, , fallback] of COMMANDS) {
    const combo = result[id] ?? fallback;
    if (combo && used.has(combo)) throw new Error('DUPLICATE_KEYBINDING');
    if (combo) used.add(combo);
  }
  return result;
}
export function commandForKey(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing'>,
  bindings: Keybindings = {},
  mac = false,
): CommandId | undefined {
  if (e.isComposing || !(mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)) return;
  const combo = 'Mod+' + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + e.key.toLowerCase();
  return COMMANDS.find(([id, , fallback]) => (bindings[id] ?? fallback) === combo)?.[0];
}
export function commandPalette(
  actions: Partial<Record<CommandId, () => void>>,
  bindings: Keybindings,
  dynamic: PaletteItem[],
): PaletteItem[] {
  return [
    ...COMMANDS.filter(([id]) => actions[id]).map(([id, label, fallback]) => ({
      id,
      label: t(label),
      group: t('คำสั่ง'),
      hint: bindings[id] ?? fallback,
      run: actions[id]!,
    })),
    ...dynamic,
  ];
}
/** Composer-only Vim subset. IME composition and modifiers always retain native behavior. */
export function vimEdit(key: string, text: string, cursor: number, normal: boolean) {
  if (!normal) return key === 'Escape' ? { text, cursor, normal: true } : undefined;
  let next = cursor,
    mode = true,
    value = text;
  if (key === 'i') mode = false;
  else if (key === 'a') {
    mode = false;
    next++;
  } else if (key === 'h') next--;
  else if (key === 'l') next++;
  else if (key === '0') next = text.lastIndexOf('\n', cursor - 1) + 1;
  else if (key === '$') {
    const end = text.indexOf('\n', cursor);
    next = end < 0 ? text.length : end;
  } else if (key === 'w') next += text.slice(cursor).match(/^\S*\s*/)?.[0].length || 1;
  else if (key === 'b') next = text.slice(0, cursor).replace(/\s+$/, '').search(/\S+$/);
  else if (key === 'x') value = text.slice(0, cursor) + text.slice(cursor + (text.codePointAt(cursor)! > 0xffff ? 2 : 1));
  else if (key === 'j' || key === 'k') {
    const start = text.lastIndexOf('\n', cursor - 1) + 1,
      column = cursor - start;
    if (key === 'j') {
      const end = text.indexOf('\n', cursor);
      if (end >= 0) {
        const last = text.indexOf('\n', end + 1);
        next = Math.min(end + 1 + column, last < 0 ? text.length : last);
      }
    } else if (start > 0) {
      const prev = text.lastIndexOf('\n', start - 2) + 1;
      next = Math.min(prev + column, start - 1);
    }
  } else if (key.length !== 1 && key !== 'Escape') return;
  return { text: value, cursor: Math.max(0, Math.min(value.length, next)), normal: mode };
}
