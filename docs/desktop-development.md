# STeP Desktop — development reference

For employee setup and everyday use, read the [Desktop guide](../desktop/README.md). This page retains implementation, evaluation, packaging and policy details. Unless a section says repository root, run Desktop commands from `desktop/`.

> อ้างอิง source ของ `main`: Harness **0.7.6** / Desktop **0.5.29**. เพิ่ม DOCX/PDF พร้อมตราครุฑตามประเภทเอกสาร แม่แบบร่างด้วย Skill และการกู้คำตอบ Antigravity เมื่อเครื่องมือถูกปฏิเสธแล้ว. เลขเวอร์ชันใน source และ CI artifacts ไม่ยืนยันว่าแจกแล้ว: ตรวจ [Desktop releases](https://github.com/iisara555/STeP-AI-Harness/releases?q=desktop-v) และ [ช่องทางอัปเดต](https://github.com/iisara555/STeP-AI-Harness/releases/tag/desktop-latest) ก่อนเลือกตัวติดตั้ง.

Local Electron workspace with Thai chat, Tiptap text editing, SQLite history, conflict-safe proposals, source review, and versioned exports. The shared routing service retains the CLI contract. Graphify is developer tooling only.

The Phase 2 [governed tool loop](desktop-tool-loop.md) connects Chat/Draft to bounded host tools, document/spreadsheet previews, one-time result consent, questions/plans, backups and `/usage`. It remains a development preview; synthetic validation does not prove live provider access.

The same `/usage` dialog also shows [per-account provider quotas, credits and API usage](desktop-provider-usage.md), with explicit refresh, reported units/reset times and separate local estimates. Supported account readers use managed credentials without sending a model prompt; unsupported connections retain local accounting and provider links when available. Claude/Copilot interfaces are experimental, and real-account access remains separately unverified.

Phase 3 adds [context and memory controls](desktop-context-memory.md): `/memory`, workspace instructions/persona/styles, bounded compaction, session fork/search/export/resume, local OCR attachments and administrator-gated image input.

[Learning Inbox](desktop-learning.md) adds `/learn`, explicit review of local preference/procedure proposals, version history, disable and rollback. Only approved lessons enter later tasks; this phase does not include automatic review or measured quality improvement.

Phase 5 adds [compatible/Copilot profiles, headless drafts, pre-send readiness, command/keybinding controls, on-demand local voice, governed Skill Packs and the LINE draft gateway](desktop-phase5.md). Live account/channel/hardware acceptance remains separate.

## Office tools in Desktop 0.5.27

The host tool loop can create actual XLSX workbooks (`sheet_create`) and editable PPTX decks (`slides_create`) from chat/draft, including a table from earlier conversation turns. Ask mode stages them in **Changes** for review/application; Accept Edits uses the existing write gate and reports `applied` only after writing. Existing files are not overwritten. Leading-zero identifiers remain text and missing facts remain pending confirmation. With tool execution disabled, use the draft's **XLSX** export; CSV is a separate format.

`sheet_read` separates formulas from cached values; `sheet_edit` patches input cells while preserving unrelated ZIP parts and refuses formula/protected cells, macros and signed packages. Recalculate in Excel/LibreOffice and visually review every PPTX page. Creation does not support faithful editing of an existing PPTX. See [Office workflows](office-workflows.md) for bounds, synthetic evidence and the draft `spreadsheet-work` Skill.

The optional Google Workspace module is not automatically registered in the Desktop loop or authenticated. Direct Google Sheets access requires an available authorized connector; otherwise import the XLSX. Controlled artifact tests do not establish live model benefit, Google API access or staff-machine PowerPoint compatibility. These additions are included in the 0.5.27 source; installer publication is verified separately in Desktop releases.

## Document exports — Desktop 0.5.29

The five drafting tools use their registered Skills, source checks and working templates. After accepting a proposal, edit the native draft and choose DOCX or PDF. Memos default to **TH Sarabun New** following the supplied form example; the other profiles default to **TH Sarabun PSK**. Both allow a font override and show a local font-availability notice. Fonts are not downloaded or installed automatically. Document body and Skill checks are stored separately: accepting a proposal keeps its review outside the editor/export, tied to the accepted revision. Legacy proposals with recognized review headings are also separated at acceptance.

Export opens the shared native workspace picker when no working folder exists, supports creating the selected folder, and resumes export. Cancel returns without changing the draft or settings. Folder choice is shared across concurrent requests and each document's export has one owner. See [document drafting review](document-drafting-review.md) for the source/template audit and rendering limits.

Memos use a **1.5 cm-high** Garuda at the left of the first-page letterhead; external letters (including invitation/reply/coordination) use a **3 cm-high** Garuda centered on A4. Choose **No Garuda emblem** for another agency form. TORs, projects, minutes and generic drafts add no emblem automatically. The bundled graphic is offline and preserves its aspect ratio; export sends no additional document or image to AI. See [graphic provenance](third-party-notices/thai-garuda.md).

DOCX uses a first-page header, an editable 29 pt memo title with matching Thai/Latin properties, native paragraphs/tables and live first-page/continuation page-number fields. PDF has a first-page letterhead and the selected face. Install the required font before reviewing or re-exporting. Missing facts remain pending. For a DOCX selected as an agency template, the host stores a session-owned immutable local snapshot, sends only recognized sample-free structure to AI and exports the latest editor using native template styles/graphics/tables/sections. Column counts and recognized meanings must match; native-template PDF is saved from reviewed DOCX in Word. Staff install the template fonts themselves. Controlled source files are never bundled. Synthetic OOXML and Electron checks do not establish current agency-form approval or live AI drafting quality; review the final document in the target Office application before issuing it.

## Connect AI / Setup — Desktop 0.5.27

Both pages share two steps: **choose AI and connect → check the automatic one-message test**. Antigravity is recommended and preselected for users with eligible Google/student access; eligibility and quota still depend on the account. ChatGPT sign-in needs no API key. Gemini API and other key-based services show their own inputs and billing information. Extra services and model/account management are disclosed on demand.

A signed-in account whose test failed is not marked ready. Retry the same connection instead of creating another account. After the test passes, Settings offers Start working; Setup proceeds to the existing usage terms. Connection tests consume one short request each and are not a full model-quality evaluation.

## Desktop 0.5.23 source

The merged source includes a two-part welcome tour, a version/update line beneath the user profile, readable selected document cards, and further Thai receipt mapping. Net-total labels outrank generic sums; VAT rates are not monetary amounts. Subtotal/VAT/total arithmetic reconciles candidates, while references and English dates tolerate common OCR spacing. Sideways-page detection can trigger two additional quarter-turn readings. Detection uses 1280 px (`STEP_OCR_DET_SIDE` overrides); scanned PDFs render at 200 DPI. These settings and extra reads require timing/RAM checks on employee hardware.

The [0.5.21 synthetic report](../experiments/local-thai-ocr/benchmark/QUALITY-RESULTS-2026-10-06.md) measured 50/63 → 59/63 canonical matches on nine images, including two annotated absences, with four wrong/missing fields and two merchant errors escaping review warnings. It is historical evidence for that revision, not a measurement of 0.5.23. Native-text PDFs skip PaddleOCR startup. Real-document acceptance remains **OPEN**; no general image-speed or accuracy guarantee is established.

## Text-to-image generation

Connect an OpenAI or Gemini API-key account, choose **สร้างรูป**, provide a complete brief and select an account-listed image model. Review the result in **ผลงาน** and choose **บันทึกรูป**. API quota is separate from subscription/OAuth access. Reference images, image editing and inpainting are not supported by this Desktop path.

Known limitations in this version: Chat auto-routing can interpret Thai text-overview requests beginning with `สร้างภาพรวม` as paid image requests, even with a no-image instruction. Use `สรุปภาพรวม` for text. Follow-up image requests and answers to router clarification do not include the original brief in the generation prompt; repeat the complete brief. Synthetic renderer/host/provider fixtures verify selection, consent, display, export, cancellation and error handling; they do not prove live model access, output quality or provider billing.

## Run

Use Node 24 LTS and Python 3.10+ for repository validation. From the repository root:

```sh
npm --prefix desktop ci
npm run desktop:build
npm run desktop:start
```

Open Settings, select a workspace and team (optional), add a provider connection, then run its explicit connection test. That test sends one short request and may consume provider quota. No credentials are imported from personal CLI installations.

In-app chat on the employee's own Claude plan ("Your plan through Claude Code") runs the official, unmodified Claude Code, and each employee signs in to their own Claude account on Anthropic's page. It is off by default while Anthropic is asked how its Claude Code terms apply (policy `features.claudeSubscription`). Pilot machines turn it on with `scripts/pilot/enable-claude-code.ps1` / `.sh`, and `STEP_CLAUDE_SUBSCRIPTION=0/1` forces it in development. See [docs/claude-subscription.md](claude-subscription.md). With the feature off, existing connections can still sign out and be removed, but cannot connect, list models or chat.

For Claude subscription chat, install Claude Code 2.1.268 or newer yourself, choose Claude → บัญชี Claude, then connect. Claude Code opens the browser and manages authentication; paste a code into STeP only if prompted. Login, status, SDK inference and logout share a per-connection `CLAUDE_CONFIG_DIR` under STeP app data. The installed executable is used for both authentication and SDK requests. STeP does not copy personal Claude credentials, implement OAuth itself, or automatically install Claude Code. API-key chat and the optional external Claude Code handoff remain available. If the runtime is removed, reinstall it before signing out so it can clear its credential store. Live Pro access and macOS credential isolation require separate live validation; automated tests do not prove subscription entitlement.

## Verification

See the [2026-10-06 security review](desktop-security-review.md) for corrected file/OCR boundaries, dependency audit evidence and the native-platform, signing, DNS and policy limits that remain before organizational rollout.

Phase 6 adds [bounded clean-read transmission consent and a feature matrix](desktop-phase6.md). Employees can explicitly approve a source scope for one round and revoke it from the composer. When `checks.privacy` is on (it is off by default, see [organization checks](desktop-policy.md#organization-checks-checks)), privacy checks run on every result; new scopes, masking, document/MCP/command/write results and business actions retain their own gates. Administrators can disable the scoped choice with `transmissionConsent.allowRunScope=false`.

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

### Office Skill comparison with ChatGPT/Codex OAuth

From the repository root, run `npm run desktop:eval:skill-benefit -- --self-test`, then `--list` and `--connection 1 --probe`. These send no model prompts. Explicit `--live` runs three WITH/WITHOUT Skill pairs per account-listed model using the existing Desktop OAuth profile, the same host Office tools, isolated sessions and a persistent call ledger outside the checkout. No API key or model judge is required. For this task's two prior cloud attempts include `--prior-calls gpt-6-astra=2`; use one machine per account and keep the entire results folder when resuming. See [Windows/macOS instructions and limits](cloud-model-eval-setup.md). This source-only runner does not establish model benefit, PowerPoint rendering, all coauthoring cases or real-document acceptance; those remain unrun.

### Golden-set evaluation (live model)

Run whenever a model, Skill, source or prompt changes. It sends the three synthetic tasks from `docs/harness-quality-axes.md` through the real router, Skill loading and `WorkService`, grades each draft against `eval/golden.json`, and writes `eval-results/<time>-<provider>/report.md` plus every draft for a person to read. It consumes provider quota; the key is read from the environment only and never written to the report.

```sh
cd desktop
STEP_EVAL_APPROVE_LIVE=1 STEP_EVAL_PROVIDER=claude STEP_EVAL_API_KEY=... STEP_EVAL_RUNS=1 npm run eval:golden
```

`STEP_EVAL_MODEL` picks a model and `STEP_EVAL_ONLY=TOR-SYN-01` limits scenarios. The rubric catches critical failures (invented budget split, approval claims, invented dates, audit guarantees) and obvious omissions; it is not a quality certificate.

`npm run eval:features` runs the offline feature matrix without credentials or quota. Live mode requires `STEP_EVAL_MODE=live` plus explicit approval and named auth. Claude Code OAuth uses `STEP_EVAL_AUTH=subscription` and an explicitly authorized `STEP_EVAL_CLAUDE_PROFILE`; no credential is copied. See the [Phase 6 operator instructions](desktop-phase6.md) for executable/version checks, call limits, evidence labels and outstanding live acceptance.

## Distribution

`npm run package` creates an unpacked app. `npm run dist:win` creates an NSIS installer. `npm run dist:mac` must run on a macOS build host for each architecture. Published installer builds and organizational rollout approval are separate. Current macOS builds use ad-hoc signing and are not Apple Developer notarized; clean-machine and organization acceptance remain required. Employees use their approved internal distribution channel.

### Updates

An installed STeP Desktop checks for updates in the app. It checks the `desktop-latest` release of this repository 15 seconds after opening and every 4 hours, downloads a newer version in the background, and shows **รีสตาร์ทเพื่ออัปเดต** above the profile (or in the title bar when the sidebar is hidden). Windows installs a downloaded update on quit; the macOS verified ZIP flow requires the explicit restart action. The version/status line beneath the user's name checks immediately when clicked or installs an already downloaded update; STeP menu → ช่วยเหลือ → ตรวจหาอัปเดต also checks immediately. Policy feature `autoUpdate` turns this off.

To publish a version, bump `version` in `desktop/package.json` and its lockfile, add the version's in-app notes in `src/whats-new.ts`, and update the README version and CHANGELOG. Then push the tag `desktop-v<version>` or run the workflow by hand with **publish** ticked; a version is published only once. The `Build STeP Desktop installers` workflow builds and tests the three installers, publishes the `desktop-v<version>` release, and replaces the files of `desktop-latest`. From Desktop 0.5.18, macOS uses the verified ZIP update flow for the current ad-hoc signed builds. In 0.5.27, network/download/feed/checksum failures offer Retry update inside the app; they no longer automatically redirect to GitHub. Manual fallback is reserved for a bundle that cannot be replaced (DMG, translocation, permissions), or legacy native signature validation. Move the app to an Applications folder you can write to, reopen and retry. Older installed updaters keep their previous behavior until upgraded, so a one-time manual upgrade may still be needed. Signing/checksum checks are preserved.

### Optional local Thai OCR

The base STeP Desktop installer intentionally does **not** include Python, PaddlePaddle or OCR model weights. Employees who never use receipt OCR therefore do not download or install that runtime. The small STeP OCR application code and requirements are included so the Receipt page can install the component later.

When an employee opens **ตรวจใบเสร็จ AFP** and chooses **ติดตั้ง OCR**, STeP Desktop downloads a pinned Python build, verifies its SHA-256 checksum, installs PaddlePaddle and the Thai OCR requirements into the employee's app-data folder, and prepares the OCR models. The component remains local to that user and can be retried cleanly after a partial failure. Receipt recognition continues to bind only to `127.0.0.1`; original receipt files are not uploaded to an OCR web service.

The automatic component currently supports Windows x64, macOS Apple silicon, and Intel macOS. Intel macOS uses the last PaddlePaddle CPU build supported by that architecture.

### AI reading of the receipt image

The receipt page leads with document usability, detected type, a suggested expense
category and next steps. OCR and optional vision fill the existing form; source-backed
Thai digits, valid dates and money are formatted without filling absent values. Vision
also transcribes expense item descriptions. The local fallback reads the explicitly
labelled item table, skipping column headings and numeric cells, never the merchant
name. Cash-bill mapping preserves book/bill numbers and Thai month dates and excludes
the buyer section from issuer candidates. Category suggestions reference the registered AFP
circular and remain recommendations after human checking (for example, drinking water
can suggest B10; generic drinks cannot). Mixed categories or insufficient purpose stay
unresolved. BV suggestions require a date on/after the registered 1 September 2026 change.
The receipt alone cannot identify an approved project budget. Rules not represented
in the registered source must be confirmed with AFP; no live policy validation or
payment approval is claimed.

Review/correct the populated form, then use the single existing source-comparison
checkbox. Only selected, source-compared values become `SOURCE_FACT`; unchecked manual
entries are `USER_INPUT`, while raw OCR/vision and alternatives remain
`EXTRACTED_UNVERIFIED` even if they agree. There are no per-field confirmation requirements. Editing an expense
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

With policy features `vision` and `receiptVision` on (the default) and `checks.privacy` off, an image-capable connection reads the receipt image after a one-time consent. Gemini API/organization CLI uses its advertised ACP image capability; **Gemini via Antigravity, compatible endpoints and Copilot currently use text-only transports**. The page displays the selected reading mode, including after OCR startup, installation or folder selection. The image is resized to 1800 px at most; a PDF sends its first three pages. The AI reads independently of OCR and the page compares the readings; the person confirms the populated form once. With an image-capable connection, AI-only reading is available without local OCR. With `checks.privacy` on, no image is sent.

For a text-only connection, local OCR is required. After opening a receipt, the connected AI automatically reconciles existing OCR candidates, including the source-backed expense description, after the existing text-transmission consent. Masking and typed candidate-token restrictions remain enforced. The AI may correct a selected OCR candidate but cannot overwrite manual edits, invent missing values or recover text that OCR never read from the image. Real handwriting/image accuracy remains subject to pilot acceptance; use an image-capable connection such as Gemini API to read the original directly.

The page also shows the document type (from the AI or the printed heading) and a checklist for the chosen claim category. Each item names its source: AFP circulars, general payment-document elements to confirm with AFP, or "no source yet, ask AFP". The checklist prepares documents; it is not an approval.

## Boundaries

`autoRouting`, `checks.privacy` and `checks.authority` are off by default. Managed policy controls them; attachment, memory, receipt and tool consent retain their own rules. Do not describe optional checks as active for every request.

- Conversation history and drafts are local application data, not diagnostic logs. API secrets use Electron secure storage. Most provider-managed authentication uses an isolated runtime profile. Experimental Antigravity uses a shared native OS keyring: configuration isolation does not isolate Google identities, and STeP disconnect does not log out that native account. See [current compatibility blocker](antigravity-adapter.md).
- Ordinary document attachments send extracted, reviewed text and block unsupported/incomplete extraction. Receipt vision and the separate managed image-input control can transmit original image pixels under their own policy/consent gates; text masking does not redact pixels. One source attachment per request preserves one-source Playbook constraints.
- The host rejects file, shell and action requests from provider runtimes and exposes no external submission or publishing IPC. A separate public retrieval run enables only native web search after privacy and authority checks. Runtime restrictions still require adversarial live verification. Export happens through host code.
- DOCX/PDF/Markdown preserve headings, lists, bold, italic and tables (Markdown tables from the model become real tables in the editor, at most 500 rows by 30 columns, no merged cells). Generic Word/PDF exports retain TH Sarabun New 16 pt; document-tool fonts follow the choices described above. HTML break tokens from model Markdown map to native hard breaks; arbitrary HTML stays text. A4 body margins are left 3 cm, right 2 cm, top 2.5 cm and bottom 2 cm; a first-page Garuda starts at 1.5 cm from the top. Missing local fonts can cause substitution, so inspect the notice, install the required face and re-export before reviewing layout. XLSX puts each table on its own sheet (bold header, borders, filter, frozen header; plain numbers become numbers, codes with a leading zero stay text) and the rest of the draft as clean text. To use it in Google Sheets, upload the XLSX to Google Drive and open it with Google Sheets. PPTX puts tables on their own slides and paginates text; this is not an Office layout editor.
- Graph edges are navigation aids, never authoritative evidence. Use `node scripts/graphify-local.js build` from the root and verify inferred edges against source.
- Native Windows/macOS CI builds validate installer creation for the tagged revision; they do not prove every provider account, clean-machine installation, receipt accuracy or staff workflow. Provider/hardware acceptance and organizational rollout remain separate.
- Drafting rules and the Skill go to each runtime's system instructions (Claude `systemPrompt`, Codex `developerInstructions`, Gemini `GEMINI_SYSTEM_MD`); request, sources, conversation and draft travel in tagged sections that source text cannot open or close.
- A busy service, dropped connection or exited runtime is retried twice; quota and sign-in failures are not. A Playbook that stops keeps its finished steps, and "ลองอีกครั้ง" continues from the step that stopped. Up to three tasks in different Workspaces may run at once.
- A follow-up that revises a draft is routed on its own text for the authority check, so an approval request cannot ride on an earlier allowed route.
- Gemini sign-in: since 18 June 2026 Google serves Gemini CLI only to API keys and Gemini Code Assist Standard/Enterprise licenses. Personal Google accounts and Google AI Pro/Ultra must use a Gemini API key; the sign-in option requires the organization's Google Cloud project.


### Claude Console OAuth

STeP Desktop รองรับ OAuth แบบ official ผ่าน Anthropic `ant` CLI โดยใช้ `ant auth login` และเก็บ profile แยกต่อ connection ใน app data ผ่าน `ANTHROPIC_CONFIG_DIR`. Claude Agent SDK อ่าน profile เดียวกันโดยตรง จึงไม่ต้องคัดลอก OAuth client ID, อ่าน token file หรือบันทึก access/refresh token ในฐานข้อมูลของ STeP

Anthropic ไม่มีตัวติดตั้ง `ant` สำหรับ Windows ถ้าเครื่องยังไม่มี `ant` STeP Desktop จะดาวน์โหลด release ทางการ v1.36.0 จาก `github.com/anthropics/anthropic-cli` (MIT) เมื่อผู้ใช้กดเชื่อมต่อหรือกด “ติดตั้ง ant CLI” ตรวจ SHA-256 ที่ปักไว้ในโค้ด และตรวจใน profile ชั่วคราวว่าเป็น `ant` 1.5 ขึ้นไปที่รองรับ OAuth ก่อนติดตั้งไว้ที่ `components/ant` ใน app data ถ้า `ant` ของผู้ใช้เองอยู่บน PATH จะใช้ตัวนั้นก่อน

โหมดนี้ใช้ Claude API workspace/usage ของ Claude Console ไม่ใช่โควตา Claude Pro/Max. การใช้แพ็กเกจ Pro/Max ภายในแอปเป็นการเชื่อมต่อแยก ("แพ็กเกจของคุณผ่าน Claude Code" เฉพาะเครื่อง Pilot) ดู [docs/claude-subscription.md](claude-subscription.md)
## Managed organization policy

Desktop permissions and hooks are documented in [desktop-policy.md](desktop-policy.md). The OpenHarness adaptation roadmap and remaining phases are tracked in [openharness-parity.md](openharness-parity.md).
