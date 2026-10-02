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

Default modes are `ask` and `plan`, with `ask` selected. `autoMode`, `shellByAi`, `autoMerge`, `autopilot`, `sandbox`, `mcp`, `lineGateway`, `vision`, `voice`, `copilot`, `compatibleProviders`, `cron`, `coordinator` and `memoryTeam` default to false. `toolLoop` defaults to true and enables the [Phase 2 host tool loop](desktop-tool-loop.md), with independent outgoing-data consent and human-reviewed file changes. [Phase 4 automation and tools](desktop-automation.md) implements coordinator, cron, MCP, sandbox and gated autopilot. Other feature flags grant permission and do not establish that future implementations are available.

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

## Pilot mode

Standard consent, first trialled as pilot mode, is now the default. Administrators can set `{ "pilot": false }` to return to strict mode, with the extra dialogs in the first column below. Any value other than `true` or `false` rejects the whole policy. A change applies on the next policy reload.

| | Strict (`"pilot": false`) | Standard (default) |
|---|---|---|
| First send on this computer | Dialog | One-time acknowledgment on the last setup-wizard step. Skipping the wizard keeps the first-send dialog |
| Text attachment or pasted source | Dialog per send | No dialog unless the privacy review flags it |
| Image attachment (vision) | Dialog | Dialog |
| Sensitive word with no person identifier | Dialog | Sent with a warning notice |
| Name table or unresolved person identifier | Dialog | Dialog |
| Several AI workers (coordinator) | Dialog | Dialog |
| Saved preferences (`STEP.md`, `AGENTS.md`, `ASSISTANT.md`, output style) and confirmed memories | Dialog per task, listing the files and memory names | Sent without a dialog, like custom instructions and memory in Claude and ChatGPT. They pass the same privacy check when loaded; anything with personal data or secrets is refused |
| Masked national ID, phone or e-mail | Masked, notice | Masked, notice |
| Tool results sent to the AI | Per source; "this run" unchecked | One answer covers every clean result in the run; the "this run" box starts checked. Results with findings still ask each time |
| Plan approval (`plan` tool) | Dialog | No dialog. The plan is noted but not stored as approved; it never granted anything beyond drafting |

These floors are the same in both modes and covered by `desktop/test/pilot.test.ts` and `desktop/test/policy-smoke.mjs`:

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
