# Experimental Gemini via Antigravity adapter

STeP has an `AntigravityAdapter` and a separate `antigravity` subscription connection in Setup and Settings. It uses official `agy` NDJSON. Existing Gemini API and organization Gemini CLI connections retain their behavior.

**Status: experimental. Since 2026-10-05 the init tool catalog no longer blocks the request (owner decision, see below). Live generation still needs acceptance on a signed-in machine.**

## Implemented behavior

- Discover an installed native `agy` or accept an explicitly selected runtime. Require version 1.2.14 or newer, subscription mode and a pinned `gemini-*` model. No global installer, update command or native logout is run by STeP.
- Create a fresh configuration home and empty workspace for each invocation. A global custom `step-draft` agent carries host standing instructions separately from the user message. Personal MCP, plugins, skills, environment credentials and workspace files are not copied into the configuration home.
- Deny every documented native action namespace: file read/write, URL read/actuation, command, unsandboxed command and MCP. No shell, ACP, permission bypass or conversation continuation is used.
- Withhold the user message until `init` confirms the expected cwd, agent and `strict` mode (`ANTIGRAVITY_POLICY_UNCONFIRMED` otherwise). The declared tool catalog is not required to be empty: the CLI always lists its built-in tools. Enforcement is the denied permissions, the empty temporary workspace, and stopping on the first tool step (`TOOL_DENIED`).
- Send one NDJSON user message on stdin, then close stdin. Stream text deltas once and require the final text to agree with them. Completion requires one successful result and process exit 0. Usage is reported once per invocation. Malformed messages, tool steps, duplicate results, extra turns, mismatched sessions and nonzero exits cannot produce readiness.
- Bound output and lifetime; terminate the owned process tree on cancellation and wait before deleting its temporary home. Scrub diagnostic tails. Retain the home if shutdown cannot be confirmed.
- Reject vision and native web search explicitly. Existing routing, Privacy Gate, transmission consent and host tool permissions stay in force. This adds no recurring consent prompt.

## Account boundary

Consumer OAuth credentials belong to Antigravity's native OS keyring. STeP does not read, copy, serialize or log them, and does not call `/logout`. Disconnect/removal clears the STeP binding and local runtime files; the native Google account remains signed in. Separate STeP connections do **not** establish separate Google identities or keyring namespaces.

The native model catalog is bounded, deduplicated and filtered to Gemini. A catalog is not proof of account entitlement, OAuth refresh or generation readiness. Readiness requires successful generation. Account identity binding and native OAuth lifecycle acceptance remain open.

## Native evidence (2026-10-01)

The official Windows amd64 manifest selected **1.2.14**:

- [Binary](https://storage.googleapis.com/antigravity-public/antigravity-cli/1.2.14-4571742832820224/windows-x64/cli_windows_x64.exe)
- SHA-512: `908fcd591144c6df86506d7c135a486a2e4f4f606e09a9bcc5eb9bf943e385c06c94e0a218f29d8c5ba26db1406ee3a7aa2d08aa8685dadc37fe0fceda2fcf6f`
- Download and checksum verification passed in ignored QA storage; no global installer was run. Native help confirms stream JSON and slash-command disabling.
- Isolated settings were observed: setting `toolPermission: strict` changed `init.permission_mode`. The global agent was discovered by `agy agents`.
- Neither `tools: []` nor `tools: [finish]` narrowed the init tool catalog. This does not prove that tools executed or that they are disabled. The adapter therefore returned **`ANTIGRAVITY_TOOLS_UNAVAILABLE` before writing the user message**.
- **0 reported tokens**, **11 Gemini catalog entries**. OAuth refresh, account identity and generation were not tested. Zero reported tokens is not a billing measurement.
- The binary, private probes and metadata-only evidence are ignored under `desktop/release/qa/antigravity/`; they are not dependencies or release assets.

## Follow-up (2026-10-04): `excludeDefaultComponents` on 1.2.17

- The latest official CLI is **1.2.17** (`antigravity-cli/latest` → `1.2.17/manifest.json`). Its [changelog](https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md) for 1.2.15–1.2.17 does not mention narrowing the `init` tool catalog.
- Since **1.2.1**, custom agents accept `excludeDefaultComponents: true`, which opts out of default prompt sections and **built-in tools**. The adapter had not set it. `step-draft` now declares it alongside `tools: [finish]`.
- The Linux x64 1.2.17 binary (SHA-512 verified against the manifest) lists `step-draft` with the new frontmatter. A headless run stops at `authentication required` before any `init` event, so whether the catalog now narrows to `finish` could not be observed without a signed-in Google account.
- Nothing is relaxed. The `init` check still withholds the user message unless the runtime declares nothing but `finish`. If the option does not narrow the catalog, the connection keeps failing with `ANTIGRAVITY_TOOLS_UNAVAILABLE` exactly as before.
- **To accept:** on a machine signed in to Antigravity, connect "Gemini via Antigravity (experimental)" in STeP Desktop and send a short message. A reply means `init` declared only `finish`. `ANTIGRAVITY_TOOLS_UNAVAILABLE` means it did not. Record the result here before changing experimental status.

## Live acceptance (2026-10-05): failed on Windows

- Owner's Windows machine, STeP Desktop 0.5.13 (includes `excludeDefaultComponents`), official CLI installed with `install.ps1` and signed in to a personal Google account.
- Connecting "Gemini via Antigravity" reached `init` (sign-in worked) and returned **`ANTIGRAVITY_TOOLS_UNAVAILABLE`**: the init catalog still declared native tools beyond `finish`. No user message was sent.
- So neither `tools: [finish]` nor `excludeDefaultComponents: true` narrows the catalog on the current CLI.
- **Owner decision (Itsara, 2026-10-05):** accept a non-empty catalog and rely on runtime enforcement instead: `strict` mode confirmed in `init` (which proves the isolated settings with every native action namespace denied were loaded), an empty temporary workspace with `allowNonWorkspaceAccess: false`, and terminating the process on the first step that reports a tool (`step_type: tool`, `tool_name` or `tool_call`). Residual risk: STeP relies on the CLI honouring its deny rules; this cannot be proven from STeP's side. Re-run live acceptance after this change and record the result here.

## Validation

- **231 Desktop unit tests passed**, zero failures/skips. Eight adapter groups cover transport, policy preflight, invalid/error streams, usage, cancellation, unsupported inputs, catalog handling, readiness, shared-account disconnect and parallel isolation. A Linux CI failure exposed a shared ChatGPT browser-error race; cancellation now waits for acknowledgement and ignores late successful callbacks, with a delayed-ack regression test.
- The new Electron smoke passed through the actual renderer, preload, IPC and adapter with a synthetic runtime. It verifies selection/model persistence, successful connection, unsafe reconnect without a second prompt, invalid mode/model rejection, the old Gemini eligibility gate and local disconnect semantics.
- Formatting, TypeScript/build and both repository validators passed. The existing renderer bundle-size warning remains. Native Windows checks establish the incompatibility above, not live provider acceptance or macOS/Linux native acceptance.

## Remaining acceptance

1. Obtain a provider-supported way to confirm that native tools are disabled before releasing a user message. Verify real file, command, MCP, browser and delegation denial. Do not remove the init check or rely on Markdown instructions as enforcement.
2. Verify OAuth refresh and account identity boundaries using the authorized personal Google account after isolation is accepted. Keep native credentials private; distinguish STeP disconnect from provider logout.
3. Run bounded live generation and shared feature evaluation, then verify native lifecycle and packaging on Windows and macOS before changing experimental status.

No main merge, production policy change, installer or release is included. Gemini API remains the currently available Google route.

## Official references

- [Consumer Gemini CLI deprecation](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals): personal Google and Google AI Pro/Ultra CLI service ended June 18, 2026; organization Standard/Enterprise remains separate.
- [Headless protocol](https://antigravity.google/docs/cli/headless/): NDJSON events, results, exit handling and default workspace tool permissions.
- [CLI permissions](https://antigravity.google/docs/permissions?tab=cli): supported action namespaces and deny precedence.
- [Custom agents](https://antigravity.google/docs/subagents?tab=cli): global discovery, system instructions and declared tool limits.
- [Installation and authentication](https://antigravity.google/docs/cli/install/): native OS keyring sign-in and shared native logout.

The Python SDK documents API-key/Vertex routes; it does not establish a personal-keyring OAuth substitute for this CLI integration.
