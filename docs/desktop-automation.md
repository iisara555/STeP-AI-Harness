# Coordinator, scheduled drafts, MCP, sandbox and autopilot

Phase 4 adds local orchestration to the Phase 0–3 governed Desktop host. It does not establish a production release. Features remain disabled until an administrator enables them in the managed policy file described in [Desktop policy](desktop-policy.md).

## Coordinator

In Draft mode, select **แบ่งงานย่อย** in the conversation context bar. The first send requires consent. The planner uses the currently selected account through `WorkService`, then a second approval displays the proposed task graph. There are at most eight subtasks. Each has an independent session, the same account/model/team, and no inherited identifier exceptions or consent tokens. The shared service limit is three concurrent provider runs across ordinary chats, coordination and scheduled work.

Explicit Playbook `consumes`/`produces` declarations determine dependencies. Missing declarations create sequential barriers. Repeated artifact names represent versions; consumers use the nearest earlier producer. Action steps are rejected. Model-generated plans cannot select trusted Skills or grant authority. Each child passes through routing, source privacy and the governed provider. Results are merged into a parent proposal for human review. Child and merge calls cannot run tools, native web search, memory retrieval or hidden workspace preferences. Cancellation and policy/workspace/account/model changes stop active children. Partial child drafts remain available for inspection; they are not business approvals.

## Background drafts and schedules

Open **งานเบื้องหลัง** from a conversation or **งานเบื้องหลังและเครื่องมือเพิ่มเติม** in Ctrl+K. Create, edit, pause, remove, run or cancel a job and inspect its history. The UI offers hourly and daily/weekday 09:00 Thailand presets. The host uses five-field UTC cron syntax (`minute hour day month weekday`), supporting lists, ranges and steps. DOM and DOW use standard OR semantics when both are restricted; Sunday is `0`. Schedules without a match within 370 days are rejected.

Enabling a schedule requires explicit approval of its request, account and workspace. Only text passing the local privacy check unchanged can be stored as a scheduled request. Running a paused job manually requires fresh approval. Scheduled work shares the three-run service limit; the background queue executes one job at a time and permits up to 50 jobs/queued entries. It binds account/model/team/workspace, records up to 200 runs and opens the resulting draft from history. A Desktop notification reports completion or attention without including the request, result or personal data.

Scheduling operates while the application is open. Overdue ticks coalesce into one run. Restart marks queued/running history interrupted and advances missed schedules; it never replays missed work. Changing the bound context requires resaving the job. Active context or policy changes cancel generation. Plan permission mode blocks draft execution. Scheduled jobs cannot use tools, native search, memory, publish, export or accept proposals. They still pass prompt hooks and routing/authority checks.

## MCP

Only `policy.mcpServers` can supply servers. Both stdio and Streamable HTTP use the pinned `@modelcontextprotocol/sdk` 1.31.0 client. The implementation targets the SDK's supported MCP protocol versions, not every newer protocol revision. No runtime installation or OAuth flow is initiated by discovery. Stdio receives an isolated empty home and a minimal environment. HTTP forbids redirects and alternate origins/paths. Credentials stay in administrator-managed headers and are never returned to the renderer. The client advertises no sampling, roots or elicitation capabilities.

Every discovery and call passes the host permissions and pre/post tool hooks. Separate destination consent is always required, including in auto mode. Calls accept only privacy-clean arguments, reject protected paths and denied commands, and never retry uncertain execution. Discovery may reconnect at most twice. Lists are capped at 100 tools, responses at 1 MB transport/200 KB call output and requests at 30 KB. When more than 12 tools exist, `mcp_search` returns only 12 matching descriptors. Server descriptions, schemas, annotations and results remain untrusted data; read-only annotations do not grant permissions. New results require privacy review and fresh consent before transmission to the AI provider.

The tool protocol supports `mcp_search(input=server,args.query=terms)`, `mcp_search(input="")` to inspect configured server names, and `mcp_call(input=server,args.name=tool,args.arguments=object)`. The background/tools dialog also provides an attended search/call interface. Closing the app closes clients; Windows stdio process trees are terminated.

## Docker sandbox

The administrator must enable `features.sandbox` and set `sandbox.image` to a digest-pinned Linux image already installed on the Docker engine. The host uses `--pull=never`; it does not download an image or fall back to the employee's shell. A missing engine/image is an explicit failure.

```json
{
  "features": { "coordinator": true, "cron": true, "mcp": true, "sandbox": true, "autopilot": false, "autoMerge": false },
  "sandbox": { "image": "your-reviewed-image@sha256:REPLACE_WITH_THE_REVIEWED_64_HEX_DIGEST" },
  "mcpServers": [{ "name": "reviewed", "transport": "http", "url": "https://your-approved-server.example/mcp", "headers": {} }]
}
```

The placeholder image is intentionally invalid until replaced with a real reviewed digest. Never store credentials in source-controlled example files.

`sandbox(input=command,args.files=[relative paths])` and the attended dialog require command/file consent. The host creates a temporary workspace snapshot of at most 20 selected UTF-8 text files, 200 KB each/2 MB total. Protected paths, symlinks/hardlinks, binary files and privacy findings are rejected. The snapshot is mounted read-only at `/workspace`, rather than exposing employee profiles or the entire writable workspace. Container root is read-only; networking is `none`, capabilities are dropped, privilege escalation is disabled, the user is non-root and CPU/memory/PID/time/output limits apply. Scratch storage is bounded tmpfs. Results return as text only; there is no automatic host-file application. Cancellation removes the owned container and snapshot.

This requires a compatible Docker engine and a Linux image with `/bin/sh`. Synthetic runner tests establish host argument construction and cleanup, not live container isolation on every operating system. The existing Terminal shell filter remains a separate capability.

## GitHub autopilot

The packaged entrypoint is `step-ai autopilot`; repository operators may also use `node scripts/autopilot/run.js`. Default behavior is read-only. It reads public-repository metadata, up to 50 open issues and 50 open PRs, scores issues carrying `autopilot:approved`, rejects `human-gate`/`autopilot:blocked` issues, and avoids branches already represented by an open autopilot PR.

```powershell
step-ai autopilot --repo owner/repository --dry-run
step-ai autopilot --repo owner/repository --issue 7 --files src/example.js,test/example.test.js --execute --approve-provider --coder codex --attempts 2
```

Execution requires an administrator-owned policy with `features.autopilot=true`, a clean checkout matching the public GitHub remote, explicitly selected code paths, and `--approve-provider` for the CLI account/quota. The second command creates a local review commit and dashboard, not an external PR. Selected file contents and the issue must pass privacy review unchanged. Credentials, employee context, profiles, linked files, excluded paths and unselected changes cannot be committed.

The coder uses `codex exec` in read-only mode with native shell/apps/browser/MCP/multi-agent features disabled, or `claude -p --tools ""`. It proposes JSON replacements for explicitly approved files. The host validates path allowlists, policy denials, privacy, size and original SHA256 before writing to a new `codex/autopilot-*` worktree. Unsupported CLI flags fail without an unsafe fallback. Local `npm test` and `npm run validate` run under an isolated child profile, and their original script definitions cannot be weakened. Dependencies must be available for the chosen repository's checks; dependency provisioning is not silently performed. The total coding attempt limit is 1–3, including local/CI repairs.

Managed denied-command patterns apply before controller command execution. Command/HTTP managed tool hooks run around actions with metadata only; blocking hooks stop work. A managed prompt hook is rejected by this detached CLI because it lacks a governed prompt-hook provider context. Use the attended Desktop host for such a policy. Native provider customizations cannot replace host governance. Provider CLI flag compatibility, actual tool denial and account billing require authorized live acceptance.

`--approve-publish` additionally permits a non-force branch push and a draft PR labeled `human-gate`, after rechecking issue approval. The configured GitHub label must already exist. CI is watched with a timeout and a bounded repair budget. `--approve-merge` requires managed `autoMerge=true`, an approved review, clean merge state, a non-draft PR and human removal of `human-gate`. Merge binds the observed head SHA. The controller never removes that label or marks the PR ready on behalf of the reviewer. It preserves the worktree for recovery and writes escaped HTML/JSON status to ignored `output/autopilot/`; no issue body, source or credentials appear in the dashboard.

After a human finishes review, continue an existing autopilot PR with `step-ai autopilot --repo owner/repository --pull-request 123 --execute --approve-merge`. This path checks CI and requires an approval for the exact head commit; it starts no model call. Controller Git commands disable local hooks/fsmonitor, and push destinations are rechecked. Worktree/profile isolation alone is not OS isolation for repository test code; use only reviewed repositories and scripts.

The local tests use disposable Git repositories, synthetic coder replies and synthetic GitHub reads. They do not publish fixture PRs, merge remote branches or consume live AI quota.

Protocol/container references: [MCP SDK client](https://ts.sdk.modelcontextprotocol.io/client), [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [Docker container run](https://docs.docker.com/engine/containers/run/), [Docker none network](https://docs.docker.com/engine/network/drivers/none/).
