# Providers, command surfaces and the LINE draft gateway

Phase 5 adds optional, administrator-controlled surfaces to the development preview. Local fixtures establish code behavior; they do not establish live provider entitlement, voice accuracy, organizational LINE delivery or a packaged release. See [validation](../desktop/VALIDATION.md) and [handoff](openharness-handoff.md).

## Provider profiles

`compatibleProviders`, `copilot`, `headless`, `voice`, `skillPacks` and `lineGateway` default to `false`. Existing OpenAI, Claude and Gemini connections keep their existing governance. New endpoints require exact protocol/base URL approval in the administrator-owned policy, plus the employee's ordinary connection/content consent. Keys and GitHub OAuth tokens use Electron `safeStorage`; they never appear in renderer snapshots or logs.

```json
{
  "features": { "compatibleProviders": true, "copilot": true, "headless": true },
  "providers": {
    "compatible": [
      { "name": "Local Ollama", "baseUrl": "http://127.0.0.1:11434/v1", "protocol": "openai" },
      { "name": "Approved Anthropic endpoint", "baseUrl": "https://api.anthropic.com/v1", "protocol": "anthropic" }
    ],
    "copilot": { "clientId": "REPLACE_WITH_ORGANIZATION_OAUTH_APP_ID" }
  }
}
```

Create and review the organization's OAuth App and enable device flow before substituting its client id. STeP does not reuse a first-party GitHub client id, scrape Copilot credentials or call an unofficial private API. The official SDK is pinned to `@github/copilot-sdk@1.0.16`; its bundled runtime reports version `1.0.90`. Device authorization uses fixed GitHub URLs, cancellation/expiry, minimum polling intervals and `slow_down` backoff. SDK sessions use `mode: empty`, explicit tokens, no logged-in account discovery, no native tools, MCP servers, file hooks, host Git operations, skills/config discovery, telemetry or remote sessions. Copilot account/subscription acceptance remains a live gate. See [GitHub SDK authentication](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate) and [device authorization](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

Compatible REST profiles currently reject a configured `network.proxyUrl` rather than bypassing it. Approved proxy transport support for these profiles remains an integration gap; the existing native-provider proxy behavior is unchanged.

Compatible profiles use bounded UTF-8 SSE over `fetch`: OpenAI `/chat/completions` or Anthropic `/messages`, appended to the configured API base. HTTPS is required except exact loopback HTTP for local services. Embedded URL credentials, query strings, redirects and provider-native tool calls are rejected. Input is text only; image and public-web-search requests return an unsupported-capability error. Completion markers, bounded output, usage, cancellation and typed network/auth/rate errors are checked. The output token request is 8192; providers may differ in support. Models are supplied explicitly. Ollama keys are optional; Anthropic keys are required. See [OpenAI API](https://developers.openai.com/api/reference/resources/chat) and [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming).

## CLI and readiness

`step-ai ask "<latest request>" --dry-run --json` returns the ordinary compact routing contract plus `dryRun`: readiness, blockers, warnings, next actions and script-aware input/output token and cost estimates. It does not contact a provider. Desktop uses the same preflight for its debounced composer review. Desktop estimates cover the current query, not its complete session/attachments; the final send still performs the existing privacy, context and destination checks. Missing administrator prices are reported as unknown. Estimates never authorize a transmission, charge or business action.

```powershell
step-ai run "Prepare a public draft" --base-url http://127.0.0.1:11434/v1 --model APPROVED_LOCAL_MODEL --approve-provider --approve-destination --output-format stream-json
step-ai run "Prepare a public draft" --base-url https://approved.example.invalid/v1 --model APPROVED_MODEL --api-key-env STEP_DRAFT_KEY --approve-provider --approve-destination --output-format json
```

Place boolean flags after the request/value arguments as shown. Keys come only from the explicitly named environment variable; the runner does not search personal provider profiles or ambient API-key variables. `text`, `json` and newline-delimited `stream-json` are supported. Stream records carry start/step metadata; draft text is emitted only after outbound privacy review. Interrupted/failed streams do not produce a usable partial draft. SIGINT/SIGTERM cancel the run.

The shared runner is used by CLI, LINE and the attended Golden evaluation bridge. It routes the latest query, loads only selected instructions/mandatory references, refuses authority/action steps, runs blocking metadata-only hooks and requests a text draft with no native tools. CLI/headless paths reject prompt hooks that require an attended host. The Golden bridge retains the existing `WorkService` governance, proposals, traces and grading. A run needs `headless`, an approved compatible destination and explicit provider/destination consent. Budgeted headless runs reserve estimated usage in a private, cross-process ledger; successful reported usage settles the reservation. Missing usage or failures retain estimates. A cost budget without approved prices blocks. This is a conservative local control, not proof of an exact provider bill.

Clarification returns a waiting result without contacting the provider. Re-run the same CLI query with accumulated `--answer "<clarification answer>"`; it uses the ordinary clarification gate. LINE retains a private `needs-input` job for the operator to collect/submit the employee's answer. It does not automatically deliver clarification messages or replay previous turns.

## Commands and voice

`desktop/src/commands.ts` is the shared registry for the Ctrl+K palette and keybindings. Open **Keyboard and Vim** from the palette to configure `Mod+Alt+Shift+k`-style shortcuts, disable a binding with an empty value, or restore defaults. `Mod` means Ctrl on Windows/Linux and Command on macOS. Unknown commands and duplicate bindings are rejected. Bindings invoke existing app actions; they cannot define shell commands. Dynamic Skill/model/session choices remain in the palette.

Vim is opt-in and composer-only: Insert initially; Escape enters Normal; `i/a`, `h/j/k/l`, `w/b`, `0/$`, `x` are supported. It does not replace artifact editing or claim full Vim compatibility. IME composition preserves native input behavior.

Voice is an on-demand local component using an administrator-reviewed, self-contained `whisper.cpp` executable and multilingual GGML model. Configure `voice.components["win32-x64"|"darwin-arm64"|"darwin-x64"|"linux-x64"|"linux-arm64"]` with separate `runtime` and `model` objects containing HTTPS `url` and lowercase 64-hex `sha256`. This phase does not provide a pre-approved organization download. Review the upstream license, build/dependencies and model before hosting pinned artifacts; see [whisper.cpp](https://github.com/ggml-org/whisper.cpp).

The normal component directory under app data contains versioned digest-bound installations. Downloads are bounded, redirected URLs are rejected, and both hashes are verified before activation and transcription. No installer embeds or automatically downloads a model. The employee approves installation and each microphone recording through host dialogs. Audio-only permission is temporary and bound to the main window; camera access remains denied. Recording is capped at approximately one minute, converted to mono PCM16/16kHz WAV, transcribed in an isolated temporary directory, privacy checked and deleted. The transcript returns to the composer for editing, never automatic sending. Policy reload/shutdown revoke permissions and cancel work. Hardware, multilingual accuracy, native builds and microphone permission behavior need live acceptance. Voice synthesis/read-aloud is not included.

## Governed Skill Packs

```powershell
step-ai plugin install C:\Reviewed\public-writing --name public-writing
step-ai plugin list
step-ai plugin enable public-writing --approve-enable
step-ai plugin enable public-writing --approve-enable --approve-hooks --approve-agents
step-ai plugin enable public-writing --disable
step-ai plugin export public-writing C:\Exports\new-claude-skills --approve-export
```

Import explicitly selects a local pack directory, one `SKILL.md` directory or a text-only `.claude/skills`/`anthropics/skills` subtree. It does not fetch or automatically enable third-party repositories. Name an imported subtree with `--name`; a native pack supplies `pack.json`. Supported interchange is bounded UTF-8 text assets: binary dependencies, credential/private files, links/hard links and native `tools`/`allowed-tools`/authority declarations are refused. Large/mixed upstream packs need a reviewed compatible subset. The original layout/references are retained; scripts are stored as inert text and are not automatically executed. See [Anthropic skills](https://github.com/anthropics/skills).

```json
{
  "schema_version": 1,
  "name": "public-writing",
  "version": "1.0.0",
  "skills": [{ "id": "public-draft", "path": "skills/public-draft/SKILL.md" }],
  "hooks": [],
  "agents": []
}
```

Skills and agent Markdown require matching `name` and nonempty `description` frontmatter. Command/HTTPS hook definitions allow approved event, timeout, priority and `blockOnFailure: true`; no credential headers are imported. Limits are 120 text files, 200KB/file, 2MB total, 40 Skills, 20 agents and 20 hooks. Unknown manifest fields and path escapes fail closed.

Installed packs live under workspace `.step/packs/`, disabled initially. Enable requires `features.skillPacks`, the exact content digest in administrator policy `skillPacks.approvedDigests`, and explicit human confirmation. Hooks and agent templates require their separate switches. Digest changes invalidate enabled assets. Only explicitly enabled, administrator-reviewed hooks join Desktop's host HookEngine; native provider hooks stay disabled. Agent templates are selected draft source text, never native autonomous agents. The Desktop palette exposes install/list/enable/disable, explicit template selection and export; selected text goes through ordinary fresh source/destination consent. Packs cannot register routing authority or grant permissions.

Export writes Skills/references into a new directory with `skill-id/SKILL.md`, suitable for explicit review/import into `.claude/skills`. It never overwrites or enables a native provider directory. Third-party native execution needs separate review; STeP approval does not transfer to another client.

## LINE organization service

Deploy `gateway/line/run.js` only on an authorized organization server behind a TLS reverse proxy. The service itself binds loopback. Set managed `lineGateway`, `headless` and `compatibleProviders`, approved endpoints and an administrator-owned allowlist. Supported LINE hooks are HTTP only. Channel secrets and tokens are read exclusively from named process environment variables:

`STEP_LINE_CHANNEL_SECRET`, `STEP_LINE_CHANNEL_TOKEN`, `STEP_LINE_CHANNEL_ID`, `STEP_LINE_APPROVER_TOKEN` (at least 32 characters), optional `STEP_LINE_PROVIDER_KEY`, `STEP_LINE_ALLOWLIST`, `STEP_LINE_STORAGE`, `STEP_LINE_WORKSPACE`, `STEP_LINE_PORT` (default 8788).

`STEP_LINE_ALLOWLIST` is an administrator-owned JSON array; each entry contains an exact `lineUserId`, internal `employeeId`, approved `team`, `providerConsent: true` and compatible `profile` (`baseUrl`, `protocol`, `model`). Enrollment must reflect actual organizational/user transmission authorization. Protect storage/environment with the service account's ACLs; do not place them in Git. On Unix, private storage directories require the service owner and mode 0700. Launch explicitly with `node gateway/line/run.js --serve`; no service or channel is created by installing Desktop.

`POST /webhook` checks exact raw-byte HMAC-SHA256 `X-Line-Signature` before parsing, channel id, recent timestamps, bounded events and user allowlist. Group/room messages, unknown users and unsupported media are refused/ignored. Event hashes persist for deduplication; interrupted jobs are not silently replayed. Requests run in separate private user sessions, with three global workers and serialized work per user. Query/history/source from another user is never reused. No model write/shell/native tools are exposed. Inbound text and outbound drafts undergo privacy and routing/authority checks.

File content is retrieved from LINE's fixed content API, bounded to 25MB and written to private temporary storage. TXT/MD/CSV/PDF/DOCX use `evaluateDocumentPrivacy`; all attachments require an operator to review source and destination before provider transmission. Unsupported media, PII, blocked/partial extraction and unreadable documents do not reach the provider. Reviewed private files are removed after processing. The attachment review report includes extraction limitations; it does not claim full layout/image/metadata sanitization.

The service generates pending drafts. **It does not automatically reply or push messages.** A human operator accesses the following loopback-only endpoints using `Authorization: Bearer <STEP_LINE_APPROVER_TOKEN>`:

- `GET /pending`: private draft/source/extraction review information; do not expose this route through the public reverse proxy.
- `POST /approve-input/<job-id>` with `{"reviewedSource":true,"approveDestination":true}`: approve an attachment after inspecting its local original and extraction.
- `POST /answer/<job-id>` with `{"answer":"<employee clarification answer>"}`: re-route a waiting request with accumulated answers (maximum five). Only the job's current allowlisted employee/profile can resume it.
- `POST /approve/<job-id>` with `{"approveDelivery":true}`: re-check current policy, outgoing privacy and routing authority, then deliver a maximum of five 5000-character text messages through LINE's push API. This is the actual human delivery gate, not an AI approval.

Delivery uses a job-bound retry key. Ambiguous failures become `delivery-unknown` and need operator inspection; no automatic uncertain retry. Full channel configuration, employee mapping, reverse-proxy exclusions, LINE permissions/quota, organizational approvals, audit/retention operations and real delivery remain Phase 6/live acceptance work. The included signed local HTTP/API fixtures use no real channel token or delivery. See [LINE signature verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/) and [Messaging API](https://developers.line.biz/en/reference/messaging-api/).

## Local verification entry points

`node --test test/phase5.test.js` covers REST streaming, preflight/headless/CLI, budgets, packs and signed LINE HTTP workflows with synthetic fixtures. `desktop/test/phase5.test.ts` covers managed policy, OAuth/SDK denial options, command/Vim behavior, verified component lifecycle and voice privacy. `desktop/test/phase5-smoke.mjs` uses real Electron/IPC/SQLite plus a loopback compatible provider, readiness, custom keybindings, Vim, pack source consent and voice approval refusal. Run the full existing suites as described in the handoff. Preserve live, packaging and production acceptance as separate evidence.
