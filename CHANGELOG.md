# CHANGELOG — STeP AI Harness

บันทึกสิ่งที่เปลี่ยนในแต่ละรุ่นที่แจกให้พนักงาน รุ่นที่ยังไม่มี GitHub Release ถือเป็นรุ่นเตรียมออก ไม่ใช่รุ่นที่อนุมัติแจกแล้ว ชุดติดตั้งต้องมาจาก release tag และผ่าน Release Gate ตาม [Pilot Operations](docs/pilot-operations.md)

workflow `Publish Pilot Release` ใช้ส่วน `## v<รุ่น>` ของไฟล์นี้เป็น release notes ของ GitHub Release และจะไม่ออก release ถ้ายังไม่มีหัวข้อของรุ่นที่ระบุใน `package.json`

## Unreleased

STeP Desktop version 0.5.5 (`desktop/package.json`) contains the changes below.

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
  - `step-teams-directory` (`docs/teams.md`)
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
- Register the executive board as an organization document (`step-executive-board`, `docs/step-executive-board.md`). It is built from the maintainer-confirmed `executiveOversight` in `manifest/organization.yaml` (checked 2026-09-20). "ผู้อำนวยการ STeP ชื่ออะไร", "ผอ.คือใคร", "รองผู้อำนวยการมีใครบ้าง" and "ทีม HD อยู่ภายใต้การกำกับของใคร" are now answered from it instead of a web search, which had returned a former director. A test keeps the document in step with `organization.yaml`.
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
- workspace ของทีมได้รับ `docs/facility-equipment-index.md` ที่ `expert-resource-matching` ใช้ และ `docs/skill-authoring-standard.md` ที่ `step-skill-authoring` อ้าง ก่อนหน้านี้ลิงก์ทั้งสองใช้ได้ใน repo แต่เปิดไม่ได้บนเครื่องพนักงาน และมี test ตรวจว่าเอกสารที่ Skill อ้างถูกแจกไปครบ

### เอกสารที่ QS และ AFP ไม่ได้ส่งให้

- **QS แจ้งว่าไม่มีหรือไม่ให้ Quality Manual และ Master Document List** จึงเพิ่มเอกสารฉบับทำงานสองไฟล์ที่รวบรวมจาก QP 8 ฉบับที่ QS ส่งมาและหนังสือเวียน ISO ของ CC: [Master List ฉบับทำงาน](docs/qms-working-master-list.md) บอก Rev และวันที่ของ QP ส่วน [แผนที่ ISO 9001:2015 → เอกสาร STeP](docs/qms-working-reference.md) ใช้แทน QM ทั้งสองไฟล์ระบุชัดว่าไม่ใช่เอกสารควบคุม ต้องตรวจ Rev ล่าสุดใน STeP MIS และขอบเขต QMS (ข้อ 4.3) ยังต้องถาม QS
- ทะเบียนบันทึก QM และ Master List เป็น `not-provided` (QS ไม่ให้ 25 ก.ย. 2569) Skill ด้าน QMS อ้างฉบับทำงานแทน ส่วน QP ที่ Harness ยังไม่มีเนื้อความยังแสดงสถานะว่ามีช่องว่างของแหล่งอ้างอิงเหมือนเดิม
- **AFP ไม่ได้ส่งนโยบายจัดซื้อจัดจ้างและแนวปฏิบัติเบิกจ่ายของ STeP** จึงเพิ่ม [ลำดับชั้นระเบียบงานการเงินและพัสดุ](docs/afp-regulation-hierarchy.md) ที่บอกว่าเรื่องไหนน่าจะอยู่ใต้ระเบียบระดับใด คือแนวปฏิบัติ AFP, ประกาศอุทยานฯ, ข้อบังคับ มช. และระเบียบระดับชาติ ไฟล์นี้มีแต่ชื่อฉบับ ไม่มีเนื้อความ AI จึงห้ามอ้างเลขข้อ วงเงิน หรืออัตราจากความจำ ข้อสรุปว่าเบิกได้ไหมหรือ TOR ถูกระเบียบไหมยังเป็นร่างที่รอแหล่งอ้างอิงเหมือนเดิม

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

- ดัชนีประกาศ HR ฉบับ 2569 พร้อมอัตราที่ประกาศ แนวปฏิบัติ HR ที่มีเฉพาะในหนังสือเวียน และ [ช่องทางยื่นเรื่อง HR](docs/hr-service-channels.md)
- [ระยะเวลาและหมวดค่าใช้จ่าย AFP](docs/afp-operational-circulars.md)
- [ทะเบียนเอกสาร ISO ของ CC](docs/cc-iso-document-register.md)

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
