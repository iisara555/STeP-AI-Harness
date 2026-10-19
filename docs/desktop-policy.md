# STeP Desktop managed policy

Phase 1 of the OpenHarness adaptation adds organization-managed permissions and hooks. The Router authority gate, Privacy Gate and built-in credential-path exclusions remain independent of permission mode and remembered approvals.

## Policy location and trust

- Windows: `%ProgramData%\STeP\desktop-policy.json`.
- macOS: `/Library/Application Support/STeP/desktop-policy.json`.
- Linux: `/etc/step/desktop-policy.json`.

There is no employee-facing policy editor. The application verifies both the file and its immediate parent directory before reading the policy. On Windows, their owners must be Administrators, SYSTEM or TrustedInstaller, with no write/delete/ownership grants to other principals. Provision the directory and file with administrator-owned ACLs; merely placing a user-owned JSON file under ProgramData is insufficient. On Unix, both must be root-owned with no group/other write bits. Symlink files/directories are rejected. Policy size is limited to 256 KB.

A missing file uses defaults. Untrusted, unreadable, malformed or invalid policy uses the entire default policy and reports a warning in Settings. Invalid blocking definitions are never silently discarded while enabling a risky capability. The file is checked for changes every five seconds. Reloading cancels outstanding approvals and takes effect on subsequent operations; it does not roll back an operation that has already completed.

An unpackaged development app using `STEP_DESKTOP_TEST_HOME` reads `desktop-policy.json` in that synthetic profile without the administrator ACL check. Packaged applications never honor this test override.

## Defaults and example

Default modes are `ask`, `acceptEdits`, `plan` and `auto` (Full auto), with `ask` selected. `autoMode` defaults to true so Full auto is offered, as in other AI coding apps; terminal commands still ask unless `shellByAi` is on. `shellByAi`, `autoMerge`, `autopilot`, `sandbox`, `mcp`, `lineGateway`, `voice`, `copilot`, `compatibleProviders`, `coordinator`, `memoryTeam` and `autoRouting` default to false. `vision` defaults to true. `cron` defaults to true: employees may create their own scheduled tasks on the **งานตั้งเวลา** page; each job asks for consent when saved, runs only while the app is open (a run missed within 12 hours runs at the next open), passes the privacy check and ends as a draft for review; set it to false to hide scheduling. `autoUpdate` defaults to true: the installed app checks the `desktop-latest` release for a newer version, downloads it in the background and offers "restart to update"; set it to false where IT rolls out versions centrally. `providerPresets` defaults to true: employees may connect well-known AI services (OpenRouter, DeepSeek, Qwen on Alibaba Cloud Model Studio international, MiniMax international, Groq, Mistral, xAI and a local Ollama) at their fixed official endpoints with their own key, or sign in with OpenRouter, which issues a key through its OAuth PKCE page; set it to false to offer only ChatGPT, Claude, Gemini and administrator-approved endpoints. Preset endpoints are refused while `network.proxyUrl` is set. `receiptVision` defaults to true: with `vision` on and `checks.privacy` off, the Receipt page sends the receipt image to the connected AI for a second reading after a one-time consent; set it to false to keep receipts on the local OCR only. `developmentMode` defaults to true in 0.6.5: the release offers the developer switch in Settings → AI, and the developer must opt in to test their own Claude Pro/Max plan without `claudeSubscription` ([claude-subscription.md](claude-subscription.md)); false hides the switch and ignores any saved local opt-in. Optional top-level `developmentPasscodeSha256` (64 hex characters, the SHA-256 of a passcode IT chooses) makes turning the switch on ask for that passcode; only the digest is stored and it never reaches the renderer. `claudeSubscription` defaults to false: when true, employees may chat on their own Claude plan through the official Claude Code installed on the machine (see [claude-subscription.md](claude-subscription.md); `scripts/pilot/enable-claude-code.ps1` / `.sh` set it). `learningReview` defaults to false: when true, each employee may turn on the background learning review in the Learning Inbox, which drafts lessons from a task every 10 user turns (at most 10 reviews a day, each a model call on that employee's account) as pending proposals only ([desktop-learning.md](desktop-learning.md)). `ocrTrial` defaults to false: when true, the OCR pilot team may save a field-by-field trial report as local JSON (`ocrTrialSave`, outside the repository checkout); when false that call is refused with `FEATURE_DISABLED`. The Receipt page has no trial screen of its own now, so employees see no difference. `answerCheck` defaults to true (set false to turn it off): a chat answer about STeP is sent once more to the same AI with the document excerpts it used, and statements the documents do not support are listed under the answer (one extra model call per such answer; a failed check never blocks the answer). Every answer about STeP lists the documents it drew on regardless of this flag. `autoEffort` defaults to true: when the employee leaves the reasoning level on its default, a short chat question (no files, at most 200 characters) is sent with `low`, a large task (a Playbook, plan mode, a request over 1,500 characters, more than 20,000 characters of source or three or more files) with `high`, and everything else, including every document draft, with the model's own default; only levels the model lists are sent, the employee's own choice always wins, and the level used is kept in the run trace (`desktop/electron/effort.ts`). Set it to false to always use the model default. `maintenance` defaults to true: once a day while the app is open (and when the Memory dialog opens after a day), a local check with no model call lists memories that expired, were not reviewed for 180 days, hold short-lived text or nearly duplicate another; lessons corrected again, rated "Needs fixing" more than "Good", unused for 90 days, short-lived or duplicated; and enabled Skill Packs that cannot be read or whose review is not a pass. They appear on a to-do / in progress / done board in the Memory dialog; the board never edits or deletes anything, and moving an item to done runs the check again and sends it back to to-do if the problem is still there (`desktop/electron/maintenance.ts`). Set it to false to hide the board and stop the check. "เสนอให้องค์กรใช้" appears under Skill Packs that passed the review and sends to the organization's intake sheet built into the app; optional `skillPacks.submitUrl` (an Apps Script web app `/exec` address on `script.google.com`, deployed from `scripts/skill-intake`, setup steps in its README) sends to another intake instead, and `staffSkills: false` removes the button; it sends the pack's text files, review, use count and the sender's name and team after the privacy check and consent, and approves nothing. `staffSkills` defaults to true: an employee may use a Skill Pack they imported on their own computer once it passes the automated Standard v2 and safety review, after confirming, as text only (no hooks or agent templates); set it to false to require the administrator digest in `skillPacks.approvedDigests` for every pack, which also stops packs already in personal use. `skillPacks` defaults to false and controls only administrator-approved packs: when true, a pack whose digest is in `skillPacks.approvedDigests` may be enabled with its hooks and agent templates; when false, no pack is enabled that way and no pack hook runs. With both `skillPacks` and `staffSkills` false, importing a Skill Pack is refused (`PACK_IMPORT_DISABLED`) and the import button is disabled with the reason. `toolLoop` defaults to true and enables the [Phase 2 host tool loop](desktop-tool-loop.md), with independent outgoing-data consent and human-reviewed file changes. [Phase 4 automation and tools](desktop-automation.md) implements coordinator, cron, MCP, sandbox and gated autopilot. Other feature flags grant permission and do not establish that future implementations are available. `feedback` defaults to true: **ช่วยเหลือ > แจ้งปัญหา / เสนอแนะ** (and the link in the 👎 dialog under an answer) sends a problem, a suggestion or a wrong answer to the same Apps Script intake as Skill proposals (`skillPacks.submitUrl` or the built-in address), as one row in its "ความเห็นจากพนักงาน" tab. Only the typed text, the AI answer when the employee ticks it, their name and team when they tick it, the task's latest error code, the operating system and the app version are sent, after the privacy check and a native confirmation; set it to false to remove the menu item and refuse sending (`FEEDBACK_SUBMIT_UNAVAILABLE`).
`skillSuggestions` defaults to true: while `autoRouting` is off, a Skill the local Router matches with high confidence to what the employee is typing is offered as one "ลองใช้ Skill: …" button above the composer; nothing changes unless they press it, a dismissed Skill is not offered again in that window, and no model is called. Set it to false to hide the button.
`morningBrief` defaults to true: when an employee has connected a Google account with Calendar, the chat home shows a **สรุปเช้านี้** card from 09:00 (the employee can change the time or turn it off under Passwords and connections). Pressing "ดูสรุปวันนี้" asks once and then reads only today's primary Calendar and Google Tasks with three fixed read operations (`calendar.events`, `tasks.lists`, `tasks.list`, a few pages at most); appointments, clashes, unanswered invitations, tasks due today or overdue and simple tips are worked out on the computer with no model call, and nothing is sent to AI unless the employee presses "ถาม AI ต่อ", which only fills the composer. A notification with no meeting or task names says when the card is ready. The employee may tick "อนุญาตทุกวัน" so later days read without asking; that remembered consent covers only those three reads of that account and lapses when the account is paused, resumed, reconnected or removed, or the policy file changes, and Settings shows it with a button to withdraw it. Optional top-level `morningBrief.rememberConsent: false` makes the app ask every day; `features.morningBrief: false` removes the card and its settings.

```json
{
  "features": {
    "autoMode": false,
    "shellByAi": false,
    "mcp": false,
    "lineGateway": false
  },
  "permission": {
    "modes": ["ask", "plan"],
    "defaultMode": "ask",
    "pathRules": [{ "pattern": "restricted/*", "allow": false }],
    "deniedCommands": ["deploy *"]
  },
  "hooks": [],
  "mcpServers": [],
  "prices": {},
  "modelLimits": {},
  "budgets": {}
}
```

The composer offers four modes, in the same spirit as Claude Code and ChatGPT:

| Mode | Value | File edits | Commands, sandbox, MCP calls |
|---|---|---|---|
| Ask before edits | `ask` | Ask each time (a reviewed write can be remembered for the same file) | Ask each time |
| Accept edits | `acceptEdits` | AI edits are applied right away, with a snapshot to undo them | Ask each time |
| Full auto | `auto` | Applied without asking | Without asking only when `features.shellByAi=true`; otherwise they ask |
| Plan | `plan` | Blocked (read only) | Blocked |

`ask`, `acceptEdits` and `plan` are available by default. A policy that lists `permission.modes` without `acceptEdits` removes it. In every mode, sensitive paths, denied paths, denied commands and blocking hooks still apply. Privacy blocks and browser business actions also still apply.

`auto` requires both `features.autoMode=true` and inclusion in `permission.modes`. Shell execution in auto also requires `features.shellByAi=true`; otherwise it still asks. Omitted or disabled modes fall back to the organization's permitted default. No production policy is installed or changed by this repository.

## Workbench permissions and approvals

Phase 6 adds optional `transmissionConsent: { "allowRunScope": false }` to force one-time result consent. Omission permits an employee choice for bounded clean-read transmission within one loop (pre-checked in standard consent, see [pilot mode](#pilot-mode)); it never grants execution permission. See [scoped consent](desktop-phase6.md) for source, risk, destination and revocation boundaries.

## Organization checks (`checks`)

Both checks are **off by default**: `{ "checks": { "authority": false, "privacy": false } }`.

| Check | Off (default) | On |
|---|---|---|
| `authority` | Every request is answered as help, including ones about approving, signing on someone's behalf, issuing document numbers or submitting. The AI has no tool that can perform these acts | The router's authority registry and Skill scope rules BLOCK or ESCALATE these requests |
| `privacy` | Nothing is scanned. Text, attachments, memories, tool results and web queries go to the AI provider unchanged. National ID numbers, phone numbers, names, passwords and API keys are **not** masked or blocked, and there is no dialog before data leaves | The personal-data and credential scan masks, blocks or asks as described in [pilot mode](#pilot-mode) and the [privacy gate](privacy-preflight.md) |

With `privacy` off, responsibility moves to the employee through the **usage terms**:
- Each person ticks the terms once, on the last setup step, or at the first send if they skipped setup.
- The terms say:
  - what is sent to the AI provider, and that the app does not scan or mask it;
  - not to send passwords, API keys, national ID or account numbers, health or salary data, or other people's personal data (PDPA and university rules);
  - that approving, signing, submitting, issuing numbers and transferring money stay with people and the proper systems;
  - to check every answer before use;
  - that history stays on the computer.
- The accepted version is stored as `settings.termsVersion`.
- When `TERMS_VERSION` in `desktop/src/terms-version.ts` changes, everyone is asked once more.
- The administrator remains responsible for choosing this setup under PDPA. Side-effect tools (writing files, running commands, browser open/fill/click, MCP calls) still ask each time; that is a permission, not a privacy check.

## Web and credential guards (always on)

Vault's [Hermes-style browser workflow](desktop-vault-hermes.md) is enabled by `features.vault: true` (release default). Saved logins and addresses fill automatically on their exact saved HTTPS origins; payment-card storage/import/fill are disabled at the owner's request, and final browser actions keep their existing approvals. Trusted masked save/unlock/code dialogs never create chat replies. Model metadata includes login identifiers. `credentialStorage.sharedDevice: true` disables remembered credential enrollment/use. Optional `credentialStorage.blockHostExecution: true` preserves the previous global terminal/custom runtime/command hook/local MCP/sandbox denial once a Vault key exists. Omitted/false allows those tools under normal permissions, including after enrollment. Invalid/untrusted policy disables Vault and restores the strict host gate. Password-manager CLI detection is on by default; employee opt-out and local lock win.

These guards stay on whatever `checks` says. They stop a page or file with hidden instructions (prompt injection) from sending task data out without anyone seeing it:

- **Reading a website (`web_fetch`):** the AI reads a site only after the employee allows that site once in the task. This applies in every mode, Full auto included. The full URL is shown, so data hidden in the address is visible. `web_search` does not ask.
- **Credentials:**
  - With `checks.privacy` off, text going to the AI or a web service is still scanned for credentials alone. This covers messages, attachments, file reads and URLs.
  - Credentials are passwords, tokens, API keys and signed URL parameters. They are masked as `[credential-redacted]`.
  - Text whose credential cannot be fully masked is withheld.
  - A URL that carries a credential is never fetched.
- **The assistant's browser:** it opens public sites only.
  - localhost, private IP addresses, `.local` and `.internal` names, and public names that resolve to private addresses are blocked.
  - A page cannot load anything from those addresses either.
  - To allow an intranet system, list its host in `"network": {"privateHosts": ["intranet.step"]}` (at most 50 plain host names).
  - Pages the employee opens in the Web tab are not restricted.

## ดูสิทธิ์จากหน้า Connect AI

ใน Settings และ Setup เปิด **บัญชีนี้ทำอะไรได้บ้าง** เพื่อดูแชต ค้นเว็บ อ่านภาพ และสร้างภาพตามบัญชีและนโยบายปัจจุบัน หากยังใช้ไม่ได้ หน้าจอบอกเหตุและขั้นตอนต่อไป เช่น เชื่อมต่อบัญชี ติดต่อ IT หรือใช้ OCR ในเครื่อง การทดสอบบัญชีเป็นการทดสอบข้อความสั้น ไม่ได้ยืนยันสิทธิ์โมเดลภาพ โควตา หรือบริการภายนอก

**ฟังก์ชันที่องค์กรเปิดให้ใช้** แสดงการเลือก Skill อัตโนมัติ MCP งานย่อย งานตามรอบ และการตรวจข้อมูล/อำนาจ เฉพาะสถานะที่นโยบายระบุ ถ้าไม่ทราบจะแสดงว่ายังไม่ทราบ จำนวน MCP server บอกเพียงว่าตั้งค่าไว้ ไม่ได้ยืนยันว่าติดต่อได้หรือมีสิทธิ์เอกสาร ต้องทดสอบ server และยืนยันสิทธิ์เมื่อใช้จริง สถานะการตรวจเพิ่มเติมไม่ยกเลิกการขออนุญาตใช้เครื่องมือหรือการป้องกัน credential เครื่องมือและการส่งข้อมูลยังผ่าน permission/consent เดิม

## Automatic routing (`features.autoRouting`)

By default STeP Desktop does not run the local Router's Skill selection.
- Every message goes straight to the AI as general help, with the organization documents that match it.
- The app never asks "งานนี้ตรงกับข้อนี้ไหม".
- It never picks a Skill or Playbook for the employee.
- The AI sees a **Skill registry**: one line per routed Skill, giving its name and description. It does not see the Skill text.
- When a request is work a Skill covers, the AI loads that one Skill's full text with the `skill` tool, the same progressive loading Claude Code and opencode use. The status line shows "กำลังอ่าน Skill …".
- The employee can also pick a Skill with `/` in the composer.

The Router still runs on every message:
- With `checks.authority` on, authority checks (`manifest/authority.yaml`) and the best-matching Skill's own scope rules still BLOCK or ESCALATE. Examples are approving, signing on someone's behalf, or issuing a document number.
- The privacy gate follows `checks.privacy`.
- General help always loads the Human Approval and Data Classification rules.

`{ "features": { "autoRouting": true } }` restores automatic Skill and Playbook selection and clarifying questions. See [STeP Router](step-router.md#manual-skill-selection-autoroute-false).

## Pilot mode

The privacy rows below apply only when `checks.privacy` is on.

Standard consent, first trialled as pilot mode, is now the default. Administrators can set `{ "pilot": false }` to return to strict mode, with the extra dialogs in the first column below. Any value other than `true` or `false` rejects the whole policy. A change applies on the next policy reload.

| | Strict (`"pilot": false`) | Standard (default) |
|---|---|---|
| First send on this computer | Dialog with the usage terms to tick | Usage terms ticked on the last setup-wizard step. Skipping the wizard shows them at the first send. In both modes they appear again when the terms version changes |
| Text attachment or pasted source | Dialog per send | No dialog unless the privacy review flags it |
| Image attachment (vision) | Dialog | Dialog |
| Sensitive word with no person identifier | Dialog | Sent with a warning notice |
| Name table or unresolved person identifier | Dialog | Dialog |
| Several AI workers (coordinator) | Dialog | Dialog |
| Saved preferences (`STEP.md`, `AGENTS.md`, `ASSISTANT.md`, output style) and confirmed memories | Dialog per task, listing the files and memory names | Sent without a dialog, like custom instructions and memory in Claude and ChatGPT. They pass the same privacy check when loaded; anything with personal data or secrets is refused |
| Masked national ID, phone or e-mail | Masked, notice | Masked, notice |
| Tool results sent to the AI | Per source; "this run" unchecked | One answer covers every clean result in the run; the "this run" box starts checked. Results with findings still ask each time |
| Plan approval (`plan` tool) | Dialog | No dialog. The plan is noted but not stored as approved; it never granted anything beyond drafting |

With `checks.privacy` on, these floors are the same in both modes and covered by `desktop/test/pilot.test.ts` and `desktop/test/policy-smoke.mjs`:

- Credentials, passwords, API keys and tokens stop the send (`PRIVACY_REVIEW_REQUIRED`), in the message or in an attachment.
- Sensitive data together with a person identifier stops the send.
- National ID numbers are masked before anything leaves the computer.
- Running commands, the sandbox, MCP calls and browser actions ask every time. A reviewed file write can be remembered for the same file (see Workbench permissions below). Denied paths, denied commands, plan mode and hooks behave as before.
- `transmissionConsent.allowRunScope: false` still forces one-time result consent in pilot mode.

The app counts consent dialogs on this computer: prompts, confirmations and cancellations per task and per tool. It stores counts and tool names only, never the text that was asked about, and does not send them anywhere. Settings → Organization policy shows the totals and the average per task, so a pilot can report how often people were asked before and after.

Every Workbench IPC operation passes through `ToolGate`: Files, Read, Stage, Changes, Reject, Apply, Diff, Tasks, Cancel, Browser, Browser Read and Terminal. Checks run before the pre-tool hook and again immediately before the operation. A workspace, mode or policy change during an approval aborts or cancels it.

- Read-only operations do not ask for consent. Staging a diff is a preview stored in the local review queue and does not write the workspace. Rejecting a preview and cancelling a running task remain available in plan mode.
- Plan mode blocks applying files and starting commands. The provider receives a planning instruction, and image generation is blocked. Editing a conversation draft is still local review, while explicit export actions retain their existing user-driven behavior.
- Ask mode asks before applying changes or starting commands. The shared approval dialog shows the tool, target details and classification. As in Claude Code and ChatGPT, only a reviewed file write can be remembered, for the same file in the same workspace: its diff was shown and a snapshot can undo it. Commands, the Docker sandbox and MCP calls ask every time, and a rule an older version remembered for them is ignored. Administrators can turn remembering off with `permission.rememberApprovals: false`. Privacy send consent remains bound to the original request and cannot be made persistent through this dialog.
- Remembered rules contain only workspace/target hashes, tool names and timestamps. Users can revoke them in Settings. They never override a denied path, denied command, plan mode or blocking hook. Dialog cancellation, expiration, app shutdown or renderer reload prevents the pending action.

Built-in exclusions cover credential/runtime homes, `.ssh`, `.aws`, gcloud, Azure, GnuPG, Docker configuration, Kubernetes configuration, `.git`, `.env*`, common private-key extensions, credential filenames and `desktop-policy.json`. Deny path rules take precedence over allow rules; allow rules never bypass built-in exclusions or human consent. Workspace-relative patterns resolve against the selected workspace; wildcard-leading and absolute patterns match normalized full paths. Patterns support `*` and `?`.

Workbench rechecks real paths, stays in the selected workspace and refuses symbolic links/junction escapes. File listings hide excluded entries. Git diff selects permitted paths and disables external diff/text conversion, so it does not include tracked credential files.

Denied command patterns are checked against the command and shell segments. Literal references to excluded paths are also denied. This is a policy filter, not a shell parser or OS sandbox: approved shell commands run with the employee's OS permissions, and encoded/dynamic paths cannot be reliably inferred. Keep auto shell disabled until the separately planned sandbox and organizational execution policy are validated.

## Hooks

Supported events are `session_start`, `session_end`, `user_prompt_submit`, `pre_tool_use`, `post_tool_use`, `pre_compact`, `post_compact` and `stop`. The host emits session start on creation, session end before removal, prompt submit before queueing, pre/post events for tools and an observational stop event with the run trace. Phase 3 compaction emits its pre/post events around actual compaction.

All hook types receive metadata only: event, session id, tool, target hash, mode, counts, read-only/success flags and outcome codes. They never receive request text, document text, commands, file paths, credentials or attachments. Diagnostics identify the event/type/index, duration, success and blocking status; they do not record endpoints, commands or response reasons.

```json
{
  "hooks": [
    {
      "event": "pre_tool_use",
      "type": "command",
      "command": "organization-tool-check",
      "matcher": "write",
      "timeoutSeconds": 10,
      "blockOnFailure": true,
      "priority": 10
    }
  ]
}
```

Definitions run in descending priority with stable declaration order. `matcher` is a glob on the tool name. Timeout defaults to 30 seconds and is capped at 600. `blockOnFailure` defaults to true; `block_on_failure` is accepted as an alias.

- `command`: receives JSON on stdin. Exit code 2 or JSON `{"decision":"block"}` blocks. Exit code 0 with empty stdout or `{"decision":"allow"}` permits. Ambient token/key/password variables are removed, output is bounded, and a timeout terminates the process tree.
- `http`: requires `url`, with optional `headers`; sends a POST of metadata. It follows no redirects and bounds the response. An explicit block blocks; transport/status/JSON failures use `blockOnFailure`. Endpoints are trusted administrator configuration and may be internal organization services.
- `prompt`: requires `prompt`; asks the session's existing provider (or the first ready connection for standalone workspace tools) to evaluate metadata and return only allow/block JSON. The configured prompt passes Privacy Gate, uses the isolated runtime with tools disabled, and is cancellable. Missing providers, invalid replies or timeouts use `blockOnFailure`. Production prompt hooks can consume provider quota; tests use synthetic runners.

A pre-hook denial stops an operation. A blocking post-hook reports `HOOK_BLOCKED_AFTER_TOOL`; the operation has already occurred and cannot be automatically undone. Stop hooks are observational and cannot revoke an already delivered result. Router/Privacy decisions are never replaced by hook output.

## Validation

Run `npm test`, `npm run format:check`, `npm run build` and `npm run test:electron` in `desktop/`, plus root tests and `npm run validate`. `policy-smoke.mjs` uses an isolated Electron profile and a local HTTP fixture to verify plan/ask modes, cancel/remember/revoke, reloading during approval, sensitive paths, hook blocking and invalid-policy warnings through the real preload bridge. These checks do not establish a production release or run live provider evaluation.

## Desktop 0.6.5 credential and demo defaults

The release enables `vault`, `googleWorkspace` and `developmentMode` without a per-machine policy file. `claudeSubscription` remains false: a developer turns Dev mode on to use a personal Claude Pro/Max account for evaluation/demo, then selects **Switch back to normal mode** to turn it off. The owner chose manual shutdown; there is no scheduled expiry. This does not establish Anthropic approval for organizational distribution of subscription sign-in.

The default policy contains only the public installed-app client ID, `step.cmu.ac.th` and `documents`, `calendar-read`, `tasks`. `calendar-read` requests only read-only Calendar scopes; `calendar` additionally allows reviewed event creation. Google API enablement, OAuth audience/test users and administrator access still require project/tenant configuration. A managed `googleWorkspace` object replaces the entire configuration; `googleWorkspace: null` explicitly clears it. Explicit `features.vault`, `features.googleWorkspace` or `features.developmentMode` false values deny the respective capability. Malformed or untrusted managed policy disables all three capabilities instead of falling back to release-enabled credential/demo features.

### Desktop OAuth client credentials

Google can require the issued `client_secret` for a Desktop app even when PKCE is used. The employee-device failure
confirmed on 2026-10-17 was `GOOGLE_CLIENT_SECRET_REQUIRED`; repeating browser consent cannot supply the missing value.
The employee flow is **Connect work account -> choose the work Google account -> Allow -> return to STeP**.
Employees do not need a Google Cloud project, JSON file or client secret.

An administrator configures the organization's **Desktop app** JSON once for the distribution:

1. In repository **Settings -> Secrets and variables -> Actions**, create `GOOGLE_DESKTOP_CLIENT_JSON` with the
   complete downloaded JSON as its value. Keep the real file outside the checkout; never commit it or send it in chat.
2. Build installers with the existing `Build STeP Desktop installers` workflow. `publish: false` makes a test installer;
   publishing still requires the owner's release instruction. Published builds fail if the JSON is missing. Any supplied
   input must be a Desktop app client matching the release's default ID; Web clients and mismatches fail without
   printing their contents.
3. Distribute the installer normally. Main-process code uses the preconfigured native client automatically for code
   exchange and refresh. Settings hides the administrator file-import section for the matching configured client.

For a local developer build, set `STEP_GOOGLE_DESKTOP_CLIENT_JSON` to the file contents before `npm run build`;
`STEP_REQUIRE_GOOGLE_DESKTOP_CLIENT=true` enables the same missing-input check. An absent value is allowed for
unpublished development builds. The build injects only the validated client ID and client secret into the **main**
bundle, never the renderer or preload; it does not package the original JSON or its other fields. A different managed
client ID never receives the distribution's client secret. A new distribution's value takes precedence over an older
manual import, allowing client credential rotation through installer updates.

**Native apps cannot keep an installed-app client secret confidential**: a recipient can extract it from the installer.
This is shared application identity, not an employee credential or authorization grant. Only Desktop app clients are
accepted for this path; confidential Web application credentials require a server implementation. Employee consent,
PKCE, state/nonce, signed identity/domain checks and encrypted per-employee Vault tokens remain required. The
preconfigured client alone does not enroll a Vault or grant access to any account.

The native **Organization Google connection setup -> Import OAuth client file** remains a fallback for development
or an administrator-managed client without a matching distribution credential. Main reads a selected file of at most
64 KiB and stores only the secret in a purpose-bound encrypted `google-client` Vault record. Policy, renderer state,
model-facing catalogs and browser URLs receive no secret or file path. Token grants use Google's fixed endpoint.
Import retains Vault enrollment, shared-device, suspension and executable-tool guards. Web JSON and mismatches are
rejected; importing for the same client replaces its stored value. Account disconnect and Google revocation remain
separate operations.

### Workspace services and restricted cohorts

The bundled policy offers Gmail, Drive, Docs, Sheets, Slides, Forms and Apps Script alongside the original app-managed
documents, read-only Calendar and Tasks. This offers choices; it does not widen existing account grants. Employees opt
in through Google consent, and the host separately checks the selected service intent, including draft versus send.
Administrators can restrict the offering to an approved cohort with a `googleWorkspace` object. It replaces the whole bundled
configuration, so it repeats the public client ID and domain. Policy contains no secret: installed-app client IDs are
public; a required native client credential comes from the installer build or local Vault fallback described above.

```json
{
  "googleWorkspace": {
    "clientId": "991643024129-1gd4866dn064tm72kjtavsu6qpgpa1hp.apps.googleusercontent.com",
    "domains": ["step.cmu.ac.th"],
    "services": ["documents", "drive-read", "gmail-read", "calendar-read", "tasks"]
  }
}
```

- This example restricts Gmail and Drive to read-only. Remove services to prohibit them. `gmail-draft`, `gmail-send`
  and `gmail-manage` are separate employee intents even though Google's compose/modify scopes can also send.
  `drive` manages files/sharing, `docs`/`sheets`/`slides` grant their native app surfaces, `forms` edits forms/reads
  responses, and `appscript` manages projects/deployments. Each write still asks every time, including Full auto.
- Before connecting: in the organization's Google Cloud project, confirm this Desktop OAuth client, enable the APIs
  needed (Gmail, Drive, Docs, Sheets, Slides, Forms, Apps Script, Calendar and Tasks), and set the OAuth audience.
  `gmail.readonly` and `drive.readonly` are restricted scopes:
  an External audience needs Google verification. In Admin Console, **Security -> Access and data control -> API
  controls**, allow this client for the cohort.
- Employees choose **Change allowed services** on their existing account and tick the new services; the OAuth result
  must match that account's Google subject. Existing grants are not widened silently. Read-only Calendar remains the
  default; event creation still requires an administrator to offer `calendar`.
- This uses the built-in `google_workspace` tool. It needs no MCP server (`features.mcp` stays off) and no CLI.

See [Workspace functions](google-workspace-functions.md) for the supported operations, transfer limits and Apps Script
API Executable requirements. No production Google Cloud API or Workspace Admin setting is changed by a source update.

An API-only profile remains in its existing OS-encrypted key store until the employee explicitly remembers a website account or connects Workspace. That first enrollment activates Vault protection and migration; the existing cross-session executable-tool restrictions persist even after pause, feature disable or deletion. Startup/first key use retries migration for an already protected profile; authoritative references never fall back to legacy secrets.
