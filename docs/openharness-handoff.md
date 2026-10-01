# OpenHarness adaptation handoff

Updated: 2026-10-01. This document is sufficient to continue from another account without access to the earlier chat or its attachments.

## Current state

The approved goal is a complete, chat-centered STeP employee workspace with editable artifacts, governed provider routing, and OpenHarness-inspired capabilities. Keep the existing Router authority, Privacy Gate, host tool permissions and human approval boundaries. LINE is the planned organizational chat channel. Compatible endpoints are optional provider profiles independent of data classification.

Phases 0–3 are implemented and locally validated. The user explicitly authorized pushing this integrated baseline to `main`. This is a development preview, not a published release. Read [delivery status](openharness-parity.md) and check `git log origin/main` for the final integration commit. Phase 3's initial implementation is `3cb7dde`; the final follow-up also contains export validation, hard-link refusal, the memory editor smoke repair and this handoff.

Phase 4 is implemented on `codex/openharness-phase4` in [draft PR #82](https://github.com/iisara555/STeP-AI-Harness/pull/82), with implementation commits `d7086e6` and `f6185ca`, for review against the integrated `main` baseline `61846ce`. Phase 5 is implemented in `e83329f` on `codex/openharness-phase5`, stacked on Phase 4, in [draft PR #83](https://github.com/iisara555/STeP-AI-Harness/pull/83). See [providers and surfaces](desktop-phase5.md). **Phase 6 is implemented on `codex/openharness-phase6`; `codex/claude-oauth-followup` adds the browser-launch repair and successful authorized account evaluation. Next work is branch review and remaining product lifecycle/release acceptance.** Do not reimplement Phases 0–6. Live acceptance gaps below remain open and must not be represented as passing because local fixtures passed.

| Phase | Implemented baseline | Reference |
| --- | --- | --- |
| 0 | Combined the previous chat/Desktop and Harness development lines; preserved current main documentation | `359e34a`, `e6a6bf1` |
| 1 | Managed policy, Workbench permission gate, hooks, unified approvals and modes | [Policy](desktop-policy.md) |
| 2 | Bounded tool loop, parallel approved reads, document/spreadsheet/reference tools, approved draft plans, snapshots/previews, retry/backoff and usage | [Tool loop](desktop-tool-loop.md) |
| 3 | Context compaction, confirmed memory, workspace instructions/persona/styles, session resume/fork/search/export, local OCR and gated image input | [Context and memory](desktop-context-memory.md) |
| 4 | Bounded coordinator, app-open scheduled drafts, attended MCP/Docker tools and host-validated GitHub autopilot proposals | [Automation and tools](desktop-automation.md) |
| 5 | Compatible/Copilot provider adapters, shared headless runner/readiness, commands/Vim, local voice, governed packs and approved LINE drafts | [Providers and surfaces](desktop-phase5.md) |
| 6 | Bounded clean-read transmission consent, feature matrix and account-explicit evaluation | [Consent and evaluation](desktop-phase6.md) |

The connection follow-up is on `codex/chatgpt-gemini-oauth`, based on Claude follow-up `0a3cb8c` in [draft PR #85](https://github.com/iisara555/STeP-AI-Harness/pull/85). PR #85 passed all three CI jobs. The existing local ChatGPT account refreshed and generated one verified response; no STeP connection record was added. Gemini's consumer CLI route remains blocked by Google's deprecation, and its transport-only check is not live acceptance. See [ChatGPT/Gemini evidence](chatgpt-gemini-oauth-followup.md) for exact scope and remaining work. Continue from this follow-up branch after reviewing the stack; do not repeat the paid Claude matrix or treat the Golden output gate as passing.

## Phase 3 implementation map

- `desktop/electron/compact.ts`: the canonical `script-aware-estimate-v2` estimator, conservative input budget, older source/result previews, bounded same-provider summaries, fenced task state, pre/post hooks and a single reactive prompt-length retry. Required current sources and governance are never silently truncated; the original transcript remains intact.
- `desktop/electron/memory.ts`: bounded schema-v1 Markdown records; private, project and managed team scopes; strict privacy checks; TTL/relevance selection of at most five entries; explicit confirmation; local evidence-only preference proposals. Autodream is a local queue with no provider call or automatic durable write. Project memory is ignored by Git and inaccessible to general model file tools. Symlinks, junctions and hard-linked records are refused. Workspace-relative and absolute path denials check configured/canonical paths and rule prefixes, including mixed Windows 8.3/long names, missing memory folders and `.gitignore` updates.
- `desktop/electron/workspace-context.ts` and `src/modules/user-memory.js`: root-level `STEP.md`, `AGENTS.md`, `ASSISTANT.md` and a selected `.step/output-styles/<name>.md`; bounded reads; assistant-only preferences without employee profile data; existing persona preservation. No recursive instruction loading. Context transmission requires explicit consent and is invalidated by workspace/team/style/policy changes.
- `desktop/electron/store.ts`: SQLite FTS5 trigram search and legacy backfill; explicit resume without request/tool replay; independent fork with consent, approved plan, traces, identifiers and usage cleared; Markdown/JSON conversation export. Export blocks secrets, masks recognized identifiers and validates redacted JSON before writing.
- `desktop/electron/ocr-attachment.ts`, `ocr.ts`, `main.ts` and `providers.ts`: complete local OCR text before privacy review; optional transient PNG/JPEG/WebP image input behind `features.vision`, OCR checks and separate image review/consent; capability checks and synthetic Codex/Claude/Gemini wire validation. Raw images are excluded from summaries and persisted sessions.
- `desktop/electron/service.ts`, `workbench.ts`, `hooks.ts` and `desktop/src/memory.tsx`: host integration, approved draft-only task plans, numeric compaction hook metadata, loaded-context display and `/memory` management.

Memory is a preference or reference, never authority to act. Workspace instructions and summaries cannot override organization governance. Native provider file/shell tools remain disabled.

## Phase 3 validation already completed

| Check | Result | Boundary |
| --- | --- | --- |
| Harness regression suite | 808 passed, 6 platform skips, zero failures; 814 total | Managed worktree and isolated child user profile; initial Phase 3 commit |
| Desktop unit suite | 186 passed, zero failures | Includes context, memory/privacy/scopes, migration/search/fork/export, OCR and image policy |
| Electron smoke suite | All five scripts passed | Real renderer/preload/IPC/SQLite; synthetic providers and OCR responses |
| Desktop format check | Passed | Source/test formatting |
| Desktop TypeScript and production build | Passed | Existing Vite bundle-size warning remains |
| Repository validator | Passed | 51 Skills, resolved references/dependencies, package whitelist and likely-secret scan |

`desktop/VALIDATION.md` is the durable validation record. On this machine, ignored logs and screenshots are under `desktop/release/qa/phase3-*`; they are not required to continue from a fresh checkout. Local validation used Node 25.8.0. CI uses Node 20 for Harness and Node 24 for Desktop; inspect the workflows and the latest run on `main` rather than treating local results as CI results.

No paid API evaluation, live provider login/generation, release publication or production deployment was performed. No Phase 3 installer was rebuilt. macOS/signing/notarization, clean install and update/rollback remain unverified for this integrated baseline.

## Remaining Phase 3 acceptance

- Authorized live provider tests: account login/reuse/expiry/logout, streaming, cancellation, quota failure, runtime tool-denial, actual context-limit behavior and billed usage. Use disposable synthetic inputs and an explicitly authorized account/key/quota; never copy credentials into source, logs or documents.
- Actual OCR engine/document acceptance: Thai text, scans, handwriting, long PDFs, partial results and image privacy review. Synthetic OCR success does not establish recognition accuracy or visual PII detection.
- Team shared-folder ACLs/network behavior and cross-platform filesystem boundaries. Administrators must provision the folder and access; the app does not grant permissions.
- Live vision capability/entitlement and visual input quality. Original-image review must cover the full image because OCR cannot detect every visual identifier. Reference-image generation/editing is outside this feature.
- Packaged Windows/macOS installation, adversarial tool/attachment checks and broader document export layout acceptance. Follow the existing remaining acceptance sections in `desktop/VALIDATION.md`.

There is no known failing local Phase 3 check at handoff. These are acceptance gaps, not completed production gates.

## Phase 4 implementation: Coordinator, automation, sandbox and MCP

Phase 4 is a review branch; it has not been released or merged as part of the earlier Phase 0–3 main authorization. `desktop/electron/coordinator.ts` uses the shared `MAX_PARALLEL_RUNS` exported from `service.ts`; independent sessions and final-only merge retain routing/privacy/authority. `cron.ts` provides bounded CRUD/history, app-open ticks, context binding and interrupted-job recovery. `desktop/src/automations.tsx` exposes scheduled jobs and attended MCP/sandbox tools, with approvals rendered above the job dialog. Native notifications contain status only.

`mcp.ts` uses the pinned SDK for managed stdio/HTTP, destination consent, bounded discovery, no uncertain-call retry and process cleanup. `sandbox.ts` uses a reviewed, preinstalled digest-pinned image and only explicitly selected privacy-clean, read-only text snapshots. `src/modules/autopilot/index.js` and the CLI/operator entrypoints score approved public issues, isolate worktrees/test profiles, ask the CLI coder for JSON proposals with native tools disabled, validate paths/privacy/hashes before host writes, run unchanged validation scripts, and preserve review commits/dashboards. Publish and exact-head-reviewed merge are separately gated. A detached autopilot with a prompt hook fails closed rather than skipping the hook.

Completed locally: 200 Desktop unit tests; all six Electron smoke scripts; six new autopilot tests on disposable repositories; Desktop formatting, TypeScript/build and the 51-Skill validator. The isolated Harness regression passed with 814 tests and 6 platform skips (820 total); all three remote CI jobs passed for `f6185ca` in [run 36753076528](https://github.com/iisara555/STeP-AI-Harness/actions/runs/36753076528), with the platform counts recorded in `desktop/VALIDATION.md`. Fixtures establish local behavior, not live account/transport/container isolation or production acceptance.

The accepted requirements are retained here for traceability:

1. Add `coordinator.ts`: split a request into bounded subtasks and run the existing `WorkService`, up to three concurrent runs using the main host's `MAX_PARALLEL_RUNS`. Merge results through the governed provider path. Parallelize Playbook steps only when their declared `consumes`/`produces` dependencies permit it.
2. Add background AI task queues and notifications. Implement `cron.ts` CRUD, execution history and scheduling while the app is open. Scheduled work produces drafts for review; it cannot independently publish or export.
3. Implement `scripts/autopilot/` and `step-ai autopilot`: inspect GitHub issues/PRs with `gh`, score tasks, work in isolated Git worktrees through approved `claude -p` or `codex exec`, run `npm test` and `npm run validate`, create reviewable PRs, wait for CI and repair with a bounded attempt limit. Apply the human-gate label. Auto-merge requires an explicit managed policy/flag and human authorization boundaries. HTML dashboards belong in ignored `output/`; the repository is public.
4. Add a Docker backend in `sandbox.ts` only when policy enables it and Docker is available. Mount the selected workspace and disable network by default. The current shell filter is not an OS/container sandbox.
5. Add `mcp.ts` for administrator-approved `policy.mcpServers` only, with stdio/HTTP and bounded reconnect. Use tool search when more than 12 tools are available. Route every invocation through the existing host permissions, hooks, privacy and consent checks.

Required local checks include real concurrent coordinator timing, dependency ordering, cron CRUD/history, policy denial and cancellation. Test autopilot with `--dry-run` on a disposable repository; do not open a real PR as a fixture.

## Phase 5: Providers, CLI and surfaces (implemented)

- Implement `CompatibleAdapter` in `providers.ts` for streaming OpenAI chat/completions and Anthropic messages over `fetch`, with profile base URL/model and keys in `safeStorage`; treat Ollama as an OpenAI-compatible profile. Add `copilot-auth.ts` device flow. Verify current official protocols before implementation.
- Add `src/cli/commands/run.js` for `step-ai run`, sharing the governed runner with `desktop/eval/golden.ts`; output `text`, `json` or `stream-json`, with explicitly supplied environment keys. Add `step-ai ask --dry-run` readiness/warning/block information, next actions and token/cost estimates, shared with the Desktop pre-send review.
- Consolidate commands in `desktop/src/commands.ts` with the existing Ctrl+K palette. Add configurable keybindings and opt-in vim mode.
- Add voice as an on-demand downloaded component with checksum verification through the existing component lifecycle.
- Implement governed Skill Packs via `step-ai plugin install/list/enable`, including skills/hooks/agents validation and explicit import/export compatibility with `anthropics/skills` and `.claude/skills`.
- Create `gateway/line/` as an organization-server Node service: verify `X-Line-Signature`; map LINE user ids to employees through an allowlist; route and scan both inbound and outbound content; retrieve attachments through the content API and `evaluateDocumentPrivacy`; persist separate user sessions; permit no write/shell tools. Enable only with `lineGateway` policy and authorized organization channel secrets/tokens.

Use mock HTTP streaming endpoints and synthetic LINE signatures/webhooks, plus `step-ai run --output-format stream-json`. Live LINE delivery and Copilot/provider login require separate authorization and evidence.

## Phase 5 implementation and current checks

- `src/modules/providers/compatible.js`, `desktop/electron/providers.ts`, `copilot-auth.ts` and `copilot.ts`: bounded streaming profiles, official OAuth/SDK and explicit no-native-tool/config-discovery settings.
- `src/modules/runner/`, `src/cli/commands/run.js`, `ask.js` and `desktop/eval/golden.ts`: shared governed preflight/draft core, explicit environment keys, formats, clarification handling and conservative usage ledger.
- `desktop/src/commands.ts`, `keyboard.tsx`, `readiness.tsx`, `voice.tsx`, `desktop/electron/voice.ts`: registry/keybinding/Vim, debounced current-query readiness and on-demand verified local transcription.
- `src/modules/packs/`, `src/cli/commands/plugin.js`, `desktop/src/packs.tsx`, `main.ts`: inert bounded local imports, exact digest approval, separate host-hook/template switches, reviewed source selection and explicit new-directory export.
- `gateway/line/`: signed raw webhooks, current managed allowlist/profile binding, private user sessions, attachment/clarification review, privacy/routing, bounded concurrency and human delivery approval. No service or real LINE channel was started.
- Local Windows Desktop: 205 unit tests and all seven Electron smoke scripts passed. Ten targeted Harness Phase 5 tests passed, including actual shared-runner/Router LINE generation without live delivery. Both repository validators passed (51 Skills, no likely secrets, package whitelist). The full isolated Harness suite passed: 824 tests/6 platform skips (830 total). Check PR #83 CI for the final revision and `desktop/VALIDATION.md` for detailed evidence.
- Remaining live acceptance: actual compatible/Copilot accounts and billing/denials; compatible REST proxy transport (currently refused when managed proxy is configured); administrator-built multilingual voice artifacts/microphone/hardware accuracy; real LINE enrollment/channel/permissions/retention operations; packaged Windows/macOS dependencies and clean installs. Text-only Skill interchange is bounded; arbitrary third-party binary/native-tool packs are not supported.

## Phase 6: Scoped consent, evaluation and documentation (implemented)

Implemented in [draft PR #84](https://github.com/iisara555/STeP-AI-Harness/pull/84) on `codex/openharness-phase6`, stacked on Phase 5, with implementation commit `5026d38`. `desktop/eval/feature-matrix.ts` covers memory/follow-ups/attachments, compaction, clean reads and staged writes, hook blocks, checkpoint retry/resume and coordinator. The synthetic matrix passes all five groups. Scoped consent lasts one loop, binds source/account/model/policy, coalesces parallel confirmations and limits each scope to 10 minutes, 24 results and 200,000 characters. The composer shows the scope and revoke-and-stop. Whole-file risk survives masking; higher-risk data, destinations and execution/business actions retain separate gates. See [Phase 6](desktop-phase6.md) and `desktop/VALIDATION.md` for final evidence and managed policy settings.

The initial local Claude Code OAuth evaluation failed: five provider attempts reported no usage, only the local matrix group passed, and subsequent auth status returned `LOGIN_REQUIRED`. The user first requested keeping failed results and finishing local work, then renewed the OAuth follow-up request and completed official CLI sign-in. On `codex/claude-oauth-followup`, bundled runtime 2.1.284 verified the approved profile, one generation probe passed, and the live/local feature matrix passed all five groups with 8 real calls. Golden produced three drafts, but formal acceptance remains 0/3 because the shared output Privacy Gate requires human review; offline rubric checks passed 14/14 and reproduced the gate without another provider call. The evaluator now retains the missing typed error codes. See [OAuth follow-up](claude-oauth-followup.md) for browser repair, evidence and acceptance boundaries. Local reports remain in ignored `desktop/eval-results/`; no tokens/profile copies are committed. This is not a standing authorization for unattended runs. Production/release operations remain open; the personal Claude CLI was not upgraded.

## Continue from another account

Start in `C:\Users\USER\Desktop\step-ai-harness` on this machine, or in a clean clone of `iisara555/STeP-AI-Harness`. Inspect status before switching branches. Preserve existing employee/user files and any uncommitted work.

```powershell
git fetch origin
git status --short
git log -1 origin/main
```

When the checkout has no conflicting local work, switch to `main` and update with `git pull --ff-only`. Review `codex/openharness-phase4`, `codex/openharness-phase5`, `codex/openharness-phase6` and `codex/claude-oauth-followup` and their PRs. If they are unmerged, use the OAuth follow-up head as the next review/evaluation starting point; do not reimplement them from `main`. Read this document, `docs/openharness-parity.md`, `docs/desktop-policy.md`, `docs/desktop-tool-loop.md`, `docs/desktop-context-memory.md`, `docs/claude-oauth-followup.md` and `desktop/VALIDATION.md`. Run the workspace's `step-ai ask "<latest user request>" --json` gate and load only its mandatory references. Use `node scripts/graphify-local.js query "<symbols>"` for narrow code navigation; verify inferred edges in current source and rebuild the code-only graph if stale.

The original checkout contains user-owned, untracked `.claude/`, `.codex/`, `SVG/` and `TOR_Draft_AI_API_Gateway.docx`. Do not commit, overwrite or delete them. Keep `USER.md`, `MEMORY.md`, `ASSISTANT.md`, `.step/memory/`, account profiles and credentials local. Root tests mutate installation fixtures: use a managed test worktree and an isolated child profile, not the employee's real home or primary checkout.

Desktop checks, from `desktop/`:

```powershell
npm test
npm run format:check
npm run build
npm run test:electron
```

Run `npm run validate` from the root, and `npm test` from the isolated Harness test checkout/profile. Existing Electron scripts create isolated synthetic profiles. Install dependencies from lockfiles with `npm ci` only if the new checkout requires it. Do not update pinned runtimes as part of an unrelated phase.

Earlier stacked draft PRs: [#79](https://github.com/iisara555/STeP-AI-Harness/pull/79), [#80](https://github.com/iisara555/STeP-AI-Harness/pull/80), [#81](https://github.com/iisara555/STeP-AI-Harness/pull/81). They are superseded once their commits are integrated into `main`; inspect their current status and ancestry before any merge. No separate Phase 3 PR is needed for the user-authorized direct integration.

Suggested continuation prompt:

> Read docs/openharness-handoff.md, docs/desktop-phase6.md, docs/claude-oauth-followup.md and desktop/VALIDATION.md. Inspect the Phase 4–6 and OAuth follow-up branches before review or integration; preserve employee files and keep main unchanged until authorized. Local validation and the authorized Claude OAuth probe/feature matrix now pass. Check the follow-up report for quality evaluation and remaining product lifecycle/release acceptance. Use a currently authorized account for further paid checks, isolated synthetic profiles for fixtures, and report local, live and release evidence separately.
