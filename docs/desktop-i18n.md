# Desktop interface language (ไทย / English)

STeP Desktop เปลี่ยนภาษาเมนูและปุ่มได้สองภาษา: เลือกที่ปุ่ม **ไทย / English** ในหน้าแรกของตัวช่วยตั้งค่า หรือ **ตั้งค่าพื้นที่ทำงาน → รูปลักษณ์และภาษา** ค่าเก็บใน `settings.language` (`th` เมื่อไม่ได้ตั้ง) ผู้ช่วยยังตอบตามภาษาที่ผู้ใช้พิมพ์

## How it works

- Thai is the source text in the code. UI text is wrapped in `t('ข้อความไทย')` (renderer, `desktop/src/i18n.ts`) or `tm('ข้อความไทย')` (main process, `desktop/electron/i18n.ts`). Placeholders use `{0}`, `{1}`: `t('สวัสดีครับ คุณ{0}', name)`.
- English lives in `desktop/src/locales/en.ts`, keyed by the exact Thai text. Unknown text falls back to Thai, so a missing entry never blanks the UI.
- Label tables declared at module level use `localized({...})` or call `t()` where they are rendered, so the language is read at render time rather than at import.
- Prompts sent to the AI, stored identifiers (for example the default task title `งานใหม่`) and comparisons stay untranslated.
- Team names come from `nameEn` in `manifest/teams.yaml`. Welcome starters are in `desktop/src/starters.ts` with both languages side by side.

## Adding or changing text

1. Write the Thai text and wrap it in `t()` / `tm()`.
2. Add the English entry to `desktop/src/locales/en.ts`.
3. Run `npm --prefix desktop test`: `test/i18n.test.ts` lists any wrapped Thai text without an English entry or with mismatched placeholders, and checks every team has three starters in both languages.
4. `node desktop/test/i18n-smoke.mjs [screenshot-folder]` drives the real app in English and back to Thai.
