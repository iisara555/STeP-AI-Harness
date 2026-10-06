# STeP Desktop (development preview)

Local Electron workspace with Thai chat, Tiptap text editing, SQLite history, conflict-safe proposals, source review, and versioned exports. The shared routing service retains the CLI contract. Graphify is developer tooling only.

The Phase 2 [governed tool loop](../docs/desktop-tool-loop.md) connects Chat/Draft to bounded host tools, document/spreadsheet previews, one-time result consent, questions/plans, backups and `/usage`. It remains a development preview; synthetic validation does not prove live provider access.

Phase 3 adds [context and memory controls](../docs/desktop-context-memory.md): `/memory`, workspace instructions/persona/styles, bounded compaction, session fork/search/export/resume, local OCR attachments and administrator-gated image input.

[Learning Inbox](../docs/desktop-learning.md) adds `/learn`, explicit review of local preference/procedure proposals, version history, disable and rollback. Only approved lessons enter later tasks; this phase does not include automatic review or measured quality improvement.

Phase 5 adds [compatible/Copilot profiles, headless drafts, pre-send readiness, command/keybinding controls, on-demand local voice, governed Skill Packs and the LINE draft gateway](../docs/desktop-phase5.md). Live account/channel/hardware acceptance remains separate.

## Run

Use Node 24 LTS and Python 3.10+ for repository validation. From the repository root:

```sh
npm --prefix desktop ci
npm run desktop:build
npm run desktop:start
```

Open Settings, select a workspace and team (optional), add a provider connection, then run its explicit connection test. That test sends one short request and may consume provider quota. No credentials are imported from personal CLI installations.

In-app chat on the employee's own Claude plan ("Your plan through Claude Code") runs the official, unmodified Claude Code, and each employee signs in to their own Claude account on Anthropic's page. It is off by default while Anthropic is asked how its Claude Code terms apply (policy `features.claudeSubscription`). Pilot machines turn it on with `scripts/pilot/enable-claude-code.ps1` / `.sh`, and `STEP_CLAUDE_SUBSCRIPTION=0/1` forces it in development. See [docs/claude-subscription.md](../docs/claude-subscription.md). With the feature off, existing connections can still sign out and be removed, but cannot connect, list models or chat.

For Claude subscription chat, install Claude Code 2.1.268 or newer yourself, choose Claude → บัญชี Claude, then connect. Claude Code opens the browser and manages authentication; paste a code into STeP only if prompted. Login, status, SDK inference and logout share a per-connection `CLAUDE_CONFIG_DIR` under STeP app data. The installed executable is used for both authentication and SDK requests. STeP does not copy personal Claude credentials, implement OAuth itself, or automatically install Claude Code. API-key chat and the optional external Claude Code handoff remain available. If the runtime is removed, reinstall it before signing out so it can clear its credential store. Live Pro access and macOS credential isolation require separate live validation; automated tests do not prove subscription entitlement.

## Verification

Phase 6 adds [bounded clean-read transmission consent and a feature matrix](../docs/desktop-phase6.md). Employees can explicitly approve a source scope for one round and revoke it from the composer. When `checks.privacy` is on (it is off by default, see [organization checks](../docs/desktop-policy.md#organization-checks-checks)), privacy checks run on every result; new scopes, masking, document/MCP/command/write results and business actions retain their own gates. Administrators can disable the scoped choice with `transmissionConsent.allowRunScope=false`.

```sh
npm test
npm run validate
npm run desktop:test
npm --prefix desktop run build
cd desktop
node test/electron-smoke.mjs
npx tsx test/runtime-probe.ts
powershell -NoProfile -File test/office-smoke.ps1
```

Unit tests use fake generation, real routing, SQLite and export libraries. Electron smoke tests exercise actual IPC, editing, version restore and themes without authenticating providers. Runtime probes initialize the bundled protocols without sending prompts. These checks do not prove live account access, quota handling, macOS support, or broad document layout coverage. The optional Windows Office smoke requires Word, Excel and PowerPoint and opens only synthetic exports.

### Golden-set evaluation (live model)

Run whenever a model, Skill, source or prompt changes. It sends the three synthetic tasks from `docs/harness-quality-axes.md` through the real router, Skill loading and `WorkService`, grades each draft against `eval/golden.json`, and writes `eval-results/<time>-<provider>/report.md` plus every draft for a person to read. It consumes provider quota; the key is read from the environment only and never written to the report.

```sh
cd desktop
STEP_EVAL_APPROVE_LIVE=1 STEP_EVAL_PROVIDER=claude STEP_EVAL_API_KEY=... STEP_EVAL_RUNS=1 npm run eval:golden
```

`STEP_EVAL_MODEL` picks a model and `STEP_EVAL_ONLY=TOR-SYN-01` limits scenarios. The rubric catches critical failures (invented budget split, approval claims, invented dates, audit guarantees) and obvious omissions; it is not a quality certificate.

`npm run eval:features` runs the offline feature matrix without credentials or quota. Live mode requires `STEP_EVAL_MODE=live` plus explicit approval and named auth. Claude Code OAuth uses `STEP_EVAL_AUTH=subscription` and an explicitly authorized `STEP_EVAL_CLAUDE_PROFILE`; no credential is copied. See the [Phase 6 operator instructions](../docs/desktop-phase6.md) for executable/version checks, call limits, evidence labels and outstanding live acceptance.

## Distribution

`npm run package` creates an unpacked app. `npm run dist:win` creates an NSIS installer. `npm run dist:mac` must run on a macOS build host for each architecture. A signed, notarized release and clean-machine tests remain release gates; unsigned development builds are not production releases.

### Updates

An installed STeP Desktop updates itself, as Claude, Cursor and Codex do. It checks the `desktop-latest` release of this repository 15 seconds after opening and every 4 hours, downloads a newer version in the background, and shows **รีสตาร์ทเพื่ออัปเดต** in the title bar. A downloaded update also installs when the app quits. STeP menu → ช่วยเหลือ → ตรวจหาอัปเดต checks immediately. Policy feature `autoUpdate` turns this off.

To publish a version, bump `version` in `desktop/package.json`, then push the tag `desktop-v<version>` or run the workflow by hand with **publish** ticked; a version is published only once. The `Build STeP Desktop installers` workflow then builds and tests the three installers, publishes the `desktop-v<version>` release, and replaces the files of `desktop-latest`. On macOS the app installs updates itself only when it is signed with the organisation's Developer ID; an ad-hoc signed build shows a download button instead.

### Optional local Thai OCR

The base STeP Desktop installer intentionally does **not** include Python, PaddlePaddle or OCR model weights. Employees who never use receipt OCR therefore do not download or install that runtime. The small STeP OCR application code and requirements are included so the Receipt page can install the component later.

When an employee opens **ตรวจใบเสร็จ AFP** and chooses **ติดตั้ง OCR**, STeP Desktop downloads a pinned Python build, verifies its SHA-256 checksum, installs PaddlePaddle and the Thai OCR requirements into the employee's app-data folder, and prepares the OCR models. The component remains local to that user and can be retried cleanly after a partial failure. Receipt recognition continues to bind only to `127.0.0.1`; original receipt files are not uploaded to an OCR web service.

The automatic component currently supports Windows x64, macOS Apple silicon, and Intel macOS. Intel macOS uses the last PaddlePaddle CPU build supported by that architecture.

### AI reading of the receipt image

The receipt page leads with document usability, detected type, a suggested expense
category and next steps. OCR and optional vision fill the existing form; source-backed
Thai digits, valid dates and money are formatted without filling absent values. Vision
also transcribes expense item descriptions. The local fallback uses explicit item
labels, never the merchant name. Category suggestions reference the registered AFP
circular and remain recommendations after human checking (for example, drinking water
can suggest B10; generic drinks cannot). Mixed categories or insufficient purpose stay
unresolved. BV suggestions require a date on/after the registered 1 September 2026 change.
The receipt alone cannot identify an approved project budget. Rules not represented
in the registered source must be confirmed with AFP; no live policy validation or
payment approval is claimed.

Review/correct the populated form, then use the single existing source-comparison
checkbox. There are no per-field confirmation requirements. Editing an expense
description, purpose, type or category withdraws the confirmation too. Raw evidence,
alternative readings, reread controls, the complete checklist and pilot tools are
available in collapsed details. Saving and chat handoff are optional subsequent actions.

For a local pilot inside Desktop, open **ตรวจใบเสร็จ AFP**, install OCR there if needed,
then select **ทดลอง OCR ในเครื่อง (สำหรับใบที่เลือกครั้งถัดไป)** before choosing a document.
This per-read option requires local OCR and suppresses automatic AI image reading and
candidate filtering. It preserves the initial OCR field suggestions, review flags and
elapsed recognition time (including model initialization, excluding the file picker).
Edit the fields against the source, including absent values, then check the existing
source-comparison checkbox. The trial panel compares the frozen reading with those
human-checked values. Independent AI image reading remains an explicit button under
the existing policy and consent; its request time includes the consent dialog.

**บันทึกผลทดลอง (JSON)** exports the readings, human answers and per-field exact/review
outcomes. Real input images and trial reports must be outside Git checkouts; the pilot
checks Git ancestors and resolves symlinks for input and export. Reports stay on the
local machine unless the person explicitly uses an AI/chat action. Comparison is NFC
and trimmed text exact match, so date/money formatting differences can count as
differences; this panel does not replace the benchmark's canonical scoring. RAM is
explicitly unmeasured. A single document does not close the acceptance gate or prove
model accuracy. Record employee-machine RAM separately for the broader pilot.

With policy features `vision` and `receiptVision` on (the default) and `checks.privacy` off, the Receipt page also sends the receipt image to the connected AI, after a one-time consent. The image is resized to 1800 px at most; a PDF sends its first three pages. The AI reads the fields independently of the OCR, and the page compares the two field by field; a person still confirms every field. Without the OCR component, the AI reading alone is available. With `checks.privacy` on, no image is sent.

The page also shows the document type (from the AI or the printed heading) and a checklist for the chosen claim category. Each item names its source: AFP circulars, general payment-document elements to confirm with AFP, or "no source yet, ask AFP". The checklist prepares documents; it is not an approval.

## Boundaries

- Conversation history and drafts are local application data, not diagnostic logs. API secrets use Electron secure storage. Most provider-managed authentication uses an isolated runtime profile. Experimental Antigravity uses a shared native OS keyring: configuration isolation does not isolate Google identities, and STeP disconnect does not log out that native account. See [current compatibility blocker](../docs/antigravity-adapter.md).
- Only extracted, reviewed text is sent for attachments; original documents are not uploaded. Unsupported/incomplete extraction is blocked. One source attachment per request preserves one-source Playbook constraints.
- The host rejects file, shell and action requests from provider runtimes and exposes no external submission or publishing IPC. A separate public retrieval run enables only native web search after privacy and authority checks. Runtime restrictions still require adversarial live verification. Export happens through host code.
- DOCX/PDF/Markdown preserve headings, lists, bold, italic and tables (Markdown tables from the model become real tables in the editor, at most 500 rows by 30 columns, no merged cells). Word and PDF use the Thai official layout: TH Sarabun New 16 pt, A4, margins left 3 cm, right 2 cm, top 2.5 cm, bottom 2 cm. Word substitutes another font when TH Sarabun New is not installed; the PDF then uses Sarabun, Leelawadee UI or Thonburi scaled to the same size. XLSX puts each table on its own sheet (bold header, borders, filter, frozen header; plain numbers become numbers, codes with a leading zero stay text) and the rest of the draft as clean text. To use it in Google Sheets, upload the XLSX to Google Drive and open it with Google Sheets. PPTX puts tables on their own slides and paginates text; this is not an Office layout editor.
- Graph edges are navigation aids, never authoritative evidence. Use `node scripts/graphify-local.js build` from the root and verify inferred edges against source.
- Live account login, provider failure behavior, packaging, signing, and macOS require independent validation before release.
- Drafting rules and the Skill go to each runtime's system instructions (Claude `systemPrompt`, Codex `developerInstructions`, Gemini `GEMINI_SYSTEM_MD`); request, sources, conversation and draft travel in tagged sections that source text cannot open or close.
- A busy service, dropped connection or exited runtime is retried twice; quota and sign-in failures are not. A Playbook that stops keeps its finished steps, and "ลองอีกครั้ง" continues from the step that stopped. Up to three tasks in different Workspaces may run at once.
- A follow-up that revises a draft is routed on its own text for the authority check, so an approval request cannot ride on an earlier allowed route.
- Gemini sign-in: since 18 June 2026 Google serves Gemini CLI only to API keys and Gemini Code Assist Standard/Enterprise licenses. Personal Google accounts and Google AI Pro/Ultra must use a Gemini API key; the sign-in option requires the organization's Google Cloud project.


### Claude Console OAuth

STeP Desktop รองรับ OAuth แบบ official ผ่าน Anthropic `ant` CLI โดยใช้ `ant auth login` และเก็บ profile แยกต่อ connection ใน app data ผ่าน `ANTHROPIC_CONFIG_DIR`. Claude Agent SDK อ่าน profile เดียวกันโดยตรง จึงไม่ต้องคัดลอก OAuth client ID, อ่าน token file หรือบันทึก access/refresh token ในฐานข้อมูลของ STeP

Anthropic ไม่มีตัวติดตั้ง `ant` สำหรับ Windows ถ้าเครื่องยังไม่มี `ant` STeP Desktop จะดาวน์โหลด release ทางการ v1.36.0 จาก `github.com/anthropics/anthropic-cli` (MIT) เมื่อผู้ใช้กดเชื่อมต่อหรือกด “ติดตั้ง ant CLI” ตรวจ SHA-256 ที่ปักไว้ในโค้ด และตรวจใน profile ชั่วคราวว่าเป็น `ant` 1.5 ขึ้นไปที่รองรับ OAuth ก่อนติดตั้งไว้ที่ `components/ant` ใน app data ถ้า `ant` ของผู้ใช้เองอยู่บน PATH จะใช้ตัวนั้นก่อน

โหมดนี้ใช้ Claude API workspace/usage ของ Claude Console ไม่ใช่โควตา Claude Pro/Max. การใช้แพ็กเกจ Pro/Max ภายในแอปเป็นการเชื่อมต่อแยก ("แพ็กเกจของคุณผ่าน Claude Code" เฉพาะเครื่อง Pilot) ดู [docs/claude-subscription.md](../docs/claude-subscription.md)
## Managed organization policy

Desktop permissions and hooks are documented in [desktop-policy.md](../docs/desktop-policy.md). The OpenHarness adaptation roadmap and remaining phases are tracked in [openharness-parity.md](../docs/openharness-parity.md).
