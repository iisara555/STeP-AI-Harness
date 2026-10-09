# Experimental Gemini via Antigravity adapter

STeP has an `AntigravityAdapter` and a separate `antigravity` subscription connection in Setup and Settings. It uses official `agy` NDJSON. Existing Gemini API and organization Gemini CLI connections retain their behavior.

**Status: experimental. Since 2026-10-05 the init tool catalog no longer blocks the request (owner decision, see below). Live generation still needs acceptance on a signed-in machine.**

## Implemented behavior

- The current adapter is text-only and rejects image input before transmission. The receipt page uses local OCR followed by masked candidate-token reconciliation, including the expense description, and states this mode explicitly. It does not claim Antigravity read the receipt image. Direct image reading remains available through an image-capable connection such as Gemini API/ACP.
- Discover an installed native `agy` or accept an explicitly selected runtime. Require version 1.2.14 or newer, subscription mode and a pinned `gemini-*` model. No global installer, update command or native logout is run by STeP.
- Create a fresh configuration home and empty workspace for each invocation. A global custom `step-draft` agent carries host standing instructions separately from the user message. Personal MCP, plugins, skills, environment credentials and workspace files are not copied into the configuration home.
- Deny every documented native action namespace: file read/write, URL read/actuation, command, unsandboxed command and MCP. No shell, ACP, permission bypass or conversation continuation is used.
- Withhold the user message until `init` confirms the expected cwd, agent and `strict` mode (`ANTIGRAVITY_POLICY_UNCONFIRMED` otherwise). The declared tool catalog is not required to be empty: the CLI always lists its built-in tools. Enforcement is the denied permissions, the empty temporary workspace, and stopping on the first tool step (`TOOL_DENIED`).
- Send one NDJSON user message per attempt on stdin, then close stdin. Buffer text deltas and require the final text to agree with them; publish only the validated successful attempt. Completion requires one successful result and process exit 0. Usage is reported when available per attempt. Malformed messages, tool steps, duplicate results, extra turns, mismatched sessions and nonzero exits cannot produce readiness.
- Guide the model to plain text and host-provided `step-tool` requests. A `TOOL_DENIED` attempt is stopped and cleaned up before one fresh attempt with recovery instructions, using the same original request and shared deadline. No native tool arguments or partial answer are carried forward. Quota/authentication, invalid-policy and uncertain-shutdown failures are not retried. A second tool denial produces a localized explanation. This can consume one extra provider request; an interrupted attempt may not report its usage.
- Bound output and lifetime; terminate the owned process tree on cancellation and wait before deleting its temporary home. Scrub diagnostic tails. Retain the home if shutdown cannot be confirmed.
- Reject vision and native web search explicitly. Existing routing, Privacy Gate, transmission consent and host tool permissions stay in force. This adds no recurring consent prompt.

The recovery checks use synthetic NDJSON runtimes and real local Electron chat/host tools. They establish bounded fallback and preserved host boundaries, not live model compliance or successful recovery on employee Windows/macOS accounts. Antigravity remains experimental. Text is displayed after final validation, so an in-progress response can remain in the waiting state longer than a streamed reply.

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
- **Retest (2026-10-05, PR #99 test build, Windows):** connect and test returned a real reply. Black console windows flashed on every message. Process listing on the owner's machine showed `agy.exe --bg-updater` started by the run. With the Windows 1.2.17 binary under Wine, the updater is skipped only when `~/.gemini/antigravity-cli/last_check.timestamp` was modified in the last 15 minutes; `AGY_CLI_DISABLE_AUTO_UPDATE=1` does not stop the spawn. Because every run uses a fresh home, STeP now writes that stamp into the home before each run.

## One-click install and sign-in (2026-10-05)

Owner request: staff should not install or sign in to the CLI by hand. `electron/antigravity-install.ts`:

- Installs the pinned CLI 1.2.17 into `<app data>/components/agy` when no agy 1.2.14+ is found. Assets and sha512 values come from `antigravity-cli/1.2.17/manifest.json`. Windows assets are the bare exe; macOS assets are a tar.gz whose binary is named `antigravity` and is installed as `agy`. The staged copy must answer `--version` as 1.2.14+ in an isolated home before it replaces anything. The managed copy is preferred over other installs.
- Sign-in state is read with `agy models` in an isolated home (exit 1 with "Please sign in" means signed out). The credential is in the OS keyring, so isolated homes still see it.
- The CLI has no login subcommand. Print mode with **piped** stdin refuses to start OAuth, but with stdin on the null device (`stdio: 'ignore'`) `agy -p` prints `Authentication required. Please visit the URL to log in:` and Google's sign-in address to stderr, then waits about 60 seconds for the sign-in to complete (checked with the Linux 1.2.17 binary on 2026-10-06; `--print-timeout` does not shorten that wait).
- **Browser first (2026-10-06):** STeP starts that hidden `agy -p` with the real profile, takes the first `https://accounts.google.com/o/oauth2/...` address from stderr (nothing else is ever opened) and opens it in the default browser, so there is no terminal window. It polls `agy models` every 3 seconds and stops the CLI as soon as the sign-in works; `--print-timeout 1s` cuts short the one-word prompt the CLI would otherwise answer once signed in.
- **Terminal fallback:** when the CLI prints no address within 20 seconds, or its minute runs out before the sign-in is usable, STeP opens the interactive CLI in a terminal window with the real profile (Windows: `cmd /c start /wait`; macOS: `open -a Terminal`). Its first screen is a menu, "Select login method: > 1. Google OAuth", so the progress text tells the person to press Enter once. STeP polls every 3 seconds for up to 5 minutes, then closes the Windows window (macOS leaves Terminal for the person to close) and runs the normal test.
- **The code paste (2026-10-06):** Google redirects to `https://antigravity.google/oauth-callback`, which shows an authorization code; the CLI then waits for `Or, paste the authorization code here and press Enter:`. A null-device stdin cannot take that paste, so 0.5.16 stalled there on a real Mac. STeP now runs `agy -p` behind a pseudo-terminal (`/usr/bin/script -q /dev/null …` on macOS, `script -qfec … /dev/null` on Linux), asks for the code in its own dialog and writes it to the CLI. A typed code reaches the token exchange (checked with the Linux 1.2.17 binary: a fake code returns `invalid_grant`). Up to three browser tries, then the terminal window. Windows has no pseudo-terminal without a native module, so it goes straight to the terminal window, whose progress text says to paste the code there.
- **Isolated home and the real sign-in (2026-10-06):** on a real Mac the Terminal sign-in succeeded but STeP's isolated `agy models` never saw it. Each isolated home now links `Library/Keychains` to the real one on macOS (unlinked first on cleanup) and copies `~/.gemini/antigravity-cli/antigravity-oauth-token`, agy's file storage when the keyring is unavailable (Linux without D-Bus logs `Using file-based token storage because no D-Bus session bus detected`). When `agy models` with the real profile succeeds twice while the isolated check fails, sign-in stops with `ANTIGRAVITY_SIGNIN_HIDDEN`.
- **Not yet verified on a real machine:** the browser-first sign-in on Windows and macOS (the null-device stdin behaviour was checked on Linux only), and on macOS whether the isolated home used by `agy models` sees the keychain sign-in made with the real profile.

## Efficiency (2026-10-09)

- The `--version` check runs once per agy binary (path, size and change time) instead of once per message, so each message starts one process instead of two. A replaced or updated binary is checked again.
- Usage now includes `thinking_tokens` as output (as Gemini's own `thoughtsTokenCount` is) and reports `cache_read_tokens` as cached input, so the usage page shows what the plan was charged and how much the prompt cache saved.
- `xhigh` is accepted as an effort level, matching `agy --help` on 1.2.17.
- Not changed, waiting on a signed-in check: `--input-format stream-json` can keep one process open for several turns, which would let the tool turns of a run continue in one process the way Codex does; `--json-schema` would constrain the OCR filter reply but may answer through a `finish` tool step that STeP stops; and whether a stream-json user message accepts images. Each needs one run with a real Google account before it is turned on.

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
