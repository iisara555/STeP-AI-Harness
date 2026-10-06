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

Default modes are `ask`, `acceptEdits`, `plan` and `auto` (Full auto), with `ask` selected. `autoMode` defaults to true so Full auto is offered, as in other AI coding apps; terminal commands still ask unless `shellByAi` is on. `shellByAi`, `autoMerge`, `autopilot`, `sandbox`, `mcp`, `lineGateway`, `voice`, `copilot`, `compatibleProviders`, `cron`, `coordinator`, `memoryTeam` and `autoRouting` default to false. `vision` defaults to true. `autoUpdate` defaults to true: the installed app checks the `desktop-latest` release for a newer version, downloads it in the background and offers "restart to update"; set it to false where IT rolls out versions centrally. `providerPresets` defaults to true: employees may connect well-known AI services (OpenRouter, DeepSeek, Qwen on Alibaba Cloud Model Studio international, MiniMax international, Groq, Mistral, xAI and a local Ollama) at their fixed official endpoints with their own key, or sign in with OpenRouter, which issues a key through its OAuth PKCE page; set it to false to offer only ChatGPT, Claude, Gemini and administrator-approved endpoints. Preset endpoints are refused while `network.proxyUrl` is set. `receiptVision` defaults to true: with `vision` on and `checks.privacy` off, the Receipt page sends the receipt image to the connected AI for a second reading after a one-time consent; set it to false to keep receipts on the local OCR only. `claudeSubscription` defaults to false: when true, employees may chat on their own Claude plan through the official Claude Code installed on the machine (see [claude-subscription.md](claude-subscription.md); `scripts/pilot/enable-claude-code.ps1` / `.sh` set it). `learningReview` defaults to false: when true, each employee may turn on the background learning review in the Learning Inbox, which drafts lessons from a task every 10 user turns (at most 10 reviews a day, each a model call on that employee's account) as pending proposals only ([desktop-learning.md](desktop-learning.md)). `ocrTrial` defaults to false: when true, the Receipt page shows the OCR trial and measurement tools (local-only reads and a field-by-field trial report saved as JSON) for the team running the OCR pilot; employees do not see them otherwise. `toolLoop` defaults to true and enables the [Phase 2 host tool loop](desktop-tool-loop.md), with independent outgoing-data consent and human-reviewed file changes. [Phase 4 automation and tools](desktop-automation.md) implements coordinator, cron, MCP, sandbox and gated autopilot. Other feature flags grant permission and do not establish that future implementations are available.

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
