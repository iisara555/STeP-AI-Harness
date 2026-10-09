# CHANGELOG — STeP AI Harness

บันทึกสิ่งที่เปลี่ยนในแต่ละรุ่นที่แจกให้พนักงาน รุ่นที่ยังไม่มี GitHub Release ถือเป็นรุ่นเตรียมออก ไม่ใช่รุ่นที่อนุมัติแจกแล้ว ชุดติดตั้งต้องมาจาก release tag และผ่าน Release Gate ตาม [Pilot Operations](docs/pilot-operations.md)

workflow `Publish Pilot Release` ใช้ส่วน `## v<รุ่น>` ของไฟล์นี้เป็น release notes ของ GitHub Release และจะไม่ออก release ถ้ายังไม่มีหัวข้อของรุ่นที่ระบุใน `package.json`

## Unreleased

### Chat

- While the AI works, the chat shows one status line that changes in place (for example "กำลังอ่าน Skill" then "กำลังเขียนคำตอบ") instead of a growing list of finished steps, so only the answer and the current step are on screen. "ความคิดของ AI" starts folded; open it to read the AI's reasoning.

## Desktop v0.5.36 — 2026-10-09

### AI connection page and chat (PR #122)

- The AI's working steps stay visible in the chat with a checkmark for each finished step (up to 30), and "ความคิดของ AI" stays open. Native dropdowns (model, mode, permission) use theme colours, so their text is readable in dark mode.
- A connection whose browser sign-in is still waiting can be removed: removing it cancels the sign-in first instead of failing as busy.
- Claude choices are clearer: with the Claude subscription pilot off, the admin form defaults Claude to API key, labels Console OAuth as API billing (not Pro/Max) and says how to turn on the pilot.
- The service cards on the AI connection page are all the same height and keep their order when "ดูบริการอื่นอีก" opens; the "แนะนำ" label sits on the card's top edge.
- The loading window stays up for at least 5 seconds.

## Desktop v0.5.35 — 2026-10-09

### Fix

- The phone-number mask no longer hides digits inside a task id or other UUID (an id ending `-027766844efc` looked like a Bangkok number), so an exported conversation keeps its real id.

### Documentation: new README and organization knowledge in its own folder

- Rewrite the README: answers about STeP come from organization documents, the AI services that connect, first-open warnings on Windows and Mac, the three ways to read a receipt, the tour, speaking styles, Learning Inbox, AI usage, What's New and language, and in-app updates on both systems.
- Move the 14 organization knowledge documents (HR, AFP, ISO, teams, executives, project codes, facilities) from `docs/` to `docs/knowledge/`, with an index. Add `docs/README.md`, a map that separates organization knowledge, user guides and harness development documents. Registry, Skills, plugin, package files and tests follow the new paths; installed Skills update removes the old copies.

### Faster, more accurate organization knowledge and a loading screen

- Registered documents can list `keywords` in `manifest/documents.yaml`: the words staff actually ask with when the document uses other terms (ลาพักร้อน for the annual leave rules, ส่งเบิกล่วงหน้า for AFP Lead Time). Search counts them like a section heading. On a benchmark of 55 staff questions (`desktop/eval/knowledge-questions.json`) the right document now comes first for 53, up from 46; `desktop/test/knowledge-accuracy.test.ts` fails if a change drops below that. BM25/IDF weighting was measured too and did not improve these documents, so the search keeps equal weights.
- STeP Desktop opens with a minimal loading window (a flip-book of the STeP symbol drawn 16 different hand-made ways at 10 frames a second, in one colour and the saved theme), reads the organization documents and the Skill catalog in the background, and shows the main window only once the workspace has drawn its first screen (at most 20 seconds). The first STeP question no longer waits for the document index.

## Desktop v0.5.34 — 2026-10-09

### ChatGPT receipts and Antigravity (PR #117)

- ChatGPT (Codex) receipt reading and the OCR filter send their JSON shape as the turn's output schema, so replies match what the host parses; the OCR filter limits each field to its own OCR candidates. Gemini API receipt requests ask for JSON output.
- Antigravity continues a run's tool turns on one `agy` process and sends only new tool results, with one fresh restart if the process stops. Structured requests pass `--json-schema`. Pin `agy` 1.3.2, check its version once per binary, and count thinking and cache-read tokens.

### Fixes after Desktop 0.5.33 review (PR #116)

- A summary, translation or spelling request that touches STeP itself (a matching registered document, an STeP MIS request, or words such as STeP, ระเบียบ, สวัสดิการ, วันลา, ฝ่ายบุคคล) now keeps full context and the organization's documents. Only text with no organization sign uses the light text scope.
- Recover a retained Claude or Copilot conversation once with the full prompt when its SDK process stops between tool turns, as Codex and Gemini already do. Add Thai messages for a dropped AI conversation and a denied native tool.
- Gemini API key: a per-minute rate limit (429) now retries as a busy service; only a daily, billing or zero allowance reports a used-up quota.
- `modelLimits.contextWindow` now accepts 16,384 through 2,000,000 tokens and `maxOutputTokens` must stay below half the window; the previous 4,096 example left a 2,457-token budget below the ~3,400 tokens every message needs.
- Windows configuration writes retry atomic replacement for up to three seconds; the concurrency test reader pauses between reads like a real reader.
- The GitHub Packages release step runs only for the `step-cmu` owner whose scope the package name uses, instead of failing with 403 on every tag.

## Desktop v0.5.33 — 2026-10-09

### Context and provider performance

- Use a conservative text scope for new supplied-text translation, summary and spelling/grammar tasks after routing, authority and privacy checks. Keep routed Skills and mandatory rules; omit registry/tool discovery and empty envelopes. Compact document discovery to ID/title/summary and add governed reference outlines. Keep standing governance before registries and task-specific system content.
- Cache local Skill metadata and organization sections with file/manifest invalidation. Add managed model window/output overrides, including small context windows, and opt-in Anthropic-compatible ephemeral caching. No new runtime dependency, database, service or model router.
- Retain Claude and Copilot SDK conversations across tool turns alongside Codex/Gemini RPC reuse. Reset on changed context/account/runtime, stop retained conversations on cancellation, and preserve reported usage through dropped-session recovery. Native runtime tools remain disabled.
- Normalize compatible API errors for Desktop retry and preserve cache-read/write usage, including failed streams. Price cache subsets without double-counting input; label ordinary-price estimates when cache rates are missing. Record prompt components, prefix hashes, TTFT, transport/reset and local tool time.
- Add reproducible `desktop eval:context` fixtures and lifecycle/accounting regressions. Local estimated input falls from 14,529 to 3,489 tokens for translation (76.0%) and from 12,228 to 4,861 for spelling (60.2%). These measurements do not establish live latency, cache hits or billed savings. See [context performance](docs/context-performance.md).
- Extend Fast Path to explicit Thai/English language requests with a colon, newline, inline supplied text or a missing-source question, retaining dedicated translation Skills. Mixed actions, context pointers and existing-task requests keep full context.
- Use the existing router/retrieval rankings for up to three discovery candidates, retaining mandatory sources and the complete compact index when evidence is uncertain. Governed Skill/reference catalog actions can discover omitted entries; candidate discovery does not activate a Skill or approve an action.
- Add opt-in Gemini API-key text caching through `cachedContents`, with five-minute TTL, account/model/prefix isolation, bounded host metadata and normal-generation fallback for unavailable/expired resources. Subscription/custom-runtime/search/image paths keep Gemini CLI. Include cached input and thinking output in usage; cache storage charges remain outside the token-cost estimate.
- Release Desktop 0.5.33 and Harness 0.7.7. No new runtime dependency or policy-default change. Validation uses synthetic providers; live cache-hit/latency/billing evaluation remains separate.

## v0.7.7

- Preserve compatible API cache read/write usage, including failed streams, and recognize structured quota/context errors without exposing provider error bodies.
- Add Gemini usage normalization: cached tokens are included in input totals and thinking tokens are included in output. Unknown cache observations remain absent.
- Cache local Skill catalog metadata with file/manifest invalidation. Ship the context-performance implementation/configuration guide and retain governed routing and mandatory-source behavior.
- Includes Desktop 0.5.33 source. Download Desktop installers from the [Desktop release](https://github.com/iisara555/STeP-AI-Harness/releases/tag/desktop-v0.5.33). Provider measurements are local text estimates and synthetic transport checks, not live latency or billing guarantees.

## Desktop v0.5.32 — 2026-10-09

### Desktop: UI review round 2

- Keep see-through buttons (icon buttons, the version line, the composer pickers) clear when disabled instead of filling them grey; the AI tab in Settings shows its title once; the OCR hint wraps at a readable width.
- Show only the model name in the composer's default model picker so it no longer truncates; Skill Hub shows "ใช้ได้ทุกทีม" instead of the team code COMMON.
- Release Desktop 0.5.32; Harness remains 0.7.6. No new runtime/model dependency or policy-default change.

## Desktop v0.5.31 — 2026-10-08

### Desktop: document revisions and natural speaking styles

- Treat labeled field replies inside an active document task as revisions of the current draft, retaining the original Skill, template, reviewed source and earlier edits. Keep unrelated tasks separate and run the latest message through the authority gate. Pass native editor headings, lists and tables as Markdown instead of flattened text, after checking the raw draft for credentials and masking contiguous inline identifiers before Markdown escaping; cross-block redactions use the fully masked plain copy. Ask the model to preserve unrequested document sections and user edits.
- Require separate document/review envelopes for new AI output before creating a proposal. A conversational answer or malformed response leaves the accepted draft and pending proposal intact; saved legacy proposals remain readable. Keep conversational personal preferences and speaking-style fragments out of the five document-tool generation prompts, so a chat display name is not treated as the document author.
- Update the Ob-Oon/Witty style fragments and source documents to use their reasoning flow internally, without printed stage labels, fixed heading templates or repeated greetings. Add synthetic multi-turn, manual-edit, source-retention, malformed-output and authority-block regressions; these tests do not certify live provider drafting quality.

### Desktop: accessibility, wording and interface edge cases

- Complete the UI review for PR #112: improve contrast, heading/landmark order, keyboard focus, resize semantics and terms navigation; clarify policy, OCR and Skill availability labels; simplify dialogs, setup, Settings and empty states.
- Keep model/reasoning selection in the composer, display the current page in title-bar search, truncate long navigation labels, retain hover/focus task actions and show a clear connection action before the first task. Match AI setup illustration sizes and theme disabled controls, syntax highlighting and diff colors.
- Defer the Receipt, Document Tools and Skills screens into separate chunks with a loading/error state. Display readable usage-provider names and USD costs without rounding small charges to zero. Add synthetic renderer regressions and reproducible light/dark accessibility screenshots; axe-core is a development-only dependency.
- Release Desktop 0.5.31; Harness remains 0.7.6. No bundled private agency forms, new runtime/model dependency or policy-default change.

### Desktop: handwritten receipt review with Hybrid OCR and Vision AI

- Prefer independently read Vision values for handwriting while retaining OCR evidence and protecting manual corrections, including intentional blank fields. Add bounded confidence, handwriting, uncertainty and full-page coordinates; focusing a field opens its image detail, with PDF page previews when Vision is available. Keep the single final confirmation.
- Show five preliminary receipt elements: payee name/address, payment date, expense items, amount in digits/words and receiver signature. Missing or unreadable signature/item information stays visible as missing or uncertain. AI transcribes issuer address and amount words into editable fields; signature observations distinguish receiver, issuer and buyer spaces and support corrections under the same final confirmation. Presence review does not identify or authenticate a signer, and exact category acceptance still needs AFP sources.
- Send full-page context plus source-resolution detail crops for single-page images, under the existing image consent and policy gate. Read PDF bytes from the selected snapshot and reject more than three receipt pages instead of silently omitting pages. Keep image size limits and the shared timeout/cancellation checks; introduce no model dependency or policy-default change.
- Check exact satang arithmetic, Thai amount words, tax-ID checksum, observed item quantity × price and an explicitly stated item-table sum. Invalid formats, contradictions and unknown rounding rules remain review findings. One independent re-reading may follow a numeric contradiction; it never calculates replacement values or retries indefinitely.
- Preserve both Vision readings and table rows as `EXTRACTED_UNVERIFIED` even when equations agree or the selected form is confirmed. Only selected values compared by a person become `SOURCE_FACT`; this is transcription review, not proof of authenticity or reimbursement approval. Vendor master integration awaits an organization-confirmed source.
- Validation uses synthetic amounts, metadata, images and a mocked Gemini API. These results do not establish accuracy on real handwriting or acceptance on Windows two-core / Mac M1 4 GB devices. Local OCR acceptance remains open; Antigravity remains a text-only receipt transport.
- Make the synthetic coordinator overlap check wait for both child requests instead of assuming a 5 ms delay creates overlap under CI load. Keep its concurrency assertions and bounded failure deadline; limit Desktop test-file concurrency to two so process-based fixtures do not compete with every other test file at once.

## Desktop v0.5.30 — 2026-10-08

### Desktop: DOCX spacing

- Give working-layout DOCX explicit single line spacing (`auto`, not an exact point height) and a 6 pt gap after narrative paragraphs while keeping fields and signature lines together. Preserve repeated spaces, inline tabs and manual line breaks as native Word content; prevent justified short lines ending with Shift+Enter from expanding their spaces.
- Preserve manual breaks in native-template fields, including reference/date lines and trailing breaks. Reuse existing Word compatibility settings, avoid adding a second template indentation prefix, and fill only missing signature space when the editor already contains blank lines. Keep the agency template’s paragraph spacing, fonts, tables and sections.
- Add synthetic DOCX regressions to the existing Desktop test command and review all pages of synthetic drafts across five profiles and four privately selected MIS templates. These checks cover exporter behavior; they do not certify live AI accuracy or exact pagination in every Word version. Update Desktop to 0.5.30 with Thai/English in-app notes; Harness remains 0.7.6. No new application dependency, bundled agency document or policy-default change.

## Desktop v0.5.29 — 2026-10-08

### Desktop: local agency DOCX templates

- Use a privately selected DOCX form for memos, external letters, project proposals and department minutes. TOR retains the existing 16-section working template by owner choice. Native export reflows the current editor content with the selected form’s paragraph/run styles, tabs, graphics, native table grids/merged budget bands, headers/footers and portrait/landscape sections. Keep source author/custom metadata and external hyperlinks out of the new document; retain missing facts as placeholders.
- Send only a bounded, sample-free outline and column meanings to AI for an agency template. Keep selected file bytes in a session-owned local snapshot; preserve through retries/revisions, exclude snapshot references from JSON export and detach them from forks/new tasks. A verified outline does not authorize sending the original source text when the privacy intake withholds it. No MIS document, credential or image is bundled in the public repository or installer. Employees select their authorized MIS files locally.
- Stop export on mismatched table/column counts or recognized column meanings rather than dropping content or exchanging quantity and money. Preserve native fonts/emblems; omit old body signature images and unused media. Native-template PDF is produced from the reviewed DOCX in Word. Reject macros, active fields, embedded objects, unsupported tracked/controlled content, external resources, unsafe ZIP/XML and over-limit files. Bound source reads even if a selected file grows. Reuse existing dependencies; no font/runtime download or policy-default change.
- Add test-first synthetic native-template/storage/security tests to the Desktop test glob and a four-profile Electron smoke to `test:electron`. Private QA also exercises four MIS source forms with synthetic body facts outside the repo. TH SarabunIT๙ is unavailable on the cloud machine, so memo/letter fallback rendering does not establish font/layout conformance; review every exported page in Microsoft Word with the template fonts installed. No live AI factual-accuracy or real-document OCR claim.


### Desktop: separate document bodies from Skill review and correct memo layout

- Keep editable/exported document content separate from AI explanations, Skill verification tables, unresolved-field lists and export advice across all five drafting tools. Preserve review in the app after acceptance, indicate when the draft has changed, and handle existing proposal review headings without removing legitimate document tables or source placeholders. Reject incomplete/ambiguous output envelopes.
- Use continuous narrative paragraphs for short memos and support optional reviewer/decision-maker fields without inventing approval or signatures. Recognize the agency unit label and signature names/positions, avoid distributing short final lines, use TH Sarabun New for memos and a 30 pt bold memo title. Map Markdown HTML break tokens to safe native line breaks; keep literal code and arbitrary HTML as text.
- Add synthetic document-body/review, service/revision, native DOCX layout and renderer/IPC/export regressions. Real agency examples stay outside the repository; these checks do not establish live-model factual accuracy, legal compliance or approval. Included in Desktop 0.5.29; Harness remains 0.7.6.
- When no working folder exists, Export opens a native folder picker with folder creation and continues exporting into the chosen folder. Cancellation keeps the draft and configuration intact; concurrent exports cannot open duplicate dialogs for the same document. Workspace selection merges current settings and retains the existing export action gate.
- Align memo reference/date fields in two PDF columns while preserving their rich labels and ambiguous date placeholders, matching the native DOCX tab layout.
- Let employees identify an attachment as the current task's source or an example agency form. Carry that purpose through the drafting request and Skill checks, directing example forms to supply structure rather than prior names, dates, project codes or amounts. Template choice does not verify extracted values or grant approval.

### Runtime maintenance: task ownership, receipt review and concurrent persistence

- Keep chat run cleanup under one owner so a new run started from a completion event retains cancellation and exclusivity. Share concurrent OCR startup, cancel stopped attempts, and prevent a late child exit from clearing a replacement.
- Recheck task ownership after awaited organization hooks so duplicate sends cannot overwrite an active task's status and a delayed deletion cannot remove its draft or private template.
- Preserve human receipt corrections and their provenance when delayed AI readings arrive; keep form values, descriptions and review state together. Serialize receipt read/vision/filter before dialogs, retain current settings when recording consent, and recheck/cancel on policy changes before sending images or OCR text.
- Apply only current Desktop snapshots and task selection replies; track background completion per session/attempt. Serialize draft saves, configuration updates, personalization synchronization and shared-profile writes. Use atomic private temporary files for configuration/profile persistence and remove unused runtime imports.
- Retry atomic configuration replacement briefly when Windows readers/scanners hold a sharing lock. Keep the previous file intact on persistent failure and clean up the writer lock and temporary file. Use portable test preload URLs and expose Windows CI failures without bypassing the gate.
- Add synthetic concurrency regressions and a real Electron renderer/IPC smoke; record scope and limits in `docs/refactor-review.md`. No dependency, OCR acceptance gate, Skill registration or policy-default change; tests do not establish accuracy on real receipts.

### Documentation: task-first STeP AI, Desktop and Skills introductions

- Rewrite the product READMEs around employee tasks, first-use steps, drafting and export outcomes, with Thai examples and clear links for getting started or asking for help. Keep receipt review, pending-source fields, outgoing AI data and organizational approval limits visible without promising real-document accuracy or automatic privacy checks.
- Move source inventories, development commands, packaging, evaluation and policy details to separate maintainer guides; include those guides in the package whitelist. Regenerate the Skills README from its source and update the existing documentation checks to verify inventory and links at their new locations. No application, Skill behavior, version or policy-default change.

## Desktop v0.5.28 — 2026-10-07

STeP Desktop 0.5.28 adds document-type Garuda exports and packages the Skill-backed document layouts and Antigravity chat recovery below. Harness remains 0.7.6.

### Desktop: Garuda letterheads in editable DOCX and PDF

- Export memos with a 1.5 cm-high Garuda and external letters with a 3 cm-high Garuda, preserving the graphic's aspect ratio. DOCX uses a first-page header, an editable 29 pt memo title with matching Thai/Latin properties, and live first-page/continuation page-number fields. PDF uses the same document-type/font selection and a first-page letterhead. TOR, project proposals, minutes and generic drafts receive no automatic emblem.
- Add Thai/English export controls for the document default or **No Garuda emblem** and explicit PSK/New font choices in DOCX/PDF. The host derives the type from the stored Skill-backed task and rejects arbitrary emblem paths, URLs and option values before allocating output. The original 800 × 800 transparent graphic is bundled offline, preserving its fine lines instead of using a coarse scanned drawing; [provenance](docs/third-party-notices/thai-garuda.md) records its pinned source, checksum and separate historical sizing reference. No image or document is sent to AI during export; no new runtime dependency or policy-default change.
- Add test-first physical-dimension, first-page-only, native-text/table, selected-font, source-byte, opt-out and invalid-input regressions to the Desktop test glob, plus real Electron controls/IPC/export checks. Validation uses synthetic documents and controlled providers only. Actual PSK rendering is reviewed with Electron/LibreOffice; native Microsoft Word and current agency-form approval still require review on employee devices. No real-document OCR accuracy claim.

### Desktop: editable DOCX with Skill-backed working layouts

- Share one source-gated, 16-section TOR skeleton between drafting and official-document Skills. Replace fixed penalties, qualification thresholds, legal clauses and SLA defaults with pending-source fields. Regenerate the Claude plugin from the same source; drafting and acceptance do not establish procurement approval.
- Select the DOCX working layout from the stored document-tool task. Format document titles, memo reference/date tabs (including bold labels), letter sender/date blocks, signatures and minutes headers; keep native paragraphs/tables, source numbers and unresolved fields editable. Add live page-number fields with a Thai-number format and keep headings with the following paragraph or table. Attached agency forms supply source text; their original Word layout is not preserved.
- Use an explicit TH Sarabun PSK family for the five working layouts and offer an allowlisted TH Sarabun New override. Show the chosen face and a local font-availability notice without downloading fonts or treating the two families as equivalent. Generic exports retain their existing font; policy defaults remain unchanged.
- Add test-first source/template, OOXML and Electron regressions to the existing root test file, Desktop test glob and document-tools smoke. Evidence uses synthetic documents and controlled providers only. Native Microsoft Word, real provider drafting quality, current agency-form approval and actual-font layout still require review on employee devices.

### Desktop: recover Antigravity chat after a blocked native tool

- Guide Antigravity to text responses and the STeP `step-tool` protocol. Stop a native tool request, wait for process shutdown and cleanup, then allow one fresh attempt with explicit recovery instructions. Both attempts share the original deadline and retain strict native-tool denial. Authentication, quota, invalid-policy and uncertain-shutdown failures are not replayed.
- Publish text only after an attempt completes and validates, so partial prose or tool requests from a failed attempt cannot leak into the recovered answer. A persistent denial has Thai/English guidance instead of a raw `TOOL_DENIED` status. Native web search remains unavailable; missing current information needs an actual source or a connection that supports search.
- Add test-first synthetic NDJSON and Electron chat regressions for recovery, bounded repeated denial, timeout, host tool/data checks and localized errors. Include the new chat smoke in `test:electron`. These checks use simulated providers and local synthetic sources only; live Antigravity behavior and native Windows/macOS recovery remain unverified. Recovery can consume one additional provider request; failed-stream usage may be unavailable. No policy-default change.

## Desktop v0.5.27 — 2026-10-07

STeP Desktop 0.5.27 packages the prepared Office/context work below together with the connection and updater fixes. Harness remains 0.7.6. Publishing installers does not establish live model benefit, real-document OCR acceptance or organizational rollout approval.

### Release checks: portable Office evaluation fixtures

- Resolve temporary-directory aliases before comparing paths in the synthetic output-boundary test, matching the runner’s canonicalized repository. Use native temporary paths rather than Linux-only literals for the Windows assertions. Keep child/root rejection and sibling acceptance checks.
- The `desktop-v0.5.24` build stopped at unit tests and `desktop-v0.5.25`/`desktop-v0.5.26` stopped at renderer fixtures; none published installers or an update feed. This version supersedes those source tags; it does not add dependencies or change the evaluation Privacy Gate. The aliased-temp failure was reproduced and corrected on Linux; native checks remain part of the release workflow.

- Synchronize the synthetic update-recovery fixture with the actual Retry response before injecting another state. Reproduce the previous timeout with delayed IPC and renderer scheduling, then verify the same sequence passes after the fix. Preserve every retry/install/call-count assertion and keep the version line disabled during downloading.

- Wait for the first-run wizard to disappear before installing update IPC stubs. A visible profile behind the modal does not establish that asynchronous settings/snapshot calls finished. Reproduce the stuck-modal failure with delayed setup calls and verify the fixed fixture passes, without forcing clicks or dropping assertions.

### Desktop: guided AI connection in Settings and Setup

- Share a two-step flow: choose an AI and connect, then show the result of the automatic one-message test. Distinguish signing in from a successful test, allow retry on the same connection, and offer Start working only after actual readiness.
- Recommend and preselect Gemini via Antigravity for people with eligible Google/student access, without claiming every account is eligible. Connect/install/sign-in/test from one button. Other AI services remain selectable; extra services, model choices and account maintenance are available on demand.
- Check the real renderer with synthetic connection IPC, including failed-test recovery, busy navigation, credential reset and narrow/light/dark layouts. These tests use no live sign-in or provider quota.

### Desktop: retry macOS update failures in the app

- Keep download, network, missing-feed-file and checksum failures retryable inside STeP. Previously every failure after discovering a Mac version pointed to GitHub and incorrectly claimed a signed build was needed.
- Preserve the verified ZIP/self-install flow and actual error code. Offer explicit manual download only for an app bundle that cannot be replaced or a legacy native signature requirement; explain moving out of the DMG and retrying. Clicking the version line retries inside the app. Clear a stale manual link after a successful retry.
- Add test-first updater recovery regressions and renderer action checks. Downloads/checksums use synthetic data; the native bundle-swap tests run only on macOS. Already-installed old versions keep their old updater behavior until upgraded.

### Router: missing SOP approval context

- Treat an absent approved SOP or an unknown approver as missing draft context, rather than an approval request. A later instruction to approve or enact the SOP still hits the existing Human Authority gate.
- Add test-first synthetic drafting/enactment regressions. No authority-registry, policy-default or lifecycle change; these tests do not establish live model quality.


### Office Skill evaluation with Desktop OAuth

- Give Office and coauthoring positive evals self-contained synthetic inputs and concrete output assertions rather than expecting specific artifacts from prompts with no data.
- Add a source-only ChatGPT/Codex OAuth Skill comparison runner with read-only Desktop connection discovery, zero-prompt self-test/backend probe, fresh WITH/WITHOUT sessions, bounded host tools and a persistent call ledger. Results remain outside the checkout and include a summary without raw outputs or user paths.
- Validate using synthetic files, simulated profile metadata and a controlled six-trial RPC loop through real Office host tools. Explicit live uses the existing host consent for the built-in public synthetic cases; credential-shaped inputs still block before model execution. Live model quality, coauthoring/receipt cases not selected by the three-task runner, and Windows/macOS PowerPoint review remain unverified. Keep draft/modelSideRun statuses; no live quality claim.


### Desktop: Excel export from conversation tables

- Guide an Excel request to actual XLSX creation from the existing table/draft, instead of silently substituting CSV or promising a file without requesting the tool. With the tool loop disabled, describe the existing draft export UI.
- Report staged and applied results according to the existing permission mode. Preserve pending facts and leading-zero identifiers; direct Google Sheets access requires an actually available authorized connector.
- Add a test-first chat-to-workbook regression using real host tools, synthetic conversation data and a scripted provider, covering Ask and Accept Edits. This verifies prompt delivery and file behavior; it does not establish live model compliance or Skill benefit.

### Office tools, interface evaluation and document coauthoring

- Add a draft `spreadsheet-work` Skill with four-dimensional routing evals and synthetic examples. Desktop can create typed XLSX workbooks with local formulas and editable PPTX decks with Thai text, tables, charts and speaker notes through the existing Changes/permission gates.
- Patch XLSX input cells without rewriting unrelated ZIP parts. Refuse formula/protected cells, merged non-anchor cells, macros and signed packages; expose formulas/cached results separately and require spreadsheet-application recalculation. This is not a guarantee of every Excel feature round-tripping.
- Add isolated, counterbalanced tool-usability plans, host-evidence scoring and a controlled Office artifact runner. Scripted WITH/WITHOUT negative controls verify the interface/scorer only; live model-side usefulness remains unmeasured.
- Extend step-writing, document-review, decision-memo and sop-authoring with context gathering, section refinement and reader evidence. Distinguish author-review from an independent reader; add evals/examples and reduce legacy evaluation debt.
- Add an optional Google Workspace connector for bounded Drive/Docs/Sheets reads, draft creation, revision-bound text append and RAW cell updates. Writes require exact trusted-host authorization; no automatic sign-in, tool-loop enablement, sharing or send operations. Tests use simulated CLI responses; live OAuth/Google API remains unverified.
- Validate with synthetic workbooks/decks and LibreOffice rendering/recalculation. No real-document accuracy, production model benefit, universal Office compatibility or policy-default change is claimed. Record method provenance without copying proprietary document Skills.

### Desktop: grounded follow-ups and temporary tool handles

- Include host task/source metadata in ordinary model turns, as well as compacted turns. Keep attached conversation sources available across factual clarification and acknowledgement turns.
- Explain that an unavailable paging handle is limited to the current tool run and does not establish that the original document or Skill expired. A fresh source read retains existing consent, masking and policy checks; tool data and paging caches remain run-scoped.
- Guide chat to continue an already requested draft after a clarification answer, keep acknowledgements brief, and ground loading/recovery/background-work claims in actual host results.
- Verify with synthetic conversation and tool-loop regressions. These checks cover source retention, error contracts and prompt delivery; they do not establish live-model response quality. No policy default or provider credential change.

## Desktop v0.5.23 — 2026-10-07

STeP Desktop version 0.5.23 packages the two sections below for `desktop-v0.5.23`. Harness package version remains 0.7.6; real-document OCR acceptance remains open.

### Receipt OCR: key fields Thai receipts actually print

- **Before:** on a normal Thai tax invoice (รวมเงิน, VAT 7%, จำนวนเงินรวมทั้งสิ้น) the receipt check left the total blank as "ambiguous" and never found the pre-VAT sum. A bare "เลขที่ 000123" or "No. 000123", labels OCR split with a space ("ยอด รวม"), English dates ("Oct 6, 2026") and amounts like "1, 070.00" were missed. A till slip could show "Cash 100.00" as the shop name, and a page lying on its side was read sideways.
- **After:** ยอดสุทธิ / รวมทั้งสิ้น outrank a plain ยอดรวม / รวมเงิน; Sub Total is never taken as the total; subtotal + VAT = total settles competing totals and fills a missing subtotal. A VAT rate ("7%") is not read as the VAT amount. Bare เลขที่ / No. are read as the receipt number while address lines are rejected, and repeated bilingual labels ("เลขที่ BILL NO. 042") are skipped. Payment and address lines are kept out of the shop name. A page whose text runs sideways is read in both quarter turns and the clearer reading is kept. Text detection works at 1280 px instead of 960 (`STEP_OCR_DET_SIDE` overrides) and scanned PDF pages render at 200 DPI instead of 150. Two equally strong totals that disagree still stay empty for a person to choose, and letters inside numbers ("1O7.00") are still left for a person to check.
- Tests: new cases in `experiments/local-thai-ocr/tests/receipt_review.test.cjs` and `tests/test_image_prep.py`. Not yet measured on real receipts or for speed on a 2-core Windows PC.

### A fuller welcome tour that is easier to start

- **Before:** the tour had 7 short steps that skipped connecting AI, the document drafting tool, settings and updates; it could only be opened from the end of the Setup Wizard or the command palette, and there was no way to stop after the essentials.
- **After:** the tour has 2 parts. Part 1 "พื้นฐาน" covers what is needed for a first task: new task, example tasks, asking in plain Thai, attaching files with personal-data masking, choosing how to work (including plan before acting and permissions), connecting AI when none is connected, and reviewing the draft. It stops at a checkpoint where people can start working or carry on. Part 2 "เครื่องมือช่วยงาน" covers document drafting, the AFP receipt check, Skills, model and reasoning level, settings, the version and update line, and Ctrl+K. Each step has a short tip in plain words, a part label and progress dots. New people also see "ใช้ครั้งแรก? ดูทัวร์แนะนำการใช้งาน" on the welcome screen until they finish the tour.
- Tests: new `tour-smoke.mjs` walks the whole tour in light or dark theme and checks every card stays on screen; `i18n.test.ts` checks every tour step has English text.

## Desktop v0.5.22 — 2026-10-07

STeP Desktop version 0.5.22 packages the section below for `desktop-v0.5.22`. Harness package version remains 0.7.6.

### Version and update status under your name; readable selected document type

- **Before:** the app's version was not shown anywhere in the main window, so staff could not tell which version they had or whether a newer one was out until the update card appeared. In the document drafting tool the selected type (for example ร่างบันทึกข้อความ) turned pale, and in the dark theme its text almost disappeared; the unselected types looked selected.
- **After:** under the person's name the sidebar shows `v<version>` with "เป็นเวอร์ชันล่าสุด", "มีอัปเดต <version>" (with a dot), "กำลังตรวจอัปเดต…" or "ตรวจอัปเดตไม่สำเร็จ". Clicking it checks for updates, or restarts into a downloaded one. The document type picker shows unselected types as plain cards and the selected one in solid yellow with dark text, in both themes.
- Tests: `whats-new-smoke.mjs` checks the version line.

## Desktop v0.5.21 — 2026-10-06

STeP Desktop version 0.5.21 packages the OCR improvements below for `desktop-v0.5.21`. The in-app update notes are available in Thai and English. Harness package version remains 0.7.6; real-document OCR acceptance remains open.

### Desktop: documentation and release notes

- Correct the private-pilot path test to expect the canonical destination when temporary directories have symlinked ancestors, as on macOS. The `desktop-v0.5.20` tag did not publish installers because its Mac unit-test job failed; 0.5.21 replaces that unpublished candidate without rewriting its tag. Linked-file rejection and the canonical-path implementation are unchanged.

- Update the employee and developer README with current receipt behavior, synthetic OCR evidence and text-to-image API instructions. Document image intent/context limitations found with simulated providers; these image behaviors are not changed by this release.
- Add in-app update notes and synchronize Desktop package/lockfile versions. Windows/macOS installers and the rolling update feed are published by the existing tag workflow after its checks.

### Local Thai OCR: preserve critical values and reduce avoidable work

- Apply phone EXIF orientation before OCR and stretch contrast only on faded images with a bounded tonal range, preserving the source file and recording preprocessing. Recover overlap-only tile lines with review flags and preserve conflicting tile readings as unverified candidates. Reject invalid confidence values instead of treating them as reliable.
- Match receipt amounts to the actual row using detected text polygons for mild skew and nearby next-line evidence. Recognize explicit buyer-number labels even in seller tax rows. Keep malformed decimals, comma groups and signed amounts out of positive payment fields; independent cross-checks retain numeric punctuation and reference separators.
- Import PaddleOCR only when image recognition is needed, so native-text PDFs avoid model startup. Bound CPU threads to available cores, maximum four, without adding models or changing policy defaults.
- Validate synthetic image font coverage, support a licensed Latin/digit fallback with its digest and an optional EXIF phone-rotation case. Reject malformed money in benchmark scoring; never measure boxes as printed numeric answers.
- Keep private pilot paths outside all Git checkouts; refuse linked export targets and write to the checked canonical destination. OCR installers include runtime sources only, excluding development benchmarks and private image/report files. Saved drafts describe selected-value verification without claiming unchecked OCR was reviewed.
- Add test-first synthetic regressions to the root/desktop test scripts. Evidence uses synthetic images and local CPU models only; it does not establish real-document accuracy or close the acceptance gate. No Router integration or policy-default change.
- On the same nine generated images, canonical field matches improved from 50/63 to 59/63 (including two annotated absences); two merchant errors and two missing money fields remain. A three-process native-text PDF check reduced median startup from 2.322 s to 0.279 s on this Linux host. Details and limitations: [synthetic quality evidence](experiments/local-thai-ocr/benchmark/QUALITY-RESULTS-2026-10-06.md).

## Desktop v0.5.19 — 2026-10-06

STeP Desktop version 0.5.19 (`desktop/package.json`) packages the next four sections for `desktop-v0.5.19`. The in-app "What's new" window summarizes them in Thai and English. Receipt and provider checks use synthetic data and simulated services; real-document OCR accuracy remains unverified. Harness package version remains 0.7.6.

### Desktop: receipt mapping with Gemini via Antigravity

- Report the selected transport's receipt capability consistently after status, start, install and folder selection. Antigravity is text-only; do not offer or attempt image reading through it. Gemini API/ACP retains its image capability and existing permission checks.
- Automatically ask a connected text-only AI to reconcile OCR candidates after reading, including the source-backed expense description, with the existing masking/consent and token-only rules. Preserve manual edits and the single final source-comparison confirmation; do not silently discard filter failures.
- Improve synthetic cash-bill mapping for seller/buyer separation, book/bill identifiers, Thai month dates and item tables whose column headings/numeric cells precede descriptions.
- Verify with synthetic unit tests and Electron/IPC fixtures; no real receipt accuracy, native handwriting quality or live Antigravity image support is claimed. No new OCR model, Router integration or policy-default change.

### Desktop: scribbled thinking motion

- Replace the gooey waiting indicator in chat with original overlapping hand-drawn loops that retrace at different speeds, inspired by the supplied scribble reference. Keep the progress text, elapsed time and stop control.
- Size the waiting motion at 18 × 18 pixels, half its initial 36 × 36 size.
- Use theme-aware SVG/CSS with no image assets, animation dependency or per-frame JavaScript. Reduced-motion mode traces slowly without the shape's sway.
- Verify the running chat, actual stroke motion and reduced-motion behavior with the existing synthetic-provider Electron smoke test.

### Desktop: file, credential and local OCR security

- Reject multiply-linked workspace files and existing linked SQLite database/journal files. Use literal Git pathspecs and hide denied filenames, including staged rename sources, from status and diff results.
- Check agent-browser DNS for subresources and redirects; reject private destinations unless explicitly allowed by managed policy. Keep POSIX app-data/log directories private and refuse Electron's Linux `basic_text` credential fallback.
- Reject foreign Host/Origin requests to the loopback OCR service before reading documents. Return immediately when the worker is busy, bound upload reads and omit filenames/query values from service logs.
- Update vulnerable build/download dependency chains with targeted overrides. Full Desktop, production-only Desktop and privacy-vendor audits report zero known advisories at review time.
- Add synthetic security regression tests and real Electron sandbox/CSP/IPC checks; record evidence and remaining deployment limits in `docs/desktop-security-review.md`. No real documents or live-provider accounts were used; Windows/macOS behavior on staff machines and publisher signing remain unverified. No OCR accuracy claim or policy-default change.

### Desktop: reliable Mac updates and Antigravity retry cleanup

- Reject Mac update read/write failures through the download pipeline and remove incomplete archives while retaining SHA-512 checks. Locate the zip's canonical app bundle independently of a renamed installed `.app`.
- Keep browser timeout cleanup distinct from user cancellation; a late Antigravity process exit cannot close a newer attempt's code prompt. Explicit cancellation still stops sign-in.
- Regression tests use synthetic archives and simulated sign-in. macOS update/sign-in on staff machines and real-account results remain unverified.

## Desktop v0.5.18 and earlier

STeP Desktop version 0.5.18 (`desktop/package.json`) contains the next four sections, published as `desktop-v0.5.18`: "What's new after an update", "Antigravity on the first page of setup", "Word files with pictures can be attached" and "Mac updates install inside the app". Version 0.5.17 contains the next two sections, published as `desktop-v0.5.17`: "Antigravity sign-in: paste the code Google shows into STeP" and "Mac disk image: a Thai first-open guide". Version 0.5.16 contains the next eleven sections, from "Antigravity sign-in opens the browser, and the receipt page speaks plainly" to "Learning from work, part 5: see whether lessons help", published as `desktop-v0.5.16`. The harness-only sections among them (Thai Skills, receipt-audit evals, the local Thai OCR benchmark) also ship inside the app's harness copy.

### What's new after an update

- **Before:** after an update nothing said what had changed; staff had to read this file on GitHub.
- **After:** the first time the app opens on a new version, a "มีอะไรใหม่" window lists what changed since the version the person last saw, in plain Thai (or English). "รับทราบ" closes it for good; the command palette ("มีอะไรใหม่ในรุ่นนี้") opens it again. A new install does not show it.
- The notes live in `desktop/src/whats-new.ts`; a unit test fails a release whose version has no notes there.
- Tests: `whats-new.test.ts` (version order, which notes show) and `whats-new-smoke.mjs` (new install, an older profile, the palette).

### Antigravity on the first page of setup

- **Before:** the setup wizard's "เชื่อมต่อ AI" step showed ChatGPT, OpenRouter and Gemini (API key); Gemini via Antigravity was behind "ดูบริการอื่น".
- **After:** Gemini via Antigravity is on the first page, so someone with only a Google account can connect without a key. The wizard puts the four services in one row and the connect button stays in view at 800×650.

### Word files with pictures can be attached

- **Before:** a Word file with any picture in it, such as the Garuda emblem or a letterhead on a บันทึกข้อความ, was refused as "อ่านเนื้อหาได้ไม่ครบ" and the drafting tool only said "ส่งไฟล์นี้ให้ AI ไม่ได้". Reported on 2026-10-06 with a ขออนุมัติใช้จ่ายหมวด A2 memo.
- **After:** pictures are left out and named in the status line ("รูปภาพ N รูปในไฟล์ไม่ได้ส่งให้ AI ถ้ามีข้อมูลสำคัญในรูปให้พิมพ์เพิ่ม"); the file's full text goes to the AI. Text in text boxes is read as before. Charts, SmartArt, embedded objects (an Excel table) and imported chunks still withhold the file, because their content lives outside the text; the message now says so and what to do.
- The document drafting tool shows the specific reason a file was refused instead of one generic line.
- Harness `src/modules/privacy/document-worker.js` changes with it (CLI and app alike). Pictures were never sent to the AI either way.

### Mac updates install inside the app

- **Before:** on a Mac, the update card's button opened the GitHub release page. The person had to download the disk image, drag the app over the old one and get past the "Move to Trash" warning again. macOS's own updater (Squirrel.Mac) installs only updates signed with the same Developer ID, which STeP does not have.
- **After:** a Mac downloads the update in the background like Windows and shows **รีสตาร์ทเพื่ออัปเดต** (restart to update). STeP fetches the zip for its processor from the update feed and keeps it only when its sha512 matches the feed. When the person restarts, a small script waits for the app to quit, unpacks the zip next to the app, checks the new bundle with `codesign --verify --deep --strict`, swaps it in and opens it. A file the app downloads itself has no quarantine flag, so the new version opens without the warning.
- Any failure before the swap leaves the installed app as it was and opens it again. When the app cannot be replaced in place (run from the disk image, a translocated copy, or a folder the person cannot write), or the download fails, the card falls back to the release page as before.
- Updates from 0.5.18 to later versions use this. Moving from 0.5.17 to 0.5.18 still opens the release page, because 0.5.17 has the old updater.
- Tests: the update flow with a fake feed; the sha512 check; and, on the macOS CI runners, the real script swapping an ad-hoc signed bundle and refusing a tampered one. Not yet tried as a real update on a real Mac.

### Antigravity sign-in: paste the code Google shows into STeP

- **Before (0.5.16):** after Allow, Google sent the browser to Antigravity's page, which shows an authorization code to paste into the CLI. The CLI ran hidden with no input, so there was nowhere to paste it and sign-in stalled. Reported on a Mac on 2026-10-06.
- **After, Mac:** STeP runs the hidden `agy -p` behind a pseudo-terminal (`/usr/bin/script`) and opens a box, **รหัสจากหน้าเว็บ**, with three numbered steps. The pasted code is typed into the waiting CLI. A wrong or late code opens a fresh Google page, up to three tries, then the terminal window.
- **After, Windows:** there is no pseudo-terminal to borrow without a native module, so STeP opens the Antigravity sign-in window straight away. Its progress text now says to paste the code there (right-click or Ctrl+V) and press Enter.
- **Mac kept saying "connecting" after a successful sign-in (reported 2026-10-06):** STeP checks the sign-in with `agy models` in an isolated home, which hides the real profile's sign-in on macOS. The isolated home now links `~/Library/Keychains` back to the real one (the link is removed before the folder is deleted) and copies agy's token file (`~/.gemini/antigravity-cli/antigravity-oauth-token`, used when the keyring is unavailable) when it exists. If the real profile is signed in but STeP still cannot see it, the connection stops after two checks with a Thai message instead of waiting five minutes.
- Checked with the real agy 1.2.17 on Linux: a code typed through the pseudo-terminal reaches Google's token exchange (a fake code returns `invalid_grant`). Not yet tried with a real Google account on a Mac or Windows.

### Mac disk image: a Thai first-open guide

- **Before:** on macOS 15 and later, opening STeP Desktop for the first time showed a dialog with **Move to Trash**, and the disk image said nothing about what to do. The only guidance was in the README.
- **After:** the disk image window holds **อ่านก่อนเปิดครั้งแรก.html** next to the app and the Applications folder. It opens in the browser and explains, in Thai, both dialogs staff can see: "Apple could not verify…" (Privacy & Security → Open Anyway) and "is damaged" (one `xattr -cr` command in Terminal). The README's macOS section says the same.
- The dialog itself stays: removing it needs an Apple Developer ID certificate and notarization, which the project does not have.
- The installer build now runs `codesign --verify --deep --strict` on the app inside the disk image, so a broken ad-hoc signature (which turns the dialog into "is damaged") fails the build instead of reaching staff.

### Antigravity sign-in opens the browser, and the receipt page speaks plainly

- **Antigravity sign-in without a terminal window:** "Connect and test" now runs the Antigravity CLI's own sign-in hidden and opens Google's sign-in page straight in the browser; the person picks an account and presses Allow. STeP stops the CLI as soon as the sign-in works. If the CLI shows no page, or its one minute runs out, STeP falls back to the terminal window as before, and now says to press Enter once, because that window first shows a "Select login method" menu. Only an `https://accounts.google.com/o/oauth2/` address from the CLI's own output is ever opened. Checked against the real 1.2.17 CLI on Linux (address in half a second, process stopped cleanly); not yet tried on Windows or macOS with a real Google account.
- **Antigravity texts in Thai:** the service card now says STeP installs and signs in for you, and the disconnect button, its tooltip, the removal note and the administrators' form are in Thai.
- **Receipt category with its name:** the suggested category reads "B10 · ค่าน้ำดื่ม" instead of the bare code, for every code the suggestion can return.
- **Plain buttons:** "บันทึกร่าง (JSON)" is now "บันทึกผลตรวจเก็บไว้", "ให้ AI pre-check ต่อ" is "ให้ AI ตรวจทานต่อ", and the OCR evidence notes no longer say "candidate" or "map".
- **OCR trial tools hidden from staff:** the trial and measurement tools on the Receipt page show only when the new policy feature `ocrTrial` is on (default off).
- Tests: `test/antigravity-install.test.ts` (sign-in address filter, browser-first then terminal fallback, a stand-in CLI that prints the real sign-in text), `test/receipt-workflow.test.ts` (category names); `receipt-smoke.mjs` turns `ocrTrial` on and checks "B10 · ค่าน้ำดื่ม"; `antigravity-smoke.mjs` checks the Thai text. `gemini-api-smoke.mjs` failed on main since the outcome-first receipt page (a flagged item now shows twice, and the category picker is folded); it now opens the fold and takes the first match.

### Desktop: per-account provider quotas, credits and API usage

- Add provider-reported Usage cards to the existing `/usage` dialog: Codex quota windows/credits, Claude subscription windows/extra usage, Copilot request entitlements, OpenRouter key spend/account credit and DeepSeek currency balances. Claude/Copilot readers remain explicitly experimental; other connections show local accounting and a provider link without invented quota readings.
- Keep 5h/weekly windows, credit units, USD/CNY balances, API key limits, UTC API spend and app estimates distinct. Attribute new token ledger entries to their connection/mode while retaining historical unattributed totals.
- Refresh on request with memory-only snapshots, one-minute deduplication, serial runtime reads, managed credentials, bounded official-endpoint HTTP and runtime cleanup. No prompts, automatic login, transcript scans, added dependencies, policy-default change, version bump or release.
- Validation uses synthetic provider responses and fake-runtime Desktop UI/IPC only. Real-account access, billing reconciliation and Windows/macOS minimum-machine performance remain unverified.

### Thai Skills: STeP contracts, connected handoffs and Desktop date review

- Adapt six selected Thai methods from Boom-Vitt/claude-thai-skills (MIT, pinned upstream revision), rewriting the procedures and synthetic examples for STeP. Add `thai-english-translation` at draft; extend official documents, writing, brand tone, service replies and receipt arithmetic without importing tax rates or legal claims as current policy.
- Document and test handoffs among translation, official drafting, brand review, service triage and AFP pre-check. Add four-dimensional translation/brand evals, extend neighboring collision and missing-source cases, and remove completed brand eval coverage from legacy debt. Preserve previous model-side evidence separately; these revised outputs remain not-yet-run.
- Desktop drafting loads the added working references into model context, adds memo considerations, and retains original form dates alongside formatting/review metadata. Receipts and memo/letter forms share strict calendar/era parsing; two-digit years remain for full-year confirmation rather than guessed centuries. No new runtime dependencies or NLP models.
- Validation uses synthetic deterministic tests and fake-provider integration only. No real-document OCR/translation accuracy, minimum-hardware acceptance or legal compliance is claimed. No OCR Router integration, lifecycle promotion, version bump, release or policy-default change.

### Desktop: document drafting forms backed by actual Skills

- Add TOR, internal memo, official letter, project proposal and meeting-minutes forms under Tools and the Skill hub. Enter known facts or attach one source, draft with the selected connected AI, then use the existing editor and export controls.
- Load the selected Skill's actual procedures and mandatory references, supporting document-format Skill and working template through the normal routed WorkService. Retain the contract for revisions/retry; preserve privacy, consent, provenance and Human Authority checks. Missing context never falls back to a generic prompt.
- Keep missing data as `[รอยืนยัน]`; do not invent document numbers, budgets, legal clauses, resolutions or approvals. Working templates are not verified agency forms and text drafting does not claim exported-file layout checks.
- Extend `project-plan` with a proposal workflow, synthetic example and four-dimensional eval; remove its completed coverage from `legacyWithoutEvals`. No Skill lifecycle promotion, new model dependency, version bump, release or policy-default change.
- Verify with synthetic unit/routing tests and Desktop UI/IPC using a local fake AI, including attachment-consent cancellation, editor changes and DOCX export. Live-model writing quality and real agency-form acceptance remain unmeasured.

### Desktop settings: one style configuration point under General

- Move assistant speaking styles and dialect from Appearance & language to General, alongside answer styles previously selected in Memory.
- Save style selections together with general settings, validate changed answer styles against the local catalog before saving, and retain existing selections. Appearance keeps UI language/themes; Memory keeps memory management.
- Verify preset/custom/dialect persistence, unique picker placement and answer-style saving with isolated Electron profiles and synthetic fixtures. No version bump, release or policy-default change.

### Desktop receipt review: outcome first, automatic form filling, one final confirmation

- Lead with document usability, detected type, a source-linked expense-category suggestion and next steps. Read item descriptions from vision or explicit OCR labels; never infer a purchase from the shop name or invent an approved project budget.
- Format source-backed Thai digits, valid dates and monetary amounts for the existing OCR form. Preserve missing amounts, leading zeros, raw readings and alternatives; collapse OCR evidence, reread tools, the full checklist and pilot controls.
- Keep one final source-comparison confirmation for all populated fields and the expense description. Editing description, purpose, type or category withdraws confirmation; category suggestions remain recommendations, and transcription confirmation never resolves missing policy or approves payment.
- Add synthetic workflow/provenance tests and fake-OCR Desktop UI/IPC coverage. No real-document accuracy claim, new OCR dependency, policy-default change, version bump, release or OCR registry integration.

### Desktop: local OCR trial and human-reviewed field report

- Add an opt-in local OCR trial to the Receipt page: install/read within Desktop, preserve the initial field suggestions and review flags, and show recognition time and differences against human-checked values.
- Suppress automatic AI image reading and candidate filtering for trial reads; independent vision remains an explicit action under existing policy and consent. Editing withdraws confirmation and disables trial export until rechecked.
- Export a private JSON pilot report with unverified machine readings, human source comparison, exact-match/review outcomes and an open acceptance gate. Reject trial inputs/exports inside Git checkouts, including symlinks; RAM remains explicitly unmeasured.
- Synthetic unit and fake-OCR Desktop IPC/UI checks only. No real-document model accuracy, Windows/macOS hardware acceptance, version bump, release, OCR registry integration or policy-default change.

### Receipt-audit: four-dimensional eval coverage and synthetic worked outputs

- Add positive, anti-trigger, collision and missing-source evals covering extraction uncertainty, arithmetic mismatch, AFP authority and missing current finance rules.
- Add synthetic worked outputs and preserve the boundary between human-checked values, raw extraction and policy authority; remove receipt-audit from `legacyWithoutEvals`.
- Routing/source/authority checks run in CI. Model-side output assertions remain `not-yet-run`; examples and tests do not establish real-document OCR accuracy or payment eligibility. No lifecycle promotion or OCR registry integration.

### Receipt extraction provenance: unverified readings and human source comparison

- Add source-required `EXTRACTED_UNVERIFIED` for OCR/AI readings. Only the selected value checked against its document becomes `SOURCE_FACT`; unverified manual entry is `USER_INPUT`.
- Preserve provenance in receipt JSON and chat handoff. Raw OCR, independent vision and alternatives remain unverified; ordinary OCR attachment consent does not verify its text.
- Editing or a successful reread withdraws receipt confirmation. Human checking does not approve reimbursement or establish document authenticity.
- Synthetic unit/IPC smoke checks only; no real-document accuracy claim, new OCR Router integration or privacy-policy default change.

### Local Thai OCR: synthetic acceptance benchmark and private pilot tooling

- Generate 80 seeded Thai receipt/ground-truth pairs covering H–O, including simulated (not real) handwriting.
- Score OCR, independent vision and combined readings per field, critical errors and review TP/FP/FN/TN; measure time, sampled process-tree RAM and optional runtime/cache sizes.
- Private runs reject input/answer/output paths inside the public checkout, including symlinks. Live vision is explicit and bounded; replay is labeled separately.
- Tests use synthetic images and responses only. No real-document accuracy or Windows/macOS minimum-machine acceptance is claimed; the acceptance gate remains open for owner-reviewed pilot evidence. No OCR Router integration or policy-default change.

### Learning from work, part 5: see whether lessons help

- The Learning Inbox has a new **How lessons are doing** section. It uses data the app already has, makes no model calls and costs no tokens:
  - answers that used lessons compared with answers that did not, with how many were rated "good" or "needs fixing" (until each group has 20 rated answers it says they cannot be compared yet);
  - per lesson: how many answers and tasks it was sent with, their ratings, when it was last used, and how often the same thing had to be corrected again after it was confirmed.
- A "needs fixing" note, or a new lesson typed by the person, that restates an active lesson (50% of the shorter text's character pairs) counts as a repeated correction. AI drafts, the automatic review, revisions and imported proposals do not count. Lessons corrected again are listed first with a hint to make them clearer or check their triggers.
- Each turn records only lesson ids and revisions, kept apart from the lessons so recording never interrupts a running task. Nothing is changed or disabled from these numbers; they are signals for a person, not proof the AI improved.
- Tests: `test/learning-metrics.test.ts`. `test/learning-smoke.mjs` rates an answer "needs fixing" with a note that restates the lesson and checks the section shows one repeated lesson.

STeP Desktop version 0.5.15 (`desktop/package.json`) contains the first three sections below, published as `desktop-v0.5.15`: "All speaking styles in one picker", "Gemini via Antigravity sends requests again" and "Gemini via Antigravity: one click installs, signs in and tests" (PR #99; the one-click install, sign-in and test has not yet been tried on a real machine). Version 0.5.14 contains the next section, published as `desktop-v0.5.14`: "Speaking styles: Witty, Ob-Oon and Northern Thai". Version 0.5.13 contains the next four sections, published as `desktop-v0.5.13`: "Receipt check: one confirmation, and the document type from its title", "Removing a connection no longer depends on signing out", "Default model for new tasks" and "Gemini via Antigravity is back among the AI services". Version 0.5.12 (`desktop/package.json`) contains the next four sections, published as `desktop-v0.5.12`: "Learning from work, part 4: opt-in background review and a health report", "Learning from work, part 3: compare a Skill before and after a change", "Learning from work, part 2: propose a lesson to a Skill's maintainers" and "Learning from work, part 1: Learning Inbox, lesson rollback and AI drafts". The scripts and workflow in part 3 belong to the harness, not the app. Version 0.5.11 contains the next five sections, published as `desktop-v0.5.11`: "Long tasks: compaction sized to the model, more tool turns, a progress report at the limit", "Work in progress survives switching pages", "Web agent: finds tiles on menus that load late, and asks only at the final step in auto mode", "Tables, clean Excel and the Thai official layout" and "Qwen and MiniMax with the employee's own key". "Your plan through Claude Code: off by default, on for the pilot" was published as `desktop-v0.5.10`. "Open source under the MIT License", "Claude Pro / Max in the app, on by default" and "Apps set up before 0.5.8 share their profile too" were published as `desktop-v0.5.9`. Three further sections were published as `desktop-v0.5.8`: "Uninstalling" (the uninstaller's data choice), "One profile for STeP Desktop and Setup-STeP-Skills" and "Gemini via Antigravity: opt the STeP agent out of built-in tools". "STeP Skills for Claude, Codex and Antigravity" belongs to the harness, not the app. The six sections from "The browser agent can click tiles" through "Update card above the profile" were published as `desktop-v0.5.7`. "Gemini: faster tool turns", "Profile pictures" and the contextual empty-state illustrations (PR #91) were published as `desktop-v0.5.6`. Everything from "Updates inside the app" down was published as `desktop-v0.5.5`.

### All speaking styles in one picker

- In 0.5.14 the new "Assistant speaking style" picker showed only Standard, Witty and Ob-Oon, while Coworker, Professional, Concise and Custom stayed in a dropdown on the General tab, so they looked removed. All six are now cards in one picker under Appearance & language, Custom shows its text box there, and the General tab no longer has the dropdown. Picking a preset turns Witty or Ob-Oon off; the dialect choice is unchanged. New Electron smoke test `speaking-styles-smoke.mjs`.

### Gemini via Antigravity sends requests again

- The first live test on 2026-10-05 showed that the signed-in CLI always lists its built-in tools, so STeP refused every request (`ANTIGRAVITY_TOOLS_UNAVAILABLE`). STeP no longer requires an empty tool list. It still confirms strict mode with every native action denied, runs in an empty temporary folder and stops the reply on the first tool use. Owner decision recorded in `docs/antigravity-adapter.md`.

### Gemini via Antigravity: one click installs, signs in and tests

- "Connect and test" on the Antigravity connection now installs Google's official Antigravity CLI 1.2.17 when it is missing or older than 1.2.14 (Windows x64/arm64, macOS arm64/x64; the download is checked against the sha512 in Google's release manifest before anything is replaced). If the Google account is not signed in yet, STeP opens the CLI's own sign-in window, which opens Google's page in the browser, waits until the sign-in works, then runs the test. On Windows the sign-in window closes itself afterwards.
- Each run no longer starts the CLI's background updater, which flashed a console window on Windows.

### Speaking styles: Witty, Ob-Oon and Northern Thai

- Settings > Appearance & language has a new "Assistant speaking style" picker: Standard (default), Witty or Ob-Oon, plus a separate dialect choice, Standard Thai (default) or Northern Thai, that combines with any style. Existing users keep Standard with no dialect, so their prompts are unchanged.
- Each style adds its document's System Prompt Fragment (`docs/speaking-styles/`) after the governance rules and personal preferences, marked as wording only. Styles never change facts, sources, authority, approvals or privacy, never role-play the people who inspired them, and formal documents stay in Standard Thai (PR #100).

### Receipt check: one confirmation, and the document type from its title

- Fields the rules left empty, because candidates scored close or low, now get the best OCR candidate marked as a guess. The AI image reading replaces guesses. The per-field "checked" boxes and the separate flagged-lines box are now one confirmation, and editing any field clears it (PR #97).
- The document type is read from the printed title first, so a quotation whose terms mention a receipt is no longer classified as a receipt. "ABB" matches only as a whole word.

### Removing a connection no longer depends on signing out

- A Claude Console OAuth connection that never signed in could not be deleted. "ลบการเชื่อมต่อ" asked the Anthropic CLI to sign out first, and when the CLI was missing or had nothing to sign out of, the whole removal stopped.
- Signing out is now best effort when a connection is removed, for Claude and ChatGPT alike. A failure is only logged. The connection's runtime home, which holds its sign-in tokens, and its stored key are still deleted. "ออกจากระบบ" on its own is unchanged.
- Tests: `test/electron-smoke.mjs` creates a Claude OAuth connection with no `ant` CLI and removes it.

### Default model for new tasks

- Settings → การเชื่อมต่อ AI shows "โมเดลเริ่มต้นสำหรับงานใหม่" on each connection once its model list is known. New tasks on that connection start with the chosen model. The model picker in the message box still changes a single task, and that leaves the default alone.
- "ค่าเริ่มต้น (…)" means the service's own default. An Antigravity connection always needs a Gemini model, so it has no such entry.
- The new `connectionModel` call accepts only a model the connection lists or already uses (`INVALID_MODEL` otherwise).
- Tests: `test/default-model-smoke.mjs` sets the default in Settings, checks a new task uses it, changes one task's model without touching the default, and checks that unknown models and connections are refused.

### Gemini via Antigravity is back among the AI services

- Since 0.5.10 the AI connection page and the first-run wizard show services as tiles, and Antigravity had no tile. Only the administrators' form ("ตั้งค่าขั้นสูงสำหรับผู้ดูแล") still offered it.
- "Gemini via Antigravity" is now a tile under "ดูบริการอื่น". It signs in with the Google account in the Antigravity app on the device, with no API key, and still counts as experimental. The tile shows the model (default `gemini-3.8-flash-medium`) and a link to the install and sign-in guide.
- Tests: `test/antigravity-smoke.mjs` chooses the tile first. The Gemini tile checks in `ux-audit-smoke` and `gemini-api-smoke` no longer match the new tile.

### Learning from work, part 4: opt-in background review and a health report

- **Background review** (after Hermes Agent):
  - Every 10 user turns in a task, the AI drafts lessons from it into the Learning Inbox, marked "automatic task review". They are proposals only.
  - It runs only when an administrator allows it (`features.learningReview`, off by default) and the employee turns it on in the inbox.
  - It runs at most 10 times a day, one at a time, never during a running task or in Plan mode. The tokens count in Usage.
- **Lesson store health report** in the inbox, report-only:
  - It flags lessons that look duplicated (character-bigram similarity, which works for Thai), procedures sharing trigger words, proposals waiting over 30 days, long lessons and a store close to its limits.
  - It never merges, deletes or disables anything, and it does not treat a rarely used lesson as worthless.
- Tests: `test/learning-curator.test.ts`. `test/learning-smoke.mjs` checks that the review is off until turned on, that no review happens at 9 turns, that one happens at 10 with source "review", and the daily count.

### Learning from work, part 3: compare a Skill before and after a change

- `node scripts/skill-eval-compare.mjs <skill> --base origin/main` answers the Skill's eval cases with the old and the new `SKILL.md`, using a real model (`STEP_EVAL_BASE_URL`, `STEP_EVAL_MODEL`, `STEP_EVAL_KEY`).
  - The cases include those not used to write the lesson, plus pending lesson cases.
  - A grader model (`STEP_EVAL_JUDGE_MODEL`, ideally a different one) checks each `outputAssertion`.
  - The result is a table per case, old → new, with the assertions the new version still misses.
  - Any case that gets worse fails the run.
  - `--record` stores the result in `baseline.modelSideRun`; `--dry-run` shows the plan without calls.
- The **Skill eval (old vs new)** GitHub workflow runs it on demand from repository secrets and attaches the report.
- `scripts/apply-skill-proposal.mjs` now applies the patch itself instead of with `git apply`. A Windows checkout with CRLF line endings takes the proposal, and the file keeps its line endings.
- Tests: `test/skill-eval-compare.test.js` runs the gate against a fake model on loopback. It checks a lesson that makes its case pass (better, exit 0), the reverse (worse, exit 1) and the record. The proposal test now applies to a CRLF checkout. Not run against a live model here.

### Learning from work, part 2: propose a lesson to a Skill's maintainers

- A confirmed lesson in the Learning Inbox can be sent to the maintainers of an organization Skill ("Propose to the Skill maintainers"). The app writes a proposal file containing:
  - the lesson and its evidence;
  - a patch that adds the lesson to the Skill's `SKILL.md` under "## บทเรียนจากการใช้งาน";
  - a regression test case for `evals/skills/<skill>.json`.
- The app never edits an organization Skill. The whole file passes the privacy check before it is saved, and Plan mode cannot create one.
- For maintainers, `node scripts/apply-skill-proposal.mjs <file>` (with `--dry-run`):
  - checks the patch touches only that Skill and still applies;
  - refuses a test case whose prompt is still the TODO placeholder;
  - applies the patch, adds the case and runs the repository validator, without committing.
  - The Pull Request then goes through the usual review and CI, which routes the case's prompt.
- Tests: `test/skill-proposal.test.ts` applies the patch with `git apply` and runs the script on a full checkout, including the validator. `test/learning-smoke.mjs` creates a proposal from the real app and checks the Skill file is unchanged.

### Learning from work, part 1: Learning Inbox, lesson rollback and AI drafts

- A Learning Inbox (`/learn`, the conversation menu or the Command Palette) holds lessons the employee reviews before they are used:
  - Kinds: a preference, or a procedure with trigger words.
  - Every confirmed change is a new revision that can be disabled or restored.
  - Only confirmed lessons go into the context of later tasks, at most five and 8,000 characters each time.
  - Existing proposals from "needs fixing" notes can be brought in for review.
- New: **Have the AI draft lessons from this task.** In a finished task, the connected AI reads the last 30 messages and the draft, masked and without tools. It drafts up to five lessons, each with the quote it rests on and its reason. The rules follow Hermes Agent's reviewer: write steps, never record a failed approach as reliable, never blame a tool for a one-off problem, return nothing rather than guess. Drafts arrive as pending candidates marked "drafted by the AI", and a draft carrying personal data is dropped. The tokens count in Usage, and Plan mode cannot draft.
- [docs/desktop-learning.md](docs/desktop-learning.md) has the details. Tests: `test/learning.test.ts`, `test/learning-draft.test.ts` and `test/learning-smoke.mjs` (real app with a synthetic AI). Not tried with a live account.

### Long tasks: compaction sized to the model, more tool turns, a progress report at the limit

- The conversation was compacted at about 48,000 tokens on every model, although current models take 128,000 to 1,000,000. Older turns were summarized early and lost detail, and each summary cost tokens. The budget is now 60% of the connected model's window, between 48,000 and 160,000:
  - Claude: 120,000.
  - GPT-5 / Codex and Gemini: 160,000.
  - DeepSeek and Qwen: 76,800.
  - MiniMax: 120,000.
  - A local or custom model of unknown size, or a custom runtime, keeps 48,000.
- One message could make only 8 tool turns. A long web task (open, read, click, read again…) stopped with "เครื่องมือทำงานครบจำนวนรอบ" partway. It now allows 40.
- At the limit, the AI no longer stops with an error. It gets one last turn without tools to say what is done and what remains, and the employee replies "ต่อ" to continue. The same happens early when the AI asks for the same tools three turns in a row, so a stuck task does not spend 40 turns.
- Compaction still runs before every AI call, tool turns included. Task state, the current request and organization rules are never shortened. [docs/desktop-context-memory.md](docs/desktop-context-memory.md) lists the budgets.
- Unit tests cover the budgets, a 70,000-token conversation (sent whole to Claude, compacted for an unknown model), the progress report at the limit and the stop on repeats. Not tried on a live account; the window sizes come from the providers' published limits.

### Work in progress survives switching pages

- Switching from "ตรวจใบเสร็จ AFP" to chat, the Skill hub or Settings closed the page. A reading in progress was thrown away, along with the fields already filled and ticked. The page now stays open in the background once it has been opened, and is only hidden. While it reads, a spinner replaces the "ทดลอง" badge in the sidebar.
- The same check across the rest of the app found two more:
  - A file opened in the Files tab with unsaved edits, a typed advanced command and the folder being browsed were lost when leaving chat or hiding the panel. The panel now stays mounted once shown, and is only hidden. A web page in the Web tab is hidden with it.
  - Leaving Settings while an AI connection was being set up or tested lost its "กำลังเชื่อมต่อ…" state, and the connect button was offered again. Settings now stays mounted, hidden, until that finishes. Profile fields typed in Settings but never saved are still discarded on leaving, as before.
- Draft edits that are not yet saved and text typed in the composer already survived page switches. They are now covered by a test.
- Tests:
  - `test/gemini-api-smoke.mjs` switches to the Skill hub while a slow receipt reading runs, then checks the result, and checks that a ticked field survives Settings.
  - The same test leaves Settings during a slow Gemini connection test and reopens it.
  - The new `test/view-switch-smoke.mjs` covers the draft, the composer and an unsaved file across pages and a hidden panel.
  - The receipt and Settings tests fail on the previous code.

### Web agent: finds tiles on menus that load late, and asks only at the final step in auto mode

- On a coffee menu (seleniumbase.io/coffee) the agent could not find the cups, so the employee had to click them. Three gaps caused this, and all three are fixed:
  - The page was read as soon as it loaded, but the menu arrives from the network afterwards. A read now waits until the page's requests finish and the page stops changing, about 6 seconds at most.
  - A site that handles every click with one listener on the whole page gives the cups no listener of their own.
  - A pointer that appears only on hover (`.cup:hover{cursor:pointer}`) was invisible to the agent. It now reads such rules from the page's style sheets.
- In Full auto (auto mode, when the organization allows `features.autoMode`), the web agent opens sites, clicks and fills fields without asking. It asks only before a final step: a form's submit button, or a control named for sending, paying, ordering, confirming, booking, registering, deleting, transferring, approving, signing, publishing or saving, in Thai or English. In ask mode every open, click and fill still asks, as before. The final-step check reads the button's type and name, so a button with an unusual name that does send something can slip through. [docs/desktop-browser-agent.md](docs/desktop-browser-agent.md) says so.
- `test/browser-agent-smoke.mjs` adds a menu that loads late, with one listener for the whole page and a hover-only pointer. It adds two Americanos, opens checkout and types a name with no approval, then checks that Submit asks. Not tried against seleniumbase.io itself, which this build environment cannot reach.

### Tables, clean Excel and the Thai official layout

- A Markdown table from the model now becomes a real table in the draft, and it can be edited in place. It stays a table in every export: Word (a table with a repeated header row), PDF, Markdown, Excel and PowerPoint. Tables are capped at 500 rows by 30 columns and have no merged cells. Before, tables were flattened into "a · b" lines, and Excel kept the `---` row and the Markdown marks.
- Word and PDF follow the Thai official layout (หนังสือราชการ): TH Sarabun New 16 pt on A4, margins left 3 cm, right 2 cm, top 2.5 cm, bottom 2 cm. Before, they used Leelawadee UI 12 pt with 1.5 cm margins. Word substitutes another font when TH Sarabun New is not installed. The PDF then uses Sarabun, Leelawadee UI or Thonburi, scaled to the same visual size, with their real bold.
- Excel puts each table on its own sheet ("ตาราง 1", "ตาราง 2" …) with a bold header, borders, a filter and a frozen header row. Plain numbers such as `1,500` become numbers, while codes with a leading zero such as `007` and text starting with `=` stay text. The rest of the draft goes on a sheet of clean text. For Google Sheets, upload the file to Google Drive and open it with Google Sheets. STeP does not fill Google Sheets through the browser, because its cells are drawn on a canvas, not form fields.
- A page-by-page check then rendered four synthetic drafts (an official memo, an 8-column table, a 70-row table and awkward cells) to every format and found and fixed:
  - Word lines overlapped. A fixed 12 pt line height was set under 16 pt text; Word now uses single spacing.
  - Word table columns were all the same width. Word and PDF now share one column layout: each column gets room for its longest header word and its figures, and the rest goes to the longer text. A table whose header words still do not fit drops from 16 to 14 or 12 pt.
  - Columns of figures (amounts, percentages) are right-aligned in Word, PDF and PowerPoint.
  - The PDF did not repeat the header row on later pages. It now does, as Word already did.
  - Excel showed `650.50` as `650.5`, and `1,500` would have shown as `1,500.`. Figures now keep their separators and decimal places, and percentages such as `25%` become numbers formatted as percentages.
  - PowerPoint put a heading that sits right above a table alone on its own slide. It now becomes the title of the table's slide, and the slide's columns use the same widths as Word.
- `npm run qa:exports` (`desktop/scripts/export-qa.mjs`) repeats that check: it renders the drafts in `desktop/test/fixtures/export-cases.ts` to PNG pages in `desktop/release/qa/export-visual/img/`. The check here used LibreOffice in place of Office, with Laksaman standing in for TH Sarabun New. The files were not opened in Word, Excel or Google Sheets. Unit tests cover the Word XML, Excel cells and formats, slide tables and PDF HTML. The Electron smoke test edits a table in the editor, saves it and exports it.

### Qwen and MiniMax with the employee's own key

- Staff use several AI services, so the connection page gains two well-known services next to DeepSeek, Groq and the others. Each is fixed to its official OpenAI-compatible endpoint and used with the employee's own key:
  - **Qwen (Alibaba Cloud)**: Alibaba Cloud Model Studio international (Singapore), `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, default model `qwen-plus`.
  - **MiniMax**: international platform, `https://api.minimax.io/v1`, default model `MiniMax-M2`.
- Keys from the China regions (Alibaba Beijing, minimaxi.com) do not work with these presets, and the README says so. The existing preset checks cover both: a fixed destination, policy `providerPresets`, and no proxy. When a service does not list its models, the default model is used.
- Neither was tried with a live account. The endpoints come from the providers' documentation, not from a live call.

### Your plan through Claude Code: off by default, on for the pilot

- Anthropic was asked how its Claude Code terms apply. Its reply restated the terms and pointed to sales, but did not confirm this design. The in-app connection on the employee's own Claude plan is therefore off by default again (`features.claudeSubscription: false`), after 0.5.9 had turned it on. Pilot machines turn it on with `scripts/pilot/enable-claude-code.ps1` (Windows, run as Administrator) or `scripts/pilot/enable-claude-code.sh` (macOS, sudo). These scripts set it in the administrator-owned managed policy, give the folder and file the ownership and permissions STeP Desktop requires, and turn it off with `-Off` / `--off`. The Windows script keeps other policy settings, while the macOS one refuses to overwrite a policy that has other settings. The macOS script was dry-run in a temporary folder. The Windows one was not run here.
- Anthropic's terms do not allow its names as our feature's own name, so the connection is now called "แพ็กเกจของคุณผ่าน Claude Code" ("Your plan through Claude Code"), not "Claude Pro / Max". The handoff option that opens Claude Code is unchanged.
- [docs/claude-subscription.md](docs/claude-subscription.md) records Anthropic's reply point by point, plus the pilot steps. `test/electron-smoke.mjs` again expects the feature off unless `STEP_CLAUDE_SUBSCRIPTION=1`.

### Open source under the MIT License

- The whole repository is now MIT-licensed, as the project's maintainers at STeP decided: the harness, STeP Desktop and the STeP Skills plugin. It was `UNLICENSED` except for the plugin. `LICENSE` is at the repository root, and `package.json` and `desktop/package.json` say `"license": "MIT"`. Third-party fonts and cmaps in `src/vendor/privacy/` keep their own licences, and the README says so.

### Claude Pro / Max in the app, on by default

- The in-app Claude Pro/Max connection is now on by default, as a policy feature: `features.claudeSubscription`, which a managed policy can turn off. It used to be an off-by-default `STEP_CLAUDE_SUBSCRIPTION=1` switch. `STEP_CLAUDE_SUBSCRIPTION=0/1` still forces it in development. It runs the official, unmodified Claude Code, and each employee signs in to their own Claude account through Anthropic's page, so usage counts against their own plan. STeP never reads or stores the password or token. Claude Code's legal terms (checked 2026-10-04) allow a product to run Claude Code this way when the organization accepts Anthropic's Commercial Terms and does not intermediate usage. The project's maintainers at STeP decided to enable it for STeP staff. [docs/claude-subscription.md](docs/claude-subscription.md) records the conditions. It also leaves one point open: the connection still starts a claude.ai sign-in and accepts only that, which may count as restricting a sign-in method.
- The connection note now says this in the app: sign in on Anthropic's page, usage counts against your own plan, and STeP never sees your password or token.
- `test/electron-smoke.mjs` now expects the feature to be on unless `STEP_CLAUDE_SUBSCRIPTION=0`.

### Apps set up before 0.5.8 share their profile too

- STeP Desktop wrote `~/.step-ai/profile.json` only when the profile was saved, so someone who updated without opening settings had none, and Setup-STeP-Skills could not offer their nickname and team. At start, an app that has finished its first-run setup now writes the file if it does not exist. An existing file is left alone, because it may be newer, from Setup. `test/shared-profile-smoke.mjs` covers both cases.

### Uninstalling

- **STeP Desktop (Windows) asks about your data:** the uninstaller has a page after its welcome page with an unticked box, "ลบประวัติงาน การเชื่อมต่อ AI และการตั้งค่าด้วย · Also remove them". The page text is in Thai and English. Ticking the box removes the app data folder in `%APPDATA%` (tasks, AI connections with their encrypted keys, settings, the OCR runtime) the way electron-builder's `deleteAppDataOnUninstall` would. That setting stays false, so the default keeps everything for a reinstall. Updates run the old uninstaller silently, which shows no page, and `customUnInstall` checks `isUpdated` again, so an update never removes data. Work folders (`output/`) and `~/.step-ai/profile.json` are never touched. `build/installer.nsh` is now UTF-8 with BOM, so NSIS reads the Thai text as Unicode. The page code sits inside `customUnWelcomePage` because this file is included before MUI2 and the NSIS plugins are loaded. electron-builder's Linux `makensis` compiled the uninstaller script. Building the full installer needs Windows or wine, which are not available here, so the page was not clicked through. macOS has no uninstaller; the README says where the data folder is.
- **STeP Skills:** `Uninstall-STeP-Skills.bat` / `.command` run `node scripts/install-agent-skills.mjs uninstall [work folder]`. This removes the plugin and marketplace from Claude and Codex through their CLIs. It removes only the managed rules and profile blocks from `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` and `~/.gemini/GEMINI.md`, and deletes a file only if nothing else is left in it. It removes the Antigravity Skills listed in `installed.json`, global or in the given work folder, so the person's own Skills stay. It asks before removing `~/.step-ai/profile.json`, and Enter keeps it. In an empty home folder with Claude Code, Codex 0.158 and a `.gemini` folder, a full setup followed by an uninstall left only the person's own Skill and their original `AGENTS.md`.

### One profile for STeP Desktop and Setup-STeP-Skills

- **Shared profile:** `~/.step-ai/profile.json` holds the profile as `{ version: 1, name, team, assistant, style, tone }`. That is the nickname, team, assistant name and conversation style. `Setup-STeP-Skills` (`scripts/install-agent-skills.mjs`) writes it with the profile answers, and offers it as the defaults next time, so pressing Enter keeps each value. STeP Desktop (`electron/shared-profile.ts`) fills an unfinished first-run wizard from it. Teams are checked against the router's team list. Desktop writes the profile back whenever it is saved. The file is written atomically with mode 0600, and anything unreadable, oversized or of another version is ignored. Development test runs keep their copy in the test home. Desktop does not edit Claude, Codex or Antigravity files; Setup does.
- **Tests:** `test/shared-profile.test.ts` covers the round trip and malformed files, and Setup's tests check the same format. `test/shared-profile-smoke.mjs` (in `npm run test:electron`) opens the real wizard prefilled from a Setup profile, then saves a changed profile in the app and reads it back from the file.

### Gemini via Antigravity: opt the STeP agent out of built-in tools

- The latest Antigravity CLI is 1.2.17. Since 1.2.1, a custom agent can declare `excludeDefaultComponents: true` to drop the built-in tools and prompt sections. The adapter had relied on `tools: [finish]` alone, which did not narrow the `init` catalog on 1.2.14. `step-draft` now declares both.
- The `init` check is unchanged. The message is still withheld unless the runtime declares only `finish`, so nothing is sent if the option does not take effect. The Linux 1.2.17 binary (SHA-512 verified) accepts the agent, but `init` needs a signed-in Google account, so the effect could not be observed here. See [the adapter notes](docs/antigravity-adapter.md) for how to accept it on a signed-in machine.

### STeP Skills for Claude, Codex and Antigravity (harness, not part of the desktop app)

- **One-command install:** this repository is now a Claude plugin marketplace (`.claude-plugin/marketplace.json`). In Claude Code, `/plugin marketplace add iisara555/STeP-AI-Harness` then `/plugin install step@step-ai` installs all 51 STeP Skills as `/step:<name>`. No STeP Desktop and no `step-ai install` are needed.
- **Rules in every session:** a SessionStart hook adds a short brief to the start of every session, with the rules on human approval, personal data, secrets, writing and output folders. Its full rules files ship with the plugin.
- **Built, not copied by hand:** `scripts/build-claude-plugin.mjs` builds `plugins/step/` from `skills/`, `rules/`, `docs/` and `manifest/`. It flattens Skills to the `skills/<name>/` layout Claude Code scans, rewrites every Markdown link and bare repository path relative to the copied file, and copies what they point at. The sources stay where they are, so the CLI, STeP Desktop and the router are unchanged.
- **No Gemini CLI:** an earlier build of this branch also made the folder a Gemini CLI extension. It was removed, because Google stopped serving Gemini CLI to personal accounts and Google AI Pro/Ultra on 18 June 2026. People with a Google account use Antigravity instead.
- **Codex:** Codex 0.158 reads the same `.claude-plugin/marketplace.json` and plugin manifest. `codex plugin marketplace add iisara555/STeP-AI-Harness` then `codex plugin add step@step-ai` installs the 51 Skills as `step:<name>`. Codex does not run plugin hooks (`plugin_hooks` is removed), so `node scripts/install-agent-skills.mjs codex` writes the STeP brief into `~/.codex/AGENTS.md` between markers; running it again replaces only that block. Against a local recording model endpoint, a Codex session sent the model all STeP Skills and the brief.
- **Google Antigravity:** `node scripts/install-agent-skills.mjs antigravity <folder>` writes three things into a work folder. The Skills go to `.agents/skills/`. The short brief goes to `.agents/rules/step.md`, which is always applied. The full rules, documents and manifest go to `.agents/step/`, so they do not become always-on rules, and the links in the copies are rewritten to point there. Re-running updates in place and leaves the employee's own Skills alone. This was not tried in Antigravity itself, which is not available here.
- **Antigravity for every workspace:** `node scripts/install-agent-skills.mjs antigravity` with no folder now installs globally. The Skills go to `~/.gemini/config/skills/` (Antigravity's global Skills folder), and the full files to `~/.gemini/config/step/`. The short brief goes between markers in `~/.gemini/GEMINI.md`, Antigravity's global rules file, and its rule paths are written as `~/...` so the file carries no user name. Re-running replaces only what the script wrote, and the user's own text and Skills are kept. Adding a folder still installs into that one workspace. The global paths come from public reports about Antigravity 2.0, not from a run of Antigravity itself.
- **Profile, in place of USER.md:** `node scripts/install-agent-skills.mjs profile` asks four questions: nickname, team (from `manifest/teams.yaml`), assistant name and conversation style. Every answer can be skipped. The answers go into a "ข้อมูลผู้ใช้ STeP" block between its own markers. It is written to the global instructions file of each tool found on the computer: `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` (or `$CODEX_HOME`) and `~/.gemini/GEMINI.md`. Flags (`--name= --team= --assistant= --style=`) skip the questions. The team sets the output folder (`output/CC/...`, else `SHARED`). Re-running replaces the block and keeps everything else. Long digit runs (ID or phone numbers), line breaks and markup are refused or removed. The session brief now says to use that block, or a workspace's legacy `USER.md` first. A live Claude session greeted the user by nickname, used the assistant name and named `output/CC/` as the save folder.
- **One double-click for everything:** `Setup-STeP-Skills.bat` (Windows) and `Setup-STeP-Skills.command` (macOS) at the repository root run `node scripts/install-agent-skills.mjs setup`. Claude and Codex get the plugin through their own CLIs when those are on PATH. Codex also gets its rules, Antigravity gets the global install when `~/.gemini` exists, and then the profile questions are asked. A tool that is missing is skipped, and the summary says what to do instead. A wrong answer, such as an unknown team or a phone number, asks again. Without Node.js the launcher opens nodejs.org. Running it again updates everything. In an empty home folder with Claude Code, Codex 0.158 and a `.gemini` folder, one run installed 51 Skills in each tool and wrote the profile and rules blocks.
- **Legacy launchers hand over to the new setup:** an employee downloaded the ZIP from GitHub and double-clicked `Install-STeP-AI.bat` instead of `Setup-STeP-Skills.bat`. When `Setup-STeP-Skills` sits next to them, as in a GitHub download, `Install-STeP-AI` and `Update-STeP-AI` (`.bat` and `.command`) now say the folder workflow is retired and run Setup instead. The Pilot bundle (`scripts/build_pilot_bundle.py`) does not include Setup, so Pilot testers' launchers work as before. A first attempt used `export-ignore` in `.gitattributes` to leave the legacy kit out of the download. It was reverted, because the plugin directory refuses a repository whose archive differs from the checkout. A test now keeps `export-ignore` and `export-subst` out of the repository and runs the hand-over in bash.
- **Ready for the plugin directory:** the plugin is now MIT-licensed, with `plugins/step/LICENSE` from `plugin/LICENSE` and `"license": "MIT"` in `plugin.json`. Only the plugin is relicensed; the rest of the repository keeps its own terms. The plugin also gets a listing icon at `.claude-plugin/icon.png`, which is the STeP Desktop app icon (1024 px square PNG). The author and marketplace owner now give the full name "Science and Technology Park, Chiang Mai University (STeP)". The directory's checks had warned about the missing icon, and about a name that may be confused with an existing listing.
- **README:** the README now offers two ways only: STeP Desktop, or the STeP Skills in Claude, Codex or Antigravity (new section 13). The connection section is updated. Gemini sign-in with a personal Google account no longer works, so it points to a Gemini API key, an organization account or Antigravity, and it adds OpenRouter and the other preset services. The ZIP + `step-ai` CLI, Gemini CLI and the LINE gateway are listed as no longer offered to employees. Their code stays, because STeP Desktop shares the router and Skills in `src/`.
- **Checks:** `test/claude-plugin.test.js` (in `npm test`) also checks both installers (links intact, re-runnable, other files kept). It also fails if Gemini extension files come back, and when `plugins/step/` is out of date with its sources, when a Skill is missing or duplicated, or when a relative link in the plugin does not resolve inside it. `claude plugin validate` passes for the plugin and the marketplace. A local install lists 51 Skills and the hook. A live session received the rules and picked `/step:meeting-summary` for a meeting summary.

### The browser agent can click tiles that only a script makes clickable

- **The problem:** on sites built with Vue, Svelte or plain `addEventListener` (for example the coffee menu at seleniumbase.io/coffee), a drink is a `<div>` with a click listener. It has no button, link, role or `onclick` attribute, and its pointer cursor shows only on hover. The page snapshot found clickable elements from markup and the resting cursor, so it never offered the cups. The AI could only see **Total: $0.00** and told the employee to click by hand.
- **The fix:** before each snapshot, the main process asks the DevTools protocol's DOM domain which elements have click, mouse or pointer listeners. This needs no JavaScript in the page; listeners live in the page's own world, which the isolated snapshot cannot see. Those elements get a random attribute that the snapshot reads and removes at once. A framework root that listens for every click is not offered, because a container of real controls is not a target, and only the outermost of nested targets counts. If the protocol is unavailable (DevTools already open on that page), the snapshot works as before.
- **Better names for tiles:** a tile's label comes from its inner `aria-label` or image alt text before its raw text, so the AI sees "Americano" rather than "espresso water". A new `context` field gives the heading of the card or list item, such as "Americano $7.00". The browser rules tell the AI to match by label or context, click once per snapshot when adding several items, and read again before saying something cannot be clicked.
- The browser-agent smoke now has a page built like the coffee menu. Both cups are found with their names and prices, the root is not offered, and two clicks on Americano make the total $14.00. It also checks that no marker attribute remains on the page.

### A gooey waiting motion

- While the AI works, the activity line now shows ink-like drops instead of the turning spinner. A head pulls up out of a body on a neck, two drops leave to the left, and all of them melt back in on a 3.2-second loop.
- It is drawn in SVG: the shapes are blurred, then a colour matrix sharpens the blur's alpha into one edge. No image or library is needed. It takes the text colour, so it fits the light and dark themes.
- When the system asks for reduced motion (Windows animations off), it keeps moving at half speed, as the spinner did, so a wait never looks frozen.

### Sidebar checked end to end

- **New smoke test:** `test/sidebar-smoke.mjs` uses every sidebar control in the real app against a local fake AI:
  - new task (a blank page, nothing saved until the first message)
  - opening tasks, Thai full-text search and the "no results" message
  - the command-palette button and the **มีผลงาน** filter
  - pin and unpin, rename, and delete (cancel and confirm, including the open task)
  - the Skill hub, the receipt check and settings
  - the profile line, and hiding and showing the sidebar
- **Search no longer flashes "ไม่พบงาน":** while the full-text search is still answering, the list filters by title and loaded text instead of going empty on every keystroke.
- **Renaming keeps what you typed:** clicking away from the name box now saves the new name, as in other chat apps. Before, it threw the edit away. Escape still cancels.

### Chat answers that look like Claude, ChatGPT and Cursor

- **Full Markdown in answers:** answers now render GitHub-flavoured Markdown (react-markdown with remark-gfm). This covers headings at every level, nested and task lists, tables, quotes, `inline code`, strikethrough, horizontal rules and links. Before, inline code, quotes and links showed as plain text.
- **Code blocks with colours:** fenced code is highlighted for common languages (Python, JavaScript/TypeScript, JSON, Bash, SQL, HTML/XML, CSS, YAML, Markdown) in light and dark themes, with a copy button.
- **Calmer conversation:** no name label above every turn. Your message is a right-aligned bubble and the answer is plain text on the page, with larger type and spacing. Copy and feedback buttons stay on the newest answer and appear on hover for older ones.
- **While the AI works:** a blinking caret follows the streamed text, and a single line shows what is happening and the elapsed time. The "app is still working" line now appears only when the app stops reporting.
- **Safety unchanged:** raw HTML in an answer is dropped, never rendered. `javascript:` and other non-web links are not clickable, and web links open in the app's browser panel. Images in answers are not loaded; a link is shown instead. `step-tool` requests stay hidden, including while they stream.

### More AI services, and a simpler connection page

- **Pick a service from tiles:** the AI connection page (Settings and the setup wizard) now lists each service as a tile with how it connects (sign in, API key, or on this computer) and one line about it. The chosen tile opens a card with the key field, a link to where the service issues keys, an optional model and who pays, with the connect button inside it. The old sticky button that covered the text below it is gone; choosing a tile scrolls its card into view. The setup wizard shows the main services first, with the rest behind **ดูบริการอื่น**.
- **New services:** OpenRouter, Claude API, OpenAI API, DeepSeek, Groq, Mistral, xAI Grok and Ollama (local) join ChatGPT and Gemini. Each new service is fixed to its official endpoint and uses the employee's own key, stored encrypted like other keys. These services draft text only; images and web search are not supported yet.
- **Sign in with OpenRouter:** OpenRouter can issue a key for the app through its own sign-in page (OAuth PKCE with a one-time loopback callback on this computer), so nobody copies a key by hand; pasting an existing key also works.
- **Models from the service:** API-compatible connections now load the service's model list (`GET /models`) after connecting. When no model was typed, the service's recommended model is used.
- **Tidier connection rows:** a connection shows its own name (OpenRouter, Groq, ...). A working connection offers **ทดสอบอีกครั้ง** as a quiet button. Runtime and sign-out buttons appear only where they apply.
- **Policy:** new feature `providerPresets` (default on) allows the services above. Set it to false to offer only ChatGPT, Claude, Gemini and administrator-approved endpoints. A free-form endpoint still needs `compatibleProviders` and an approved profile, and preset endpoints are refused while `network.proxyUrl` is set.
- Tests: unit tests for the presets, endpoint checks, model lists and OpenRouter PKCE. A new Electron smoke signs in to a fake OpenRouter and connects Groq with a key; no real service is called. The OpenRouter sign-in has not been tried against the live service yet.

### Update card above the profile, as in Claude and Codex

- **Next to the profile:** when a new version is on its way, a card at the bottom of the task list, above the profile, shows the download with its progress, then **รีสตาร์ทเพื่ออัปเดต** once it is ready (Windows). On a Mac build that cannot install updates itself, it shows **ดาวน์โหลดเวอร์ชัน x.y.z**.
- **One place at a time:** the title-bar button now appears only while the task list is hidden.
- The UX smoke checks the downloading, ready and Mac states of the card and the title-bar fallback.

### Gemini: faster tool turns and fewer failed answers

Found while checking a slow, failed answer to "ผอ.วิน คือใคร" on a Gemini API key.

- **Abbreviations find the documents:** the organization knowledge search spells out Thai title abbreviations (ผอ., รอง ผอ., ผช. ผอ., ผจก., จนท., หน. ทีม) beside the original question. "ผอ.วิน คือใคร" previously matched nothing, so the model had to open documents with tool turns; it now matches the executive board document strongly enough to answer from it directly.
- **One Gemini conversation per run:** every tool turn now continues on one Gemini CLI process and ACP session and sends only the new tool results, as Codex already does. Previously each turn started the CLI again and resent the whole prompt (about 25,000 characters of rules, registries and context) every time. A turn that fails on the open conversation is retried once from a fresh start.
- **Clearer tool format:** the tool rules show an exact `step-tool` example and say it is plain text, not a native function call, for models that stalled on the format.
- **Incomplete answers retry:** a reply that ends early or comes back empty (`invalid chunk`, `missing finish reason`, `MALFORMED_FUNCTION_CALL`) is reported as `PROVIDER_EMPTY_RESPONSE` and retried with the usual backoff, instead of the generic "check the connection and quota".
- Tests: abbreviation and search cases, the new error mapping, and the Gemini API smoke checks that the second tool turn continues the same conversation and carries only the tool results.

### Profile pictures for employees

- **36 hand-drawn profile pictures** (black-ink portraits in the app's illustration style) to choose from in Settings → ทั่วไป → รูปโปรไฟล์. The first option keeps the initial in a circle, as before.
- **The chosen picture shows** at the bottom of the task list, next to the employee's name.
- **Drawings, not photos:** the pictures are illustrations of no one in particular, bundled with the app (`desktop/src/assets/avatars/`, 192 px WebP, about 290 KB in all). Nothing loads from the network or the employee's disk, and settings store only the picture's id; any other value is refused (`INVALID_SETTINGS`).
- Tests: the bundled files match the ids, and the UX smoke chooses a picture, saves it, sees it in the sidebar and checks that a path is refused.

### Updates inside the app, as in Claude, Cursor and Codex

- **No reinstalling:** an installed STeP Desktop checks for a newer version 15 seconds after it opens and every 4 hours, and downloads it in the background. A **รีสตาร์ทเพื่ออัปเดต** button then appears in the title bar. A downloaded update also installs when the app quits. Work and settings stay, because they live in the user's app data.
- **Check now:** STeP menu → ช่วยเหลือ → "ตรวจหาอัปเดต · เวอร์ชัน x.y.z" checks immediately and says whether this is the latest version.
- **Where updates come from:** the `desktop-latest` release of this repository, which always holds only the newest desktop build (`electron-updater`, generic provider over HTTPS, each file checked against the SHA-512 in `latest.yml`). The harness's own pilot releases (`v0.7.x`) are never mistaken for a desktop update.
- **Publishing a version:** bump `desktop/package.json`, then either push the tag `desktop-v<version>`, or run the installer workflow by hand with **publish** ticked (it creates the tag on the commit it built). The installer workflow builds the three installers, publishes the `desktop-v<version>` release, and replaces the files in `desktop-latest`. The two Mac builds' update files merge into one (`desktop/scripts/merge-mac-update-info.mjs`). Runs without a tag only keep workflow artifacts, as before.
- **Mac:** macOS installs an update only when both versions carry the organisation's Developer ID signature (the `CSC_*` and `APPLE_*` secrets). Until then a Mac build learns that a new version exists and shows **ดาวน์โหลดเวอร์ชัน x.y.z**, which opens the release page. Windows updates itself either way.
- **Policy:** feature `autoUpdate` (default on) lets IT turn this off where software is rolled out centrally. Development builds never update themselves.
- **One manual install first:** builds made before this change have no updater. Install a build with it once; later versions arrive by themselves.

### Receipt type and what the claim still needs

- **Document type:** the AI classifies the receipt from the image as a full or abbreviated tax invoice, receipt, cash bill, payment voucher, invoice or quotation, or transfer slip. Without the AI, the printed heading decides. The person can change it.
- **Claim category:** the person picks B, BV, emergency or other (or "not sure"). The checklist follows it.
- **Checklist with its source on every item**, ordered missing → to check → to prepare → notes, with complete items folded into one line:
  - **AFP circulars** (`docs/knowledge/afp-operational-circulars.md`): the category B approval report within 3 working days after the receipt date, with the due date worked out (5 days for emergency; public holidays not counted, so check the calendar); the 10,000-baht caps; the clearing set (FM-AF-002, FM-AF-014, FM-AF-035/036, approval report); photocopying thermal paper; translating foreign-language documents; no inappropriate drinks; emergency pre-approval. A transfer slip, invoice or quotation is flagged as not a proof of payment for clearing.
  - **General payment-document elements**, marked "confirm with AFP": payee, date, what was paid for, amount in figures and words, payee signature.
  - **No source in the app yet**, marked "ask AFP": the buyer name and address to use, and whether a cash bill is accepted. These are never decided by the AI.
- **The AI reports what it sees** (handwritten, thermal paper, foreign language, payee signature, buyer named, items listed, inappropriate drinks); the checklist itself is fixed rules in `desktop/src/receipt-compliance.ts`, with unit tests.
- **Draft and handoff:** the draft JSON records the type, category and checklist under `compliance`; the AI pre-check handoff includes the open items.

### A receipt page that is quicker to check

- **The receipt stays in view:** the image column stays beside the fields while you scroll. A zoom button (or a click on the image) enlarges it for handwriting.
- **Progress at the top:** "ตรวจแล้ว 2/5 ช่อง" with a progress bar and counts of fields where OCR and AI agree, differ, or only one read it. The AI buttons (read the image again, filter the OCR) sit there too.
- **Fields show their state:** a red edge where the readings differ, a yellow fill once ticked. "ตรวจแล้ว" is a pill button.
- **Enter to check:** pressing Enter in a filled field ticks it and moves to the next field.
- **The next step stays reachable:** save, new receipt and "ให้ AI pre-check ต่อ" stay at the bottom of the window, with the checked count beside them.
- **Less jargon:** mapping methods, OCR line types and verdict codes (NEEDS-DOCUMENT-FIX) are kept in the JSON draft but no longer shown. The Tesseract and handwriting add-ons fold into one "ส่วนเสริม OCR" line.

### Receipts read twice: on-device OCR and an AI reading of the image

- **Two readings, compared field by field:** after the local OCR reads a receipt, the connected AI reads the image on its own (the seller, receipt number, date, tax ID and amounts). Each field shows whether the two agree:
  - **Agree:** "OCR และ AI อ่านตรงกัน".
  - **Differ:** the AI's reading is shown beside the OCR value with a **ใช้ค่านี้** button. The OCR value is kept until the person chooses.
  - **Only the AI read it:** the empty field takes the AI's value, unconfirmed and marked for checking against the image.
- **The person still confirms:** nothing is ticked as checked for them; every field still needs "ตรวจแล้ว", and the AI's reading never approves anything.
- **No OCR installed yet:** the page can read a receipt with the AI alone (one reading). Installing the OCR adds the second reading.
- **Rule checks that need no AI**, flagged as advisories beside the existing amounts-add-up rule:
  - the seller's 13-digit tax ID fails its check digit;
  - the seller's tax ID looks like the buyer's: it equals the buyer ID the receipt names, or it is a government-body ID (0994…, such as a university's). Shops sometimes write the customer's ID in their own box, as on a real handwritten cash bill tested for this release;
  - VAT is not 7% of the amount before VAT;
  - the total written in Thai words (แปดร้อยแปดบาทถ้วน) does not match the total in figures.
- **Cash bills:** the OCR treats a นามลูกค้า box as the buyer's section, so a tax ID written there is not taken as the seller's. The AI writes a book and receipt number together ("เล่ม 001 เลขที่ 005").
- **Consent and policy:** the first image sent asks once. The draft JSON records the AI's reading and the per-field match under `vision_check`. Policy feature `receiptVision` (default on, and only with `vision` on) turns it off; with `checks.privacy` on, no receipt image is sent and only the earlier candidate-only AI filter remains.
- **Shared rules and tests:** `desktop/src/receipt-vision.ts` holds the prompt, parsing and comparison, with unit tests. The Gemini API smoke reads a receipt image end to end against a fake Gemini API.

### The app's own title bar, as in Codex and Cursor

- **No Windows menu bar:** the File / Edit / View / Window menu bar is gone. The window has the app's own title bar instead.
  - Left: the **STeP** menu, which groups the commands under งาน, มุมมอง, เครื่องมือ and ช่วยเหลือ, with each command's shortcut and a one-row theme picker. Next to it is a task-list toggle.
  - Middle: a command bar showing the current task. It opens the command palette (Ctrl+K).
  - Right: a side-panel toggle.
  - The bar drags the window.
- **Window buttons:** Windows and Linux keep their minimise, maximise and close buttons, drawn over the bar in the app's colours. They follow light, dark and system themes. macOS keeps its traffic lights in the bar and its standard menu at the top of the screen.
- **Shortcuts:** edit shortcuts still work in text fields. Zoom (Ctrl/⌘ with =, - and 0) moved from the menu bar to the app and the STeP menu.
- **Duplicate buttons removed:** the duplicate task-list buttons in the sidebar and top bar are gone.

### Faster tool runs, clickable cards, questions above the composer

- **Faster runs on an OpenAI (Codex) account:**
  - Every tool turn of a run now continues on one `codex app-server` process and thread, sending only the new tool results (`ProviderSession`).
  - **Before:** each turn started a new process and thread, and resent the whole prompt with every earlier result.
  - The thread is closed when the run step ends. A changed or compacted prompt starts a fresh thread.
  - Usage is counted per turn from the thread total.
  - **Fallback:** if a turn on the open thread fails (the runtime dropped the thread or refused a second turn), the same turn is retried once on a fresh thread with the whole prompt. Keeping the thread is therefore never worse than not keeping it.
- **The assistant's browser sees clickable cards:** product cards and tiles that a page makes clickable with its own script are now click targets, alongside buttons and links.
  - These are elements with a pointer cursor; for nested ones only the outermost counts.
  - ARIA roles such as menuitem, tab and option are targets too.
  - Pages are laid out at 1280×900 before the Web tab reports where to draw them. At 0×0, every block was zero wide and looked invisible, so the coffee cards in the report could not be clicked.
- **A tool request in an unclosed fence runs:** a `step-tool` fence opened mid-sentence and never closed now runs. Before, it showed in the answer as raw JSON.
- **Questions and the plan sit above the composer**, under the newest message, instead of between older messages.
  - The question card answers with one click on an option, or its number key.
  - It takes another answer as free text.
  - It shows "ผู้ช่วยถาม" in the accent colour.
- **Plain status lines:** the status line names what a tool is doing ("รอคำตอบจากคุณ", "กำลังทำงานบนเว็บ") instead of the tool's ID.

### Native workflows: plan, execute, requirements, diagnose

- **Built into the harness:** the composer's mode picker now offers four ways of working under **ขั้นตอนทำงาน**, as Claude Code's plan mode is built in rather than loaded as a Skill:
  - วางแผนก่อนลงมือ (plan)
  - ลงมือทำตามแผน (execute)
  - เขียนเอกสารความต้องการ (requirements)
  - วิเคราะห์ปัญหา (diagnose)
- **Plan:** the assistant clarifies with up to 5 questions and breaks the work into tasks with checkpoints. The employee must approve the plan, in pilot mode too.
- **Execute:** works through the plan task by task with the new `plan_update` tool, and leaves approvals, signatures and submissions to people.
- **Plan card:** shows progress in the chat and has a "ลงมือทำตามแผน" button. Details: [Native workflows](docs/desktop-workflows.md).
- **Requirements:** interviews, then writes testable requirements.
- **Diagnose:** ranks hypotheses, tests them and names a root cause only with evidence.

### Security fixes from the audit, and live text while working

- **Reading a website asks once per site per task:** `web_fetch` reads a site only after the employee allows it, in every mode.
  - **Before:** a page or PDF with hidden instructions could make the AI read workspace files and send them to any address in a URL. No dialog appeared, because `web_fetch` counted as read-only and privacy checks were off.
- **Credentials are always masked:** passwords, tokens, API keys and signed URL parameters are masked even with privacy checks off. This covers messages, attachments, file reads and URLs.
  - A credential that cannot be fully masked is withheld.
  - A URL that carries one is never fetched.
- **The assistant's browser opens public sites only:** localhost, private IPs and names that resolve to them are blocked, both for pages it opens and for anything those pages load.
  - Intranet hosts can be listed in policy `network.privateHosts`.
- **"Send to chat" in the Web tab:** reads the page in an isolated world, so the page cannot fake the text, and gives up after 10 seconds.
- **Live text while working:** in chat, the text from every turn stays on screen while the assistant works, as in Claude, ChatGPT and Cursor. Before, each tool step cleared it.
  - Tool requests (`step-tool` fences and JSON) are hidden from the live text.
  - The AI's thinking shows open until the answer starts.
  - The status line sits under the text.

### Browser inside the main window

- Web pages now open in the **Web tab of the right panel** instead of a pop-up window, as in Claude and Codex. This covers pages the assistant opens with `browser_control` (MIS included) and pages the employee opens.
  - The tab strip marks the assistant's pages with an icon.
  - Back, forward, reload and close are in the bar.
  - A page the employee opens can be sent to the chat or handed to the assistant.
  - When the assistant opens a page, the panel switches to the Web tab.
- Each page is a sandboxed `WebContentsView` with its own session (`electron/browser-dock.ts`), drawn over the space the window reserves for it.
  - A dialog, notification, menu or tour card that overlaps that space hides the page and shows a still picture of it, so the page never covers an approval.
  - A dialog beside the panel leaves the page live, so it can be checked before approving.
- **Sign-in loop fixed:** after the employee signed in to MIS and said "เข้าสู่ระบบแล้ว", the assistant opened a new tab with no sign-in and asked to sign in again. The AI keeps no tab IDs between messages, so:
  - opening a site the task already has open now returns that tab with its sign-in, without asking again (`reused: true`);
  - all tabs of a task share one session.
- The "browser use failed" report on Windows (`INVALID_CONTEXT_PATH` when loading the `browser-form-assistant` Skill) is the path fix below.

### Scanned PDFs, opening documents on Windows, and the knowledge registry

- **Scanned PDFs:** a PDF with no text layer, or with some pages that are only pictures, now goes to the AI as page images when privacy checks are off (the default). Before, it was refused with "ไฟล์นี้ไม่มีตัวอักษรให้อ่าน" unless the local OCR component was installed.
  - pdf.js draws up to 20 pages in a hidden, sandboxed window that can load only pdf.js itself.
  - The chip reads "PDF สแกน · ส่งเป็นภาพ N หน้าให้ AI อ่าน". A longer scan asks to split the file.
  - The connected model must read images.
- **Opening documents and Skills on Windows:** fixed. The installer puts the app under a folder named `STeP Desktop`, the same name the sensitive-path patterns use for the app's own data folder. As a result, every `reference` and `skill` read failed: the AI saw only excerpts and reported that "the full document could not be opened". Those patterns now check only the part of the path inside the harness.
- **STeP knowledge registry:** scanned from the registered document files, like the Skill registry. The AI sees every readable document with:
  - its ID, title and owner;
  - its first line of purpose;
  - its section headings.
  When the matched excerpts do not hold the answer, the AI opens the right document, or one section of it, with `reference(input=ID, args.section=heading)`. It no longer reports the information as missing. `reference` also accepts a document's path or title.
- **Five more registered documents:** the administrator confirmed them as published for every employee (`sensitivity: public`):
  - `step-teams-directory` (`docs/knowledge/teams.md`)
  - `step-public-profile`
  - `project-code-scheme` (the owner of the table is still unconfirmed)
  - `step-context`
  - `step-ai-employee-guide` (`docs/employee-guide.md`)

  The HR Service Channels title now says "ติดต่อฝ่ายบุคคล", so HR contact questions still find it first.

### Desktop permission modes and answer feedback

- Closer to opencode and Claude Code:
  - **One everyday mode:** Chat is the everyday mode. The work-mode picker offers Chat and Image only. Chat answers can be opened in Output, and the AI can stage file changes. The separate drafting mode stays for tasks already in it and for multi-worker drafting.
  - **Web search:** with tools, the AI decides when to search the web. It calls `web_search` for public facts that change over time, and the results still appear as source links under the answer. The app no longer searches ahead or shows "Web Search อัตโนมัติ" while typing. The host search remains only for runs without tools.
  - **Full auto:** offered by default (`features.autoMode: true`, `auto` in the default modes). The default mode is still "ask before edits". In Full auto, terminal commands still ask unless the administrator turns on `shellByAi`.
- Work like a general AI harness (Claude Code, opencode), keeping STeP's knowledge and Skills:
  - **Skill registry:** the AI sees a registry of STeP Skills, one line each with name and description. It loads only the Skill a request needs with the `skill` tool, instead of the app choosing a Skill or reading them all. The status line names the Skill or document being read.
  - **Images:** images go to vision models by default (`features.vision: true`). With privacy checks off, an image is sent as it is, with no local OCR service needed.
  - **No dialogs at send:** with privacy checks off, the only question when sending is the one-time usage terms. Images, pasted sources and multi-worker runs no longer ask.
- Ask each employee to tick the **usage terms** once, instead of the app checking for them.
  - The terms appear on the last setup step. If setup was skipped, they appear at the first send, where the button reads "รับทราบและส่ง".
  - Starting or sending stays disabled until the box is ticked.
  - The terms cover:
    - data going to the AI provider unscanned;
    - not sending passwords, keys, ID or account numbers, health or salary data, or other people's personal data;
    - approvals and signing staying with people;
    - checking answers before use;
    - history staying on the computer.
  - The accepted version is saved. Changing `TERMS_VERSION` asks everyone again, so people who accepted the earlier text, which promised masking, see the new terms once.
- Turn off the organization checks by default (`checks: { "authority": false, "privacy": false }`).
  - **Authority:** requests about approving, signing on someone's behalf, issuing document numbers or submitting are answered as help instead of blocked. The AI cannot perform these acts.
  - **Privacy:** nothing is scanned or masked, and there is no dialog before data goes to the AI or a web service. This covers text, attachments, memories, tool results and web queries. National ID numbers, names, phone numbers, passwords and API keys are sent as typed.
  - Side-effect tools (file writes, commands, browser actions, MCP) still ask each time.
  - Administrators can turn either check back on in the policy file. See [organization checks](docs/desktop-policy.md#organization-checks-checks).
- Turn off the local Router's Skill selection in STeP Desktop by default (`features.autoRouting: false`).
  - Every message goes straight to the AI with the matching organization documents.
  - The app no longer asks "งานนี้ตรงกับข้อนี้ไหม" and never picks a Skill or Playbook by itself. Employees pick a Skill with `/` when they want one.
  - Authority checks (approving, signing on someone's behalf, issuing document numbers), Skill scope rules and the privacy gate still run on every message.
  - Administrators can turn automatic routing back on. The CLI is unchanged.
- Register the executive board as an organization document (`step-executive-board`, `docs/knowledge/step-executive-board.md`). It is built from the maintainer-confirmed `executiveOversight` in `manifest/organization.yaml` (checked 2026-09-20). "ผู้อำนวยการ STeP ชื่ออะไร", "ผอ.คือใคร", "รองผู้อำนวยการมีใครบ้าง" and "ทีม HD อยู่ภายใต้การกำกับของใคร" are now answered from it instead of a web search, which had returned a former director. A test keeps the document in step with `organization.yaml`.
- Stop the clarifying question from looping. Answering "ไม่ตรง" to "งานนี้ตรงกับข้อนี้ไหมครับ?" asked the same question again. A declined menu is never offered again. In chat, once the employee has answered a clarifying question without picking an option, the assistant helps from the conversation. Approving, submitting or signing still asks.
- Remove the routing notice under the text box while typing ("ต้องตอบคำถามแยกประเภทงานก่อน · ต้องตรวจ: …"). It looked like an error before anything was sent. The send itself still asks when it must. Only organizations that set prices see the cost estimate there.
- Fix answers that showed a raw tool request (`{"tool": "reference", ...}`) instead of the answer. Some models, such as Gemini Flash-Lite, put the request in a ```json fence instead of ```step-tool. A reply that is only one valid tool request (json fence, unlabelled fence or bare JSON) now runs the tool through the same checks, so the AI reads the document and answers. A JSON example inside a longer answer is never treated as a request.
- Stop asking "ใช้บริบทที่บันทึกไว้กับงานนี้?" on every message in standard consent. Saved preferences (`ASSISTANT.md`, `STEP.md`, `AGENTS.md`, output style) and confirmed memories are sent like custom instructions and memory in Claude and ChatGPT. They still pass the privacy check when loaded. Strict mode (`"pilot": false`) still asks, and now lists the file and memory names instead of raw JSON.

- Mac installer builds now open the `.dmg` and launch the packaged app (`test/packaged-launch-smoke.mjs`). The smoke checks that setup and IPC work and that the organization documents and Skills are bundled.
- Requests to work in **STeP MIS** now open the STeP Browser instead of being answered from memory or the web. The router treats them as general help instead of a clarifying menu. The AI is told to open `https://mis.step.cmu.ac.th/` (from `manifest/services.yaml`) with the browser tool. The employee signs in themselves, and every click or fill still asks. The AI never submits, approves or e-signs. Approving in MIS is still blocked.
- Keep the waiting spinner turning when the OS reduces motion, so a wait never looks frozen.
- Answer from STeP's own documents before the web or general knowledge.
  - **Before:** general questions carried no organization documents, and the AI was never told which document IDs existed. Documents kept as a summary index (HR welfare 2569, career path, HR service channels, facility inventory) could not be read by the `reference` tool, so even `hr-policy-lookup` answered without the welfare data.
  - **Now:** every chat and draft turn includes the best-matching document sections, the "context used" list names them, and the AI is told to cite them or say the documents do not cover the question. Restricted and missing documents are never read. See [organization knowledge first](docs/desktop-context-memory.md#organization-knowledge-first).
- Fix Gemini API key in Settings appearing stuck: "เชื่อมต่อ Gemini" saved the key without testing it, so the connection stayed "not tested" with no progress. It now tests the key right away and ends ready or with a clear error (for example a full quota). A new smoke (`gemini-api-smoke`) runs the bundled Gemini CLI against a local fake API.
- Lay out the Chat tab like Claude Desktop:
  - **Text box:** starts at one line and grows as you type.
  - **Bottom-left:** `+` (attach), then compact work-mode and permission pickers.
  - **Bottom-right:** AI and model pickers, then send.
  - **Under each answer:** icon buttons for copy, open in Output, 👍, 👎 and remember.
  - **Task commands:** duplicate, export, memory and scheduled jobs move into a ⌄ menu next to the task title.
- Offer four modes in the composer, as in Claude Code and ChatGPT:
  - **Ask before edits:** every edit and command asks first.
  - **Accept edits** (new, on by default): AI edits are applied right away, with a snapshot to undo them; commands still ask.
  - **Full auto:** an administrator must enable it.
  - **Plan:** read only.
- Add **Good / Needs fixing / Remember this** under each answer.
  - Ratings stay on this computer.
  - A "needs fixing" note becomes a feedback memory proposal that the person confirms.
  - "Remember this" saves an edited memory after a dialog.
  - Text with personal data or secrets is never remembered.

### Desktop standard consent (formerly pilot mode)

- Make fewer confirmation dialogs the default after the pilot trial; administrators can set `"pilot": false` for strict mode. Standard mode cuts routine dialogs: plain text attachments, sensitive words with no person identifier (now a warning), plan approval, and per-source tool-result consent (one answer per run). The first-send dialog becomes a one-time acknowledgment in the setup wizard.
- Keep the floors in both modes: credentials and sensitive data tied to a person are blocked, national ID numbers are masked, images and multi-worker runs still ask, and file writes, commands and browser actions still ask through ToolGate. See [pilot mode](docs/desktop-policy.md#pilot-mode).
- Follow Claude and ChatGPT for remembered approvals: only a reviewed file write can be remembered, for the same file in the same workspace. Commands, the sandbox and MCP calls ask every time, and older remembered rules for them are ignored. Administrators can turn remembering off with `permission.rememberApprovals: false`.
- Count consent prompts, confirmations and cancellations per task on this computer (counts and tool names only) and show them in Settings → Organization policy.
- Stop a follow-up message when its route check fails instead of sending it without the authority check.

### Desktop English UI, new welcome and team starters

- Add a Thai/English switch on the first setup step and in Settings → Appearance & language. Thai stays the source text; English comes from `desktop/src/locales/en.ts`, and a unit test fails when wrapped Thai text has no English entry. Main-process dialogs, statuses and connection notes follow the same setting; prompts sent to the AI are unchanged. See [desktop i18n](docs/desktop-i18n.md).
- Rewrite the chat welcome around "AI drafts, you decide" with three trust points, and show three first tasks for each of the 21 STeP teams (general ones when no team is set), each checked against the router.
- Offer **Gemini · API key** on the main connection page (setup wizard and Settings) with a link to Google AI Studio, instead of only under admin settings.
- Rename the conversation toolbar's scheduled-jobs button to "งานตามรอบ", polish the workbench tabs, composer and consent labels, and fix Prettier drift that failed desktop CI.

### Experimental Gemini via Antigravity

- Add a separate personal Google connection, native NDJSON adapter, Gemini-only catalog and per-invocation configuration isolation. Preserve existing Gemini API and organization CLI routes.
- Withhold user prompts until native policy/tool preflight passes; validate completion, usage, cancellation and shutdown. Official Windows CLI 1.2.14 still declares broad tools, so generation is blocked before prompt transmission. OAuth acceptance remains open; see [adapter status](docs/antigravity-adapter.md).
- Wait for ChatGPT OAuth cancellation acknowledgement on browser-launch failure and reject late login callbacks; repair the race exposed by Linux CI.

### Desktop ChatGPT and Gemini connection follow-up

- Cancel pending ChatGPT OAuth attempts on synchronous or asynchronous browser failure and preserve a typed browser error. Reject malformed login links, user information, non-default ports and fragments before browser launch.
- Record successful local ChatGPT account refresh and one bounded live generation. Retain Gemini's consumer-account restriction after verifying Google's explicit deprecation notice; protocol initialization is recorded separately from live account acceptance. See [connection evidence](docs/chatgpt-gemini-oauth-followup.md).

### Desktop Claude Code OAuth follow-up

- Open a complete, validated official Claude authorization URL when piped CLI login does not launch the browser; cancel on browser failure and keep URLs/codes out of progress and diagnostics.
- Preserve Golden post-generation error codes and label blocked runs as not graded. Keep the shared output Privacy Gate unchanged.
- Record successful authorized account generation and 5/5 live/local feature groups. Formal Golden acceptance remains 0/3 pending output privacy review; separate offline content checks passed 14/14. See [OAuth follow-up](docs/claude-oauth-followup.md). No in-app subscription enablement, main merge or release is included.

### Desktop OpenHarness adaptation — Phase 6

- Add opt-in, in-memory transmission scopes for clean reads with source/account/model/policy binding, parallel confirmation coalescing, time/volume limits, visible allowance and revoke-and-stop. Preserve full-source privacy scans, separate destination/effect approvals and fresh review for masking or higher risk.
- Add synthetic/live feature-matrix evaluation for memory/follow-ups/attachments, compaction, gated tools/hooks, checkpoint resume and coordinator; label local/hybrid evidence separately. Share explicit live approval and named API/Claude subscription auth with Golden evaluation.
- Resolve native npm Claude Code launchers as well as legacy script entries. Keep the existing runtime/profile version gate and avoid upgrading personal runtimes.
- Document local validation and the user-authorized Claude OAuth attempt that failed generation and subsequently required login. No live acceptance, main merge or release is claimed.

### Desktop OpenHarness adaptation — Phase 5

- Add administrator-approved compatible/Ollama and Anthropic streaming profiles, safeStorage keys and managed Copilot device authorization through the pinned official SDK with native tools/config discovery disabled.
- Share governed draft preflight/runner across CLI, Golden evaluation and LINE; add text/json/stream-json output, explicitly named environment keys, conservative usage reservations and dry-run/composer readiness estimates.
- Consolidate the command palette/keyboard registry, configurable bindings and opt-in composer Vim; add on-demand checksum-verified local voice with temporary microphone approval and transcript privacy review.
- Add inert, validated Skill Pack import/list/enable/export, digest approvals, separately enabled host hooks/agent templates and ordinary source/destination consent.
- Add the organization-server LINE draft gateway with exact signed webhooks, allowlisted employee mapping, private sessions, attachment review, clarification state, outbound routing/privacy and explicit operator delivery approval.
- Validate with synthetic provider/OAuth/voice/LINE fixtures and real local Electron IPC. No paid/live account evaluation, LINE delivery, main merge, installer or release is included.


### Desktop OpenHarness adaptation — Phase 4

- Add bounded coordinator sessions, declared Playbook dependencies, a shared three-run provider limit and reviewed final merge proposals.
- Add app-open cron CRUD, serialized background drafts, context binding, restart recovery, history and status-only notifications.
- Add managed stdio/HTTP MCP with separate destination consent, bounded discovery/search, no uncertain-call retry and host tool governance.
- Add a Docker backend with digest-pinned preinstalled images, no network and explicitly selected privacy-checked read-only snapshots.
- Add read-only GitHub autopilot inspection and gated worktree coding via host-validated JSON proposals, isolated validation profiles, reviewed PR publication and exact-head human-gated merge.
- Cover the local flows with synthetic tests and real Electron UI/IPC; live providers, Docker engines, organization servers, remote autopilot writes and release acceptance remain pending.

### Desktop OpenHarness adaptation — Phase 3

- Add script-aware context estimates, older-source previews, bounded summaries, prompt-overflow retry and compact hooks while retaining host task state.
- Add privacy-checked, user-confirmed scoped memory, evidence-bound local Autodream suggestions and `/memory` editing with output styles.
- Load bounded workspace instructions and assistant preferences under existing routing/governance with explicit context transmission consent.
- Add local SQLite full-text search, independent session forks, resume without replay and scanned Markdown/JSON conversation exports.
- Connect OCR to image/scanned-PDF attachments and gate transient original-image input by managed policy, complete OCR, privacy and explicit review.
- Cover Phase 3 with synthetic unit/real Electron IPC/UI checks; live accounts, OCR accuracy, visual quality, packaged installs and production acceptance remain pending.

### Desktop OpenHarness adaptation — Phase 2

- Add a bounded Chat/Draft host tool loop with parallel reads, hooks, separate result consent and paged output.
- Add routed Skills, registered references, document sections, reviewed XLSX edits, Chat questions, plan approval and exact-byte local backups.
- Guard public retrieval with DNS/IP pinning, redirects and an optional trusted organization proxy.
- Add three-retry exponential backoff with jitter/retry-after, reported token/cost estimates, budget warnings and `/usage`.
- Cover the complete loop through synthetic Electron/preload/IPC; live providers and later phases remain unverified.

### Desktop OpenHarness adaptation — Phase 1

- Add administrator-owned managed policy with safe defaults, strict validation and hot reload.
- Apply credential/path/command/mode checks and metadata-only command, HTTP and prompt hooks to Workbench tools.
- Add a shared approval dialog, exact-workspace remembered grants, revocation and ask/plan/admin-enabled auto mode controls.
- Cover governance with synthetic unit tests and an Electron smoke test through the real preload bridge.
- Track the remaining OpenHarness adaptation phases in `docs/openharness-parity.md`.

STeP Desktop และ Workspace ทำงานใกล้เคียงโปรแกรม AI ชั้นนำมากขึ้น โดยยังคงด่านอำนาจและ Privacy เดิม

- **คำสั่งต่อเนื่องแบบที่คนพิมพ์จริงไม่หลุดเป็นงานใหม่** เช่น "ขอแบบสั้นกว่านี้", "ทำเป็นภาษาอังกฤษด้วย", "ช่วยทำต่อให้หน่อย", "โอเค แก้หัวข้อ 2 เป็นตาราง" แก้ร่างเดิมต่อ ส่วนคำขอที่พาไปงานอื่นหรือแนบเอกสารใหม่ยังเริ่มงานใหม่ คำถามที่ชี้ส่วนของร่าง ("หัวข้อ 2 หมายถึงอะไร") เห็นร่างประกอบ
- **คำขอแก้ร่างผ่านด่านอำนาจของตัวเอง** เดิมการแก้ร่างใช้เส้นทางของคำขอแรก ข้อความอย่าง "เพิ่มลายเซ็นอนุมัติ… แล้วอนุมัติงบเลย" จึงไม่ถูกตรวจ ตอนนี้หยุดก่อนถึงโมเดลและไม่ถูกนำไปรวมกับคำขอแก้ครั้งถัดไป
- **แยกกฎออกจากข้อมูล** กฎการร่างและ Skill ส่งเป็น system instructions ของแต่ละ runtime (Claude `systemPrompt`, Codex `developerInstructions`, Gemini `GEMINI_SYSTEM_MD`) เอกสารแนบ บทสนทนา และร่างอยู่ในส่วนที่มีป้ายกำกับ และเปิดหรือปิดส่วนอื่นเองไม่ได้
- **ลองใหม่และทำต่อได้** บริการ AI ที่ไม่ว่าง เครือข่ายหลุด หรือ runtime ปิดตัว จะถูกลองใหม่อัตโนมัติ 2 ครั้ง โควตาเต็มไม่ถูกลองซ้ำ Playbook ที่หยุดกลางทางเก็บผลขั้นที่เสร็จแล้ว ปุ่ม "ลองอีกครั้ง" ทำต่อจากขั้นที่หยุด
- **ทำงานหลาย Workspace พร้อมกันได้สูงสุด 3 งาน** แต่ละ Workspace ยังทำทีละงาน บันทึกการทำงานแต่ละครั้ง (ขนาด prompt, เอกสารอ้างอิง, จำนวนครั้งที่ลอง, เวลา, token) ลง diagnostics โดยไม่มีเนื้อหาคำขอหรือเอกสาร
- **Claude Console OAuth ติดตั้ง `ant` CLI ให้เอง** Anthropic ไม่มีตัวติดตั้งสำหรับ Windows STeP Desktop จึงดาวน์โหลด release ทางการ v1.36.0 ตรวจ SHA-256 และตรวจว่าเป็น `ant` ที่รองรับ OAuth ก่อนติดตั้งในพื้นที่ของผู้ใช้ เมื่อกดเชื่อมต่อหรือกดปุ่มติดตั้ง
- **Gemini บัญชีส่วนตัว** Google หยุดให้บริการ Gemini CLI กับบัญชี Google ส่วนตัวและ Google AI Pro/Ultra ตั้งแต่ 18 มิ.ย. 2569 แอปอธิบายสาเหตุนี้แทนข้อความผิดพลาดทั่วไป ค่าเริ่มต้นของ Gemini เป็น API key และการลงชื่อเข้าใช้ต้องมี Google Cloud Project ของบัญชี Code Assist Standard/Enterprise
- **Claude Code บังคับ Routing Gate ด้วย hook** ตัวติดตั้งเพิ่ม UserPromptSubmit hook ใน `.claude/settings.json` ที่รัน `step-ai hook user-prompt-submit` บนเครื่องและส่ง routing contract ให้โมเดลทุกคำขอ พร้อม allowlist เฉพาะ `step-ai ask`/`output` โดยคงการตั้งค่าเดิมของผู้ใช้
- **ชุดประเมินคุณภาพคำตอบ** `npm run eval:golden` ใน `desktop/` รันงานสมมติ TOR-SYN-01, MIN-SYN-01 และ QMS-SYN-01 ผ่านโมเดลจริง ตรวจ critical gates ตาม rubric และเก็บร่างไว้ให้คนอ่านใน `desktop/eval-results/`

- เพิ่ม `entrepreneur-annual-goal` (PITI, draft) สำหรับโค้ชผู้ประกอบการตั้งเป้ารายได้ 1 ปีจากฐานจริง ย้อนสินค้า ลูกค้า funnel กำลังผลิต วัตถุดิบ คน และเงินทุนก่อนทำแผนรายเดือน; แยก Actual/Benchmark/Assumption ขอเจ้าของยืนยันก่อนกระจายยอด และไม่แจกยอดติดลบเมื่อทำได้เกินเป้า
- เพิ่มขอบเขต `entrepreneur-commitment` ให้คำสั่งเลือกเป้า อนุมัติลงทุน จ้างคน หรือสั่งซื้อแทนเจ้าของกิจการต้องหยุดที่มนุษย์ โดยไม่อ้างอำนาจอนุมัติงบของ STeP กับกิจการภายนอก; คำถามคำนวณกำลังคนและร่างคำขอช่วยได้เมื่อ AI host ที่เปิดใช้แบบ opt-in จำแนกเป็นงานวิเคราะห์
- คำขอกิจการที่อาจผูกมัดและยังแยกเจตนาไม่ออกจะ `ESCALATE` ให้คนตรวจโดยค่าเริ่มต้น; AI host ที่รับข้อความอยู่แล้วส่งผลจำแนกใน schema กลับมาเพื่อตรวจเส้นทางซ้ำได้โดยไม่เรียก API เพิ่ม ผลจำแนกไม่ใช่การอนุมัติใช้เงินจริง และ Privacy Gate ที่ต้องให้คนยืนยันห้ามส่งต่อให้ตัวจำแนก
- ผลจำแนกปลดได้เฉพาะด่านงบที่ทับกับเรื่องของเจ้าของกิจการ: คำขอที่อ้าง STeP อุทยานฯ โครงการบ่มเพาะหรือผู้มีอำนาจขององค์กรยังหยุดที่คน และ authority อื่นในคำขอเดียวกัน (เช่น ลงนามแทน ผอ.) ยังชนะ; การอนุมัติสตาร์ทอัพหรือผู้ประกอบการเข้ารับทุน/บ่มเพาะยังเป็นของผู้อำนวยการโครงการ; คำสั่งให้ทำแทนเจ้าของ ("จ้างพนักงานเลย", "สั่งซื้อวัตถุดิบให้เลย", "…แทนผม") หยุดให้คนตรวจแม้ไม่ได้พูดถึงเป้ารายปี
- ผลจำแนกปลดด่านงบได้เฉพาะเมื่อคำขอบอกว่าเป็นเงินของกิจการผู้ใช้ ("วงเงินโฆษณาของบริษัทผม"); การเรียก STeP หรือ มช. แบบอ้อม (CMU, ม.เชียงใหม่, `S T e P`, ตัวอักษรเต็มความกว้าง) หรือไม่บอกเจ้าของเงิน ("อนุมัติวงเงินให้ทีมขายเลย") ยังหยุดที่ `afp-finance-head`; คำทั่วไปอย่าง `step by step`, `ทีมช่วย`, `สตาร์ทอัพของผม` ไม่ถูกนับเป็นองค์กรอีก; ถ้าไม่มีผลจำแนกจาก host คำขอเรื่องการจ้าง ลงทุน ซื้อ หรือกู้ต้องรอคนตรวจเสมอ ไม่มีทางลัดที่เดาจากคำว่าเป็นแค่คำถาม; ชื่อองค์กรที่ปลอมด้วยตัวอักษรต่างภาษา สัญลักษณ์คั่น หรือ leet ถือว่าอ้างองค์กร; "ของเรา" หรือเงินที่ "ได้จาก…" ไม่นับเป็นเงินของกิจการ; "อนุมัติ…เลยครับ" ที่มีคำลงท้ายสุภาพยังถูกบล็อก และ "อนุมัติยกเว้น…" ไปที่ `policy-waiver`; คำสั่ง "อนุมัติ…ให้เลย" ที่ไม่ระบุว่าเป็นเรื่องของกิจการผู้ใช้หยุดที่ `project-director`
- ผลจำแนก `ADVISORY` ไม่ปลดด่านงบอีกต่อไป: คำขอที่เข้า `budget-allocation` หยุดที่ `afp-finance-head` เสมอแม้เป็นเงินของบริษัทผู้ใช้; หลัง ADVISORY คำขอที่เอ่ยถึงโครงการ grant ทุน รางวัล ผอ. มช. หรือหน่วยงานรัฐยังต้องให้คนตรวจ; ชื่อที่พรางด้วยตัวคล้าย ช่องว่าง สัญลักษณ์ entity หรือกลับด้านถูกจับด้วย skeleton ส่วน café/อีโมจิ/ZWSP ที่ติดจากการคัดลอกไม่ทำให้ติดด่าน; คำสั่งอนุมัติตรวจจากกรรม/ความเร่งด่วนแทนคำลงท้าย; เพิ่มคำสั่งของเจ้าของ (ชำระ สินเชื่อ เช่า ปิดดีล ขึ้นเงินเดือน, hire/pay/buy for my company)
- ปิดช่องจากการตรวจความปลอดภัยรอบ 5: คำขอรับรองผล/อนุมัติทีมเข้าโครงการที่แทรกหลังแผนรายได้ยังคงหยุดที่ `project-director` แม้ Skill วางเป้ารายปีได้คะแนนสูงกว่าและไม่ต้องรอผลจำแนก host; ชื่อมหาวิทยาลัยรูป `ม.ช.` และ `ม ช` ยังคงส่งตรวจเจ้าของเงินหลังผล `ADVISORY` โดยคำถามวิเคราะห์และร่างเสนอผู้มีอำนาจไม่ถูกบล็อกผิด
- ข้อจำกัด: CLI ตรวจการ opt-in ของ host ไม่ได้ และ `queryHash` ไม่ได้ยืนยันตัวตนผู้จำแนก ด่านนี้ลดความผิดพลาดของ AI ไม่ได้กันผู้ใช้ที่ตั้งใจหลบ; ดู docs/architecture.md หัวข้อ Entrepreneur intent review

ปิดช่องที่พนักงานเลี่ยงด่านอนุมัติได้ด้วยการเปลี่ยนสำนวน (ข้อ H1–H4 และ M5 จาก audit วันที่ 27 กันยายน 2569)

- **ด่านอนุมัติจับการกระทำเดียวกันที่เขียนต่างกันได้** นอกจากวลีตรงตัว `manifest/authority.yaml` ระบุกลุ่มคำกริยาและกรรมของแต่ละอำนาจ คำขอที่มีทั้งสองกลุ่มอยู่ใกล้กันจะถูกบล็อก เช่น "เคาะงบให้ทีมเราหน่อย" หรือ "Pick the winning vendor" คำภาษาอังกฤษต้องตรงทั้งคำ "design" จึงไม่ถูกนับว่าเป็น "sign"
- **คำปฏิเสธไม่ซ่อนคำขอหลักแล้ว** "ไม่ต้องรอผู้อำนวยการ ลงนามหนังสือนี้ได้เลย" ถูกบล็อก ส่วน "ยังไม่ต้องกด Submit นะ แค่กรอกฟอร์มไว้ก่อน" ยังทำได้
- **อำนาจใหม่ 2 รายการ** `lab-result-release` ส่งการออกผลทดสอบให้ผู้มีอำนาจลงนามของห้องปฏิบัติการ แทนผู้ลงนามหนังสือ และ `external-submission` ขอให้ผู้ใช้ยืนยันก่อนส่งฟอร์มหรืออีเมลในนามผู้ใช้ แม้คำขอไม่ตรงกับ Skill ใด
- **สิ่งที่ผู้ใช้บอกว่าไม่ต้องทำไม่ถูกเลือกเป็น Skill** "ไม่ต้องทำ TOR นะ แค่ช่วยสรุปประชุม" ไม่ถูกส่งไป Skill เขียน TOR อีก
- **Skill ด้าน ISO 7 ตัวอ้างอำนาจ `iso-enactment` ถูกชื่อ** เดิมอ้าง `iso-qms-enactment` ซึ่งไม่มีอยู่ เทสต์ตรวจว่าทุกรหัสอำนาจที่ Skill และ router อ้างมีอยู่จริง

- Privacy Gate ตรวจรูปแบบข้อมูลส่วนบุคคลภาษาไทยที่เคยหลุด: เลขบัตรที่ใช้เลขไทยหรือเลขเต็มความกว้างและคั่นด้วยจุด/อักขระมองไม่เห็น, เบอร์โทรแบบ `08-1234-5678` หรือคั่นด้วยจุด และอีเมลที่ใช้ `＠` แทน `@`
- ปิดบังช่วงข้อความในต้นฉบับโดยคงข้อความรอบข้างไว้ หากสำเนาที่ปิดบังแล้วยังพบรูปแบบที่เฝ้าระวัง จะระงับสำเนาและส่งให้คนตรวจ ไม่เขียนไฟล์ `.redacted.txt` ที่ไม่ปลอดภัย การตรวจนี้ยังเป็นเพียง pattern scan ไม่ใช่การอนุญาตให้ส่งข้อมูลไป AI ภายนอก
- CLI แสดงคำสั่งแนะนำโดยใช้คำขอที่ปิดบังแล้วทั้งเส้นทาง Skill และ Playbook ไม่แสดงเบอร์โทรต้นฉบับซ้ำ; ที่อยู่ซึ่งปิดบังแล้วไม่ถูกตรวจพบซ้ำจาก placeholder และเลขทศนิยมธรรมดาไม่ถูกตีความเป็นเลขบัตรแบบคั่นจุด
- เพิ่มเทสต์สำหรับกรณีดังกล่าวและข้อความทั่วไปที่ต้องไม่ถูกบล็อกผิด

กัน manifest ที่ระบบอ่านไม่ครบโดยไม่แจ้ง (ข้อ H5 จาก audit)

- **Manifest ที่เขียนรูปแบบที่ระบบอ่านไม่ได้จะไม่ผ่าน validate (H5):** ตัวอ่าน manifest ของ Harness อ่าน YAML ได้เฉพาะบางรูปแบบ เดิมถ้าใครแก้ `consumers: ["*"]` เป็นรายการแบบหลายบรรทัด Skill นั้นจะหายจาก workspace ของทุกทีมโดยไม่มีข้อความเตือน แต่ validate และ test ยังผ่าน ตอนนี้ `npm run validate` ตรวจแบบ allowlist: ทุกบรรทัดใน `manifest/*.yaml` ต้องเป็นคอมเมนต์ทั้งบรรทัด, `key:`, `key: value`, `- key: value` หรือ `- item` เท่านั้น เยื้องเพิ่มทีละ 2 ช่อง ไม่มี tab และ key ไม่ใส่เครื่องหมายคำพูด ช่องที่ระบบอ่านเป็นรายการ (เช่น `consumers`, `primary`, `triggers`, `actions`, `objects`, `preferredTools`, `consumes`, `produces` และทุกช่องใต้ `signals:`) ต้องเขียน `[a, b]` ในบรรทัดเดียว; ห้ามใช้ tag/anchor/alias (`!`, `&`, `*`) และ `{...}` ยกเว้นรูปแบบที่มีอยู่แล้ว; ใช้ `>-` ได้เฉพาะ `summary` ใน `documents.yaml`; รายการใน `[...]` ห้ามมี `,` ในเครื่องหมายคำพูด; รายการแรกของแต่ละ entry ต้องเป็น `- name:` (router) หรือ `- id:` (teams, roles, playbooks, steps, provenance) ไม่เช่นนั้น entry นั้นถูกทิ้ง ทุกข้อผิดพลาดแจ้งเป็น file:line และมีเทสต์เทียบจำนวน entry ในไฟล์กับที่ตัวอ่าน JS โหลดได้จริง
- ปิดช่องหลุดเพิ่มเติมของ H5: ตรวจ lone `CR` จาก bytes ของ manifest ก่อน Python แปลง newline เพื่อไม่ให้ authority trigger หายจากตัวอ่าน JS; ปฏิเสธ identifier ของ authority ที่ JS อ่านไม่ได้ (เช่นมี `_`) ก่อนนำค่าไปทับ authority ก่อนหน้า; และถอด apostrophe ที่ escape แบบ YAML (`''`) ในค่า single-quoted ให้ trigger และคำอธิบายตรงกับความหมาย YAML ทั้งใน authority และฟิลด์รายการของ router (`intent`, `triggers`, `paths`, `fileTypes`, `primary`)

## v0.7.6

เสริมวิธีทำงานที่คัดจาก [claude-code-templates](https://github.com/davila7/claude-code-templates) ให้ Skill เดิม 4 ตัว ไม่เพิ่ม Skill ใหม่ และไม่ติดตั้งชุดนั้นทั้งหมด ที่มาและ license อยู่ใน [third-party-methods.md](docs/third-party-methods.md)

### Skill ที่ปรับ

- **`tor-review` ตรวจสิ่งที่ TOR ไม่ได้เขียน** (จาก `devil`, MIT) เช่น ส่งงานไม่ผ่านการตรวจรับแล้วแก้ได้กี่รอบ STeP ต้องจัดอะไรให้ผู้รับจ้าง และไฟล์ต้นฉบับเป็นของใคร ทุกข้อเขียนเป็นสถานการณ์ ค้นใน TOR ซ้ำก่อนถามเพื่อไม่ถามสิ่งที่ตอบไว้แล้ว ไม่นับส่วนที่ TOR ตัดออกเป็นช่องว่าง และปิดท้ายด้วยคำถามส่งต่อที่คัดลอกไปส่ง AFP หรือเจ้าของเรื่องได้ทันที
- **`ncr-capa` จัดลำดับสาเหตุด้วย Pareto** (จาก `root-cause-pareto`, MIT) เมื่อมี NC หรือข้อร้องเรียนหลายรายการ เลือกหน่วยนับตามผลกระทบ จัดหมวดก่อนนับ ตรวจว่าอันดับคงที่ข้ามสองช่วง แล้วตั้งตัวเลขที่ต้องขยับและวันวัดซ้ำ
- **`quality-objective-kpi-review` ทำรายงาน KPI ประจำรอบ** (จาก `weekly-ops-report`, MIT) เทียบกับค่าเฉลี่ยหลายรอบ รายงานเฉพาะที่เกินเกณฑ์ไม่เกิน 5 ข้อพร้อมส่วนที่เป็นต้นเหตุ แยกตัวเลขจากความเห็น และมีหมายเหตุคุณภาพข้อมูล
- **`step-writing` ตัดสำนวนที่ฟังออกว่า AI เขียน** (หมวดจาก `avoid-ai-writing`, MIT) รายการภาษาไทยเขียนใหม่ทั้งหมดใน `references/thai-ai-writing-patterns.md` และไม่แตะรูปแบบหนังสือราชการ

### Routing

- "วิเคราะห์ Pareto ของ NC", "จัดลำดับสาเหตุทำ CAPA" ไปถึง `ncr-capa` · "ทำรายงานผล KPI ประจำเดือน" ไปถึง `quality-objective-kpi-review` · "รายงานผลการดำเนินงานโครงการส่งผู้บริหาร" ไปถึง `executive-status-update` · "ประเมินความเสี่ยงของกระบวนการ" ไปถึง `qms-risk-opportunity-review` ก่อนหน้านี้คำขอเหล่านี้ถูกถามกลับหรือตอบแบบงานทั่วไป
- เพิ่มคำบอกเจตนา "วิเคราะห์", "จัดลำดับ" และ "รายงานผล"

### คุณภาพ Skill

- `tor-review`, `ncr-capa` และ `quality-objective-kpi-review` มี eval ครบ 4 มิติและตัวอย่างคำตอบที่ดี รายการหนี้ `legacyWithoutEvals` ลดจาก 43 เหลือ 40

### ใช้ได้ด้วยบัญชี AI ฟรี

- **VS Code + GitHub Copilot** ได้ไฟล์คำสั่ง `.github/copilot-instructions.md` เนื้อหาเดียวกับ `AGENTS.md` ก่อนหน้านี้ต้องพึ่งการอ่าน `AGENTS.md` อย่างเดียว
- **อนุญาตคำสั่ง step-ai ล่วงหน้า** เฉพาะ `step-ai ask` และ `step-ai output` ใน Gemini CLI (`.gemini/settings.json` → `tools.allowed`) และ VS Code (`.vscode/settings.json` → `chat.tools.terminal.autoApprove`) ตามเอกสารของแต่ละโปรแกรม คำสั่งอื่นยังถามเหมือนเดิม ถ้ามีไฟล์ตั้งค่าอยู่แล้ว ตัวติดตั้งเพิ่มเฉพาะรายการนี้ ไม่แก้ค่าที่ผู้ใช้ตั้งเอง และไม่แตะไฟล์ที่มี comment · OpenCode รันคำสั่งได้เองอยู่แล้ว · Cursor และ Antigravity เก็บการอนุญาตไว้นอกโฟลเดอร์ จึงให้กดอนุญาตครั้งแรก
- Gemini CLI / Antigravity และ VS Code + Copilot ถูกจัดเป็นกลุ่มใช้ฟรีได้ ป้าย "Paid" หายจากไฟล์คำสั่ง · `doctor --employee` ตอนไม่พบโปรแกรม AI แสดง 4 ทางเลือกเท่ากัน และตรวจพบ Gemini CLI ได้
- คู่มือใหม่ [ติดตั้งโปรแกรม AI](docs/ai-app-setup.md) ทีละขั้นสำหรับทั้ง 4 โปรแกรม · runbook เพิ่มชุดตรวจบนเครื่องจริงด้วยบัญชีฟรี

### คู่มือ

- คู่มือพนักงานมีหัวข้อ **เลือกโปรแกรม AI (รุ่นฟรีก็ใช้ได้)** องค์กรไม่ได้จัดบัญชี AI ให้ พนักงานใช้บัญชีของตัวเองได้ โปรแกรมรุ่นฟรีที่เปิดโฟลเดอร์ได้ (Cursor, OpenCode, Gemini CLI/Antigravity, VS Code + Copilot) ใช้ขั้นตอนของ STeP AI ได้ครบเท่ารุ่นเสียเงิน แชทบนเว็บใช้ไม่ได้เพราะเปิดโฟลเดอร์ไม่ได้ และระบุข้อมูลที่ห้ามแนบเมื่อใช้บัญชีส่วนตัว

### อัปเกรด

ผู้ทดสอบที่ใช้ v0.7.3 อัปเดตตรงไป v0.7.6 ได้ในครั้งเดียว ขั้นตอนเดียวกับ v0.7.5 ใน [คู่มือรอบ Pilot](docs/pilot-runbook.md)

## v0.7.5

**สถานะ:** มี GitHub Release อัตโนมัติเมื่อ merge ต้องผ่าน Release Gate ก่อนแจ้งผู้ทดสอบ · ผู้ทดสอบที่ใช้ v0.7.3 อัปเดตตรงมาที่รุ่นนี้ได้ ไม่ต้องผ่าน v0.7.4

รุ่นนี้แก้เรื่องที่กระทบความประทับใจครั้งแรก จากการลองคำถามวันแรกแบบภาษาพูด 40 ข้อ (จำลอง ยังไม่ใช่คำถามจริงของพนักงาน) ก่อนแก้ 32 ข้อถูกถามกลับก่อนช่วย และมีแค่ 8 ข้อที่ระบบรู้ทันทีว่าต้องใช้ขั้นตอนไหน หลังแก้ 15 ข้อไปถึงขั้นตอนที่ตรง 23 ข้อได้ความช่วยเหลือทันที และเหลือ 2 ข้อที่ยังต้องถาม คือ "ช่วยหน่อย" ซึ่งไม่บอกงาน และ "อนุมัติให้หน่อย" ซึ่งเป็นเรื่องอำนาจอนุมัติ

| รายการ | v0.7.4 | v0.7.5 |
| --- | ---: | ---: |
| Skills / เส้นทาง Router | 49 / 48 | 50 / 49 |
| Routing regression | 81 เคส | 95 เคส |
| Skill ที่มี eval ครบ 4 มิติ | 0 | 6 |

### AI เรียกตัวเลือกวิธีทำงานได้บนเครื่องพนักงาน

- เพิ่ม `step-ai` (macOS/Linux) และ `step-ai.cmd` (Windows) ในโฟลเดอร์ชุดติดตั้ง ตัวติดตั้งวาง Node.js ไว้ใน `.step-ai/runtime/` และไม่ได้เพิ่มลง PATH คำสั่ง `step-ai` เปล่า ๆ จึงล้มบนเครื่องที่ไม่มี Node.js ติดตั้งไว้เอง ทำให้ทุกงานไม่ผ่านขั้นตอนขององค์กร ตัวเรียกใหม่ใช้ runtime ของชุดนี้ก่อน แล้วจึงลอง Node.js ในเครื่อง
- คำสั่งให้ AI ระบุวิธีเรียกทั้งสามแบบ และถ้ายังเรียกไม่ได้ ให้บอกผู้ใช้ด้วยภาษาคน ไม่ใช้คำว่า Router/Skill/contract
- `step-ai doctor --employee` ตรวจว่ามีตัวเรียกคำสั่งจริง แทนการขึ้น "Ready" ทุกครั้ง

### ช่วยทันทีเมื่อเป็นงานทั่วไป (โหมด GENERAL)

- งานที่บอกมาชัดแต่ไม่มีขั้นตอนเฉพาะของ STeP เช่น แปล เขียนอีเมล ทำ Excel เขียนโค้ด หรือระดมไอเดีย ได้รับความช่วยเหลือทันที ก่อนหน้านี้ "ช่วยแปลเป็นภาษาอังกฤษ" ถูกถามกลับ 3 รอบแล้วขึ้นเมนูที่ไม่เกี่ยวกับงาน
- ในโหมดนี้ยังโหลดกฎ Human Approval และ Data Classification เสมอ และห้ามอ้างว่าเป็นระเบียบหรือแบบฟอร์มของ STeP ถ้าไม่มีเอกสารอ้างอิง
- ยังถามกลับเหมือนเดิมเมื่อคำขอไม่บอกงาน ("ช่วยดูเอกสารนี้หน่อย"), ถามเรื่องเอกสารที่ต้องแนบ, เป็นการอนุมัติหรือส่งแบบฟอร์ม เอ่ยถึงทีม/ระเบียบ/แบบฟอร์ม/ระบบของ STeP หรือถามเรื่องเบิก สวัสดิการ เงินเดือน และสิทธิ์ ซึ่งต้องตอบจากเอกสารขององค์กร และ Authority BLOCK ยังมาก่อนทุกกรณี

### ร่างหนังสือที่มีผู้ลงนามไม่ถูกห้ามอีก

- ก่อนหน้านี้คำขออย่าง "ร่างหนังสือ… ผู้ลงนามยังรอยืนยัน", "เว้นช่องลงนามไว้" หรือ "ร่างบันทึกเสนอผู้อำนวยการลงนาม" ถูก BLOCK เพราะการตรวจอำนาจจับทุกคำขอที่มีคำว่า "ลงนาม" ทั้งที่ผู้ใช้ขอแค่ร่าง ตอนนี้แยกการ**พูดถึง**ผู้ลงนามออกจากการ**ขอให้ลงนาม** ตามคำอธิบายของกฎ official-signing ที่ห้าม "การลงนามหรือออกเลขหนังสือจริง"
- ตำแหน่งผู้ลงนามพิมพ์ได้ทั้งชื่อเต็มและชื่อย่อ เช่น ผู้อำนวยการ / ผอ. / รอง ผอ. / ผช.ผอ. / ผู้จัดการ / ผจก. / หัวหน้าทีม / หน.ทีม / ประธานกรรมการ และชื่อตำแหน่งที่มีส่วนต่อท้าย เช่น "ผู้อำนวยการอุทยานวิทยาศาสตร์ฯ"
- ใช้**ชื่อจริงของผู้บริหาร**ได้ทั้งชื่อเต็มและชื่อสั้น พร้อมคำนำหน้า เช่น "รศ.ดร.ปิติวัฒน์ วัฒนชัย", "อาจารย์ปิติวัฒน์", "คุณเมลิน" รายชื่อดึงจาก `manifest/organization.yaml` (ข้อมูลสาธารณะที่ผู้ดูแลยืนยันแล้ว) ผังผู้บริหารเปลี่ยนเมื่อไร การตรวจก็ตามทันที
- `thai-official-documents` เติมชื่อเต็มและตำแหน่งผู้ลงนามจากผังผู้บริหารเมื่อผู้ใช้ระบุตำแหน่งหรือชื่อ พร้อมบอกวันที่ตรวจผัง ถ้าตำแหน่งมีหลายคนจะเลือกจากทีมที่กำกับ ถ้าผู้ใช้ไม่ได้ระบุจะเขียน `รอยืนยัน` เพราะการเลือกผู้ลงนามเป็นการตัดสินของเจ้าของเรื่อง
- "ร่างบันทึกข้อความขออนุมัติ…" ไปงานหนังสือราชการได้ทันที ก่อนหน้านี้คำว่า "ขออนุมัติ" ทำให้ระบบตีความเป็นการอนุมัติแล้วถามกลับ ส่วน "…แล้วอนุมัติให้เลย" ยัง BLOCK
- trigger "ข้อความ" ของ `step-writing` ไม่แย่งงาน "บันทึกข้อความ" อีก
- การลงนามแทน เซ็นแทน และการออกเลขหนังสือยัง BLOCK และ "ออกเลขหนังสือ", "ลงนามแทน", "เซ็นแทน" ถูกเพิ่มเป็น trigger ระดับองค์กรของ official-signing ให้ตรงกับคำอธิบายของกฎ
- คำขอที่ต้องให้คนทำเท่านั้น (ลงนาม ออกเลข โอนเงิน อนุมัติ กดส่งฟอร์ม) ไม่เข้าโหมด GENERAL
- มี test ทั้งสองฝั่ง: เคสร่าง 6 แบบต้องผ่าน และเคสลงนามหรือออกเลขจริง 7 แบบต้องยัง BLOCK

### ถามน้อยลงเมื่อต้องถาม

- เมื่อมีงานที่เป็นไปได้จริง ระบบถามด้วยเมนูตั้งแต่คำถามแรกหรือที่สอง แทนคำถามปลายเปิดสามรอบ ถ้ามีตัวเลือกเดียวจะถามยืนยันครั้งเดียว
- เมนูแสดงเฉพาะตัวเลือกที่มีหลักฐานว่าเกี่ยวกับคำขอ

### คำพูดวันแรกไปถึงงานที่ตรง

- "ตรวจคำผิด" → ตรวจภาษา, "ทำ timeline โครงการ" → วางแผนโครงการ, "เตรียมตัวสัมภาษณ์ตรวจ ISO" → ซ้อมตอบผู้ตรวจ, "ทำ brief ให้ดีไซเนอร์" → Creative Brief, "ทำ TOR ซื้อ…" → ร่าง TOR, "ทำ prompt รูป…" → prompt ภาพ, "ลาป่วยต้องมีใบรับรองแพทย์ไหม" → สิทธิ์ HR
- "เตรียมตัวสัมภาษณ์งาน" ไม่ถูกดึงไปเป็นการซ้อมตอบผู้ตรวจ ISO

### คุณภาพ Skill

- **eval รายตัวครบ 4 มิติ** (positive, anti-trigger, collision, missing-source) ใน `evals/skills/` สำหรับ `meeting-summary`, `step-writing`, `thai-official-documents`, `hr-policy-lookup`, `document-review` และ `stakeholder-questionnaire` CI รันส่วน routing ทุกเคส
- **ตัวอย่างคำตอบที่ดีพร้อมเหตุผล** ใน `examples/` ของทั้ง 6 Skill ใช้ข้อมูลสังเคราะห์
- **กลไกบังคับ:** Skill ใหม่ต้องมีทั้ง eval และตัวอย่างก่อน merge ส่วน 43 Skill เดิมบันทึกเป็นรายการหนี้ `legacyWithoutEvals` ที่ลดได้อย่างเดียว
- eval จับปัญหาได้สองจุดระหว่างเขียน: "ค่ารักษาพยาบาลเบิกได้ปีละเท่าไหร่" หลุดไปโหมด GENERAL และ "ร่างหนังสือแจ้งมติที่ประชุมถึงหน่วยงานภายนอก" ถูกถามกลับ แก้ทั้งสองแล้ว
- มาตรฐานการเขียน Skill ระบุเกณฑ์ของแต่ละ lifecycle stage ชัดเจน และแก้ข้อความใน `manifest/skills.yaml` ที่ขัดกับมาตรฐาน
- workspace ของทีมได้รับ `docs/knowledge/facility-equipment-index.md` ที่ `expert-resource-matching` ใช้ และ `docs/skill-authoring-standard.md` ที่ `step-skill-authoring` อ้าง ก่อนหน้านี้ลิงก์ทั้งสองใช้ได้ใน repo แต่เปิดไม่ได้บนเครื่องพนักงาน และมี test ตรวจว่าเอกสารที่ Skill อ้างถูกแจกไปครบ

### เอกสารที่ QS และ AFP ไม่ได้ส่งให้

- **QS แจ้งว่าไม่มีหรือไม่ให้ Quality Manual และ Master Document List** จึงเพิ่มเอกสารฉบับทำงานสองไฟล์ที่รวบรวมจาก QP 8 ฉบับที่ QS ส่งมาและหนังสือเวียน ISO ของ CC: [Master List ฉบับทำงาน](docs/knowledge/qms-working-master-list.md) บอก Rev และวันที่ของ QP ส่วน [แผนที่ ISO 9001:2015 → เอกสาร STeP](docs/knowledge/qms-working-reference.md) ใช้แทน QM ทั้งสองไฟล์ระบุชัดว่าไม่ใช่เอกสารควบคุม ต้องตรวจ Rev ล่าสุดใน STeP MIS และขอบเขต QMS (ข้อ 4.3) ยังต้องถาม QS
- ทะเบียนบันทึก QM และ Master List เป็น `not-provided` (QS ไม่ให้ 25 ก.ย. 2569) Skill ด้าน QMS อ้างฉบับทำงานแทน ส่วน QP ที่ Harness ยังไม่มีเนื้อความยังแสดงสถานะว่ามีช่องว่างของแหล่งอ้างอิงเหมือนเดิม
- **AFP ไม่ได้ส่งนโยบายจัดซื้อจัดจ้างและแนวปฏิบัติเบิกจ่ายของ STeP** จึงเพิ่ม [ลำดับชั้นระเบียบงานการเงินและพัสดุ](docs/knowledge/afp-regulation-hierarchy.md) ที่บอกว่าเรื่องไหนน่าจะอยู่ใต้ระเบียบระดับใด คือแนวปฏิบัติ AFP, ประกาศอุทยานฯ, ข้อบังคับ มช. และระเบียบระดับชาติ ไฟล์นี้มีแต่ชื่อฉบับ ไม่มีเนื้อความ AI จึงห้ามอ้างเลขข้อ วงเงิน หรืออัตราจากความจำ ข้อสรุปว่าเบิกได้ไหมหรือ TOR ถูกระเบียบไหมยังเป็นร่างที่รอแหล่งอ้างอิงเหมือนเดิม

### วิธีการจากชุมชน

ดัดแปลงแล้วเขียนใหม่ให้เข้ากับโครง Standard v2 ไม่คัดลอกทั้งไฟล์ ที่มาและ license อยู่ใน [third-party-methods.md](docs/third-party-methods.md)

- **Skill ใหม่ `stakeholder-questionnaire`** (จาก `to-questionnaire`, MIT): ร่างชุดคำถามส่งให้คนที่มีคำตอบ เมื่องานติดที่ข้อมูลหรือเอกสารที่ยัง `รอยืนยัน` เช่น ถาม AFP หรือ QS แทนการรอเฉย ๆ เริ่มที่ lifecycle `draft`
- **ชวนตรวจก่อนนำไปใช้** (จาก `discernment-nudge`, Apache 2.0): หลังคำตอบที่ผู้ใช้จะนำไปตัดสินใจ AI ต่อท้ายคำถามชวนตรวจ 2–3 ข้อที่ชี้สิ่งเฉพาะในคำตอบ ครั้งเดียวต่อบทสนทนา และข้ามเมื่อผู้ใช้ให้ข้อมูลมาเองหรือขอให้ตรวจอยู่แล้ว
- **`document-review` มีขั้นทดสอบจากมุมผู้อ่าน** (จาก `doc-coauthoring`, Apache 2.0): คาดคำถามที่ผู้รับจะถาม แล้วตรวจว่าเอกสารตอบได้หรือยัง
- **`step-skill-authoring`** (จาก `skill-creator`, `writing-skills`, `writing-for-agents`): เริ่มจากเคสที่ AI พลาดเมื่อไม่มี Skill, เทียบแบบมี Skill กับไม่มี Skill, assertion ที่แยกคุณค่าของ Skill ได้ และการเขียนให้ AI ทำตามได้สม่ำเสมอ

### Release

- หน้า GitHub Release ใช้ลิงก์เต็มไปยังไฟล์ของรุ่นนั้น ลิงก์เอกสารในหน้า release จึงเปิดได้
- README และเอกสาร Pilot ไม่ระบุว่า "รุ่นล่าสุดคือ" แล้ว เพราะ release ออกอัตโนมัติเมื่อ merge และข้อความแบบนั้นจะผิดทันทีที่รุ่นใหม่ออก

### อัปเกรดจาก v0.7.3 หรือ v0.7.4

เปิดตัวอัปเดตได้เลย ไม่ต้องติดตั้งใหม่ ตัวอัปเดตเพิ่ม `step-ai` / `step-ai.cmd` และรักษา `USER.md`, `MEMORY.md`, `.env`, `output/` เหมือนเดิม ผู้ดูแลต้องซ้อมบนเครื่องจริงตาม [คู่มือ Pilot](docs/pilot-runbook.md) ก่อนแจ้งผู้ทดสอบ รวมถึงตรวจว่า AI เรียกตัวเลือกวิธีทำงานได้จริงในโปรแกรม AI ที่ใช้

## v0.7.4

**เผยแพร่:** GitHub Release 25 กันยายน 2569 · ไม่แจกให้ผู้ทดสอบ ให้ใช้ v0.7.5 แทน เพราะรุ่นนี้ยังไม่มีตัวเรียกคำสั่งสำหรับเครื่องที่ไม่มี Node.js บน PATH

| รายการ | v0.7.3 | v0.7.4 |
| --- | ---: | ---: |
| Skills | 46 | 49 |
| เส้นทาง Router (ไม่นับ `step-router`) | 45 | 48 |
| Playbooks | 4 | 5 |
| Actions | 3 | 4 |
| ทีม / กลุ่ม routing | 22 / 5 | 22 / 5 |

### งานใหม่ที่พนักงานถามได้

- **`hr-policy-lookup`** ตอบสิทธิ์และสวัสดิการจากประกาศ HR ฉบับ 2569 เช่น วันลา ค่าเดินทาง และค่าที่พัก พร้อมอ้างเลขข้อ ส่วนยอดคงเหลือของแต่ละคนให้ถาม HD และไม่รับหรือเก็บเลขบัตรประชาชน
- **`afp-operations-lookup`** ตอบระยะเวลาดำเนินการของ AFP (การเงินและจัดซื้อ) หมวดค่าใช้จ่าย B/BV/B9.2 การจ้างรถตู้ และค่าวิทยากร โดยบอกเงื่อนไขทุกครั้งว่านับเวลาเมื่อเอกสารครบ และถ้าแก้เอกสารจะเริ่มนับใหม่
- **`event-run-of-show`** พร้อม Action `spreadsheet-run-of-show` และ Playbook `brief-to-run-of-show` ช่วยทำหรือตรวจรันคิวเวทีด้วย checklist 14 ข้อ

### ปรับ Skill เดิม

- `event-concept` มีขั้นออกแบบ Signature Moment เป็นทางเลือก และต้องให้เจ้าของพิธีตัดสินเรื่องที่เกี่ยวกับศาสนา สถาบัน หรือประเพณีท้องถิ่น
- Skill ฝั่ง Creative อ้างแบบฟอร์ม CC ที่ใช้อยู่ตอนนี้ เพราะ FM-CC-001/003/008 ถูกยกเลิก และยืนยันแล้วว่า FM-CC-010 รวมทั้งสามฉบับ
- First Run กลับมาถามชื่อเล่น ชื่อผู้ช่วย และสไตล์การคุยสำหรับผู้ใช้ใหม่ในข้อความเดียว ข้ามได้ ส่วนผู้ใช้เดิมไม่ถูกบังคับให้ทำซ้ำ

### ความปลอดภัยและ routing

- ตรวจ privacy ของคำขอก่อนเลือกเส้นทาง และใช้ข้อความที่ปิดบังแล้วตลอดทาง เลขประจำตัวที่วางมาจึงไม่ไปถึง Skill, routing contract หรือหน้าจอ terminal
- ระบุให้ AI ทุกตัวต้องเรียก Router ในเครื่องก่อนตอบงานจริง และถ้า CLI ใช้ไม่ได้ต้องทำตามทางสำรองที่กำหนด ไม่ข้ามไปตอบจากความรู้ของโมเดลเอง
- ประมาณ token ภาษาไทยตามจริง (ประมาณ 1 token ต่ออักษร) ไม่ใช้อัตราเดียวกับภาษาอังกฤษ

### ข้อมูลส่วนตัวและไฟล์งาน

- สร้าง `.gitignore` ให้ workspace ที่ยังไม่มี เพื่อไม่ให้ `USER.md` / `MEMORY.md` ติดไปกับ Git ภายหลัง
- จองชื่อไฟล์ output แบบ exclusive เมื่อสั่งงานสองครั้งในวินาทีเดียวกัน ไฟล์แรกจะไม่ถูกเขียนทับ
- `step-ai update` คัดลอกเอกสาร HR, CC และ AFP ที่ Skill อ้างถึงไปที่ workspace ด้วย ก่อนหน้านี้ Skill ติดตั้งแล้วแต่หาเอกสารอ้างอิงไม่เจอ

### แหล่งอ้างอิงที่เพิ่ม

- ดัชนีประกาศ HR ฉบับ 2569 พร้อมอัตราที่ประกาศ แนวปฏิบัติ HR ที่มีเฉพาะในหนังสือเวียน และ [ช่องทางยื่นเรื่อง HR](docs/knowledge/hr-service-channels.md)
- [ระยะเวลาและหมวดค่าใช้จ่าย AFP](docs/knowledge/afp-operational-circulars.md)
- [ทะเบียนเอกสาร ISO ของ CC](docs/knowledge/cc-iso-document-register.md)

### การติดตั้งและดูแลระบบ

- คู่มือ macOS ใช้ขั้นตอน System Settings > Privacy & Security > Open Anyway เพราะ Apple ถอดวิธีคลิกขวา > Open ออกตั้งแต่ macOS 15 (Sequoia)
- คืน executable bit ให้ `bin/step-ai.js` คำสั่ง `step-ai` จาก clone ใหม่จึงไม่ขึ้น Permission denied
- ตรึง `src/vendor/privacy/` เป็น `-text` การ clone บน Windows จึงไม่ทำให้ integrity check ของ runtime ล้มเหลว (ไม่กระทบ ZIP ที่แจก)
- workflow ออก release ตรวจชุดเดียวกับ CI ครบ (Node runtime pin และ syntax ของสคริปต์ privacy/PowerShell ทุกไฟล์) และใช้หัวข้อรุ่นในไฟล์นี้เป็น release notes

### ไม่ได้รวมในชุดติดตั้ง

- `experiments/local-thai-ocr` เป็นการทดลองแยก ไม่อยู่ใน ZIP หรือ npm package

### อัปเกรดจาก v0.7.3

ผู้ที่ติดตั้ง v0.7.3 แล้วเปิดตัวอัปเดตได้เลย ไม่ต้องติดตั้งใหม่ ตัวอัปเดตตรวจ checksum ก่อนติดตั้ง สร้าง snapshot สำหรับ rollback รักษา `USER.md`, `MEMORY.md`, `.env`, `output/` และไม่เขียนทับไฟล์ระบบที่ผู้ใช้แก้เองในเครื่อง ผู้ดูแลซ้อมอัปเกรดและ rollback ได้ตาม [คู่มือ Pilot](docs/pilot-runbook.md)

## v0.7.3

**เผยแพร่:** GitHub Release 21 กันยายน 2569 · ใช้ใน Pilot รอบแรก 22 กันยายน 2569

46 Skills / 45 เส้นทาง Router / 4 Playbooks / 3 Actions / 22 ทีม / 5 กลุ่ม routing รุ่นก่อนหน้านี้ดูรายละเอียดได้จาก GitHub Releases และประวัติ commit
