# Desktop design

Use the approved Hermes-inspired three-pane workspace: navigation, conversation, editable artifact. Use the system Thai-capable UI font and comfortable line spacing. Respect OS light/dark preference and explicit theme selection, and apply the saved theme before the first paint.

## Brand alignment

Colour follows the STeP CI digital palette in `skills/common/step-brand/references/ci-manual-digest.md` (user-confirmed 2026-09-20): **STeP Yellow `#FFC709`** and **STeP Dark `#231F20`**. Tokens live in `desktop/src/theme.css`.

- Yellow is a fill (primary buttons, active markers, selection) and always carries STeP Dark text. Never set yellow text on light surfaces; use `--accent-ink` for accent text and icons.
- STeP Dark is the primary text colour in light mode and the base of the dark theme.
- Surfaces, lines, muted text, the deep-gold ink and danger red are legibility choices, not additional brand colours. Do not reintroduce the superseded template colours `#F9AE3B`, `#F2A32D` or `#2B333D`.
- Typeface: **IBM Plex Sans Thai** (SIL Open Font License 1.1), bundled locally through `@fontsource/ibm-plex-sans-thai` with Thai and Latin subsets at 400–700. The licence ships in `desktop/licenses/`. This is a product choice; the CI digest names no typeface.
- Use only the supplied symbol artwork in `desktop/src/assets/` (original colour on light surfaces, white mono on dark), unmodified and at its own proportions. Never redraw, recolour, or combine it with typed text into a new lockup. The CI wording **MAKE INNOVATION SIMPLE** sits below it with clear space.
- The app icon is generated from the original-colour symbol by `npm run icon` (`desktop/scripts/make-icon.cjs`). The symbol file's yellow `#FFC609` versus the confirmed `#FFC709` is `รอยืนยัน` with CC.

## Tone: calm and Notion-like

Ink on paper: warm off-white surfaces, STeP Dark text, hairlines instead of boxes, quiet hover fills (`--hover`), and generous whitespace. Yellow stays reserved for primary actions and active markers.

Hand-drawn black-and-white illustrations appear only in empty and waiting states (welcome, empty draft pane, settings header, start-up). They live in `desktop/src/assets/illustrations/` as transparent ink PNGs made by `desktop/scripts/prepare-illustrations.cjs`, so they sit on any surface and dark mode only inverts the ink. The four current illustrations were supplied by the user on 2026-09-29, who stated they are licensed for this use; keep the source and licence record with CC before wider distribution.

## Mini apps

Focused tools live under **เครื่องมือ** in the sidebar and replace the conversation and draft panes while open. Each reuses its source module rather than forking logic, shows an *ทดลอง* badge until its pilot gate passes, keeps processing on this computer, and hands results to chat only as text the person has checked. The first is the AFP receipt pre-check (`desktop/src/receipt.tsx`) over the local Thai OCR trial.

## Skill hub

**ศูนย์รวม Skill** lists every Skill from `src/modules/skills/catalog.js`, which reconciles SKILL.md files, `manifest/skills.yaml` and `manifest/router-index.yaml`, plus the mini apps. Tags state where each stands: *เรียกใช้ได้*, *ยังเรียกใช้ไม่ได้*, *ยังไม่พร้อม*, *ไฟล์ไม่พร้อม*, or *เครื่องมือเฉพาะงาน*. Routed Skills can be invoked by name with `/skill-name` in the composer, the hub, Ctrl+K, or `step-ai ask --skill`; naming a Skill skips scoring and playbooks but never the authority preflight, the Skill's scope check, or the privacy gate. The CLI view is `step-ai skills`.

## Layout and behaviour

Prefer document space over cards. Keep tools discoverable through named buttons and consistent Lucide icons. Empty states explain the next action without fabricated projects, usage metrics, or completed work. Ask for confirmation with the in-app dialog, never a native popup. Preserve keyboard access, visible focus, reduced motion, pane resizing, and narrow-window layouts.
