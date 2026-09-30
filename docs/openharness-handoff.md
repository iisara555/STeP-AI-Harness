# OpenHarness adaptation handoff

Updated: 2026-09-30. This document is sufficient to continue from another account without access to the earlier chat or its attachments.

## Current state

The approved goal is a complete, chat-centered STeP employee workspace with editable artifacts, governed provider routing, and OpenHarness-inspired capabilities. Keep the existing Router authority, Privacy Gate, host tool permissions and human approval boundaries. LINE is the planned organizational chat channel. Compatible endpoints are optional provider profiles independent of data classification.

Phases 0–3 are implemented and locally validated. The user explicitly authorized pushing this integrated baseline to `main`. This is a development preview, not a published release. Read [delivery status](openharness-parity.md) and check `git log origin/main` for the final integration commit. Phase 3's initial implementation is `3cb7dde`; the final follow-up also contains export validation, hard-link refusal, the memory editor smoke repair and this handoff.

**Next implementation phase: Phase 4.** Do not reimplement Phases 0–3. Live acceptance gaps below remain open and must not be represented as passing because local fixtures passed.

| Phase | Implemented baseline | Reference |
| --- | --- | --- |
| 0 | Combined the previous chat/Desktop and Harness development lines; preserved current main documentation | `359e34a`, `e6a6bf1` |
| 1 | Managed policy, Workbench permission gate, hooks, unified approvals and modes | [Policy](desktop-policy.md) |
| 2 | Bounded tool loop, parallel approved reads, document/spreadsheet/reference tools, approved draft plans, snapshots/previews, retry/backoff and usage | [Tool loop](desktop-tool-loop.md) |
| 3 | Context compaction, confirmed memory, workspace instructions/persona/styles, session resume/fork/search/export, local OCR and gated image input | [Context and memory](desktop-context-memory.md) |

## Phase 3 implementation map

- `desktop/electron/compact.ts`: the canonical `script-aware-estimate-v2` estimator, conservative input budget, older source/result previews, bounded same-provider summaries, fenced task state, pre/post hooks and a single reactive prompt-length retry. Required current sources and governance are never silently truncated; the original transcript remains intact.
- `desktop/electron/memory.ts`: bounded schema-v1 Markdown records; private, project and managed team scopes; strict privacy checks; TTL/relevance selection of at most five entries; explicit confirmation; local evidence-only preference proposals. Autodream is a local queue with no provider call or automatic durable write. Project memory is ignored by Git and inaccessible to general model file tools. Symlinks, junctions and hard-linked records are refused. Workspace-relative and absolute path denials check configured and canonical paths, including Windows 8.3 aliases and `.gitignore` updates.
- `desktop/electron/workspace-context.ts` and `src/modules/user-memory.js`: root-level `STEP.md`, `AGENTS.md`, `ASSISTANT.md` and a selected `.step/output-styles/<name>.md`; bounded reads; assistant-only preferences without employee profile data; existing persona preservation. No recursive instruction loading. Context transmission requires explicit consent and is invalidated by workspace/team/style/policy changes.
- `desktop/electron/store.ts`: SQLite FTS5 trigram search and legacy backfill; explicit resume without request/tool replay; independent fork with consent, approved plan, traces, identifiers and usage cleared; Markdown/JSON conversation export. Export blocks secrets, masks recognized identifiers and validates redacted JSON before writing.
- `desktop/electron/ocr-attachment.ts`, `ocr.ts`, `main.ts` and `providers.ts`: complete local OCR text before privacy review; optional transient PNG/JPEG/WebP image input behind `features.vision`, OCR checks and separate image review/consent; capability checks and synthetic Codex/Claude/Gemini wire validation. Raw images are excluded from summaries and persisted sessions.
- `desktop/electron/service.ts`, `workbench.ts`, `hooks.ts` and `desktop/src/memory.tsx`: host integration, approved draft-only task plans, numeric compaction hook metadata, loaded-context display and `/memory` management.

Memory is a preference or reference, never authority to act. Workspace instructions and summaries cannot override organization governance. Native provider file/shell tools remain disabled.

## Validation already completed

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

## Phase 4: Coordinator, automation, sandbox and MCP

1. Add `coordinator.ts`: split a request into bounded subtasks and run the existing `WorkService`, up to three concurrent runs using the main host's `MAX_PARALLEL_RUNS`. Merge results through the governed provider path. Parallelize Playbook steps only when their declared `consumes`/`produces` dependencies permit it.
2. Add background AI task queues and notifications. Implement `cron.ts` CRUD, execution history and scheduling while the app is open. Scheduled work produces drafts for review; it cannot independently publish or export.
3. Implement `scripts/autopilot/` and `step-ai autopilot`: inspect GitHub issues/PRs with `gh`, score tasks, work in isolated Git worktrees through approved `claude -p` or `codex exec`, run `npm test` and `npm run validate`, create reviewable PRs, wait for CI and repair with a bounded attempt limit. Apply the human-gate label. Auto-merge requires an explicit managed policy/flag and human authorization boundaries. HTML dashboards belong in ignored `output/`; the repository is public.
4. Add a Docker backend in `sandbox.ts` only when policy enables it and Docker is available. Mount the selected workspace and disable network by default. The current shell filter is not an OS/container sandbox.
5. Add `mcp.ts` for administrator-approved `policy.mcpServers` only, with stdio/HTTP and bounded reconnect. Use tool search when more than 12 tools are available. Route every invocation through the existing host permissions, hooks, privacy and consent checks.

Required local checks include real concurrent coordinator timing, dependency ordering, cron CRUD/history, policy denial and cancellation. Test autopilot with `--dry-run` on a disposable repository; do not open a real PR as a fixture.

## Phase 5: Providers, CLI and surfaces

- Implement `CompatibleAdapter` in `providers.ts` for streaming OpenAI chat/completions and Anthropic messages over `fetch`, with profile base URL/model and keys in `safeStorage`; treat Ollama as an OpenAI-compatible profile. Add `copilot-auth.ts` device flow. Verify current official protocols before implementation.
- Add `src/cli/commands/run.js` for `step-ai run`, sharing the governed runner with `desktop/eval/golden.ts`; output `text`, `json` or `stream-json`, with explicitly supplied environment keys. Add `step-ai ask --dry-run` readiness/warning/block information, next actions and token/cost estimates, shared with the Desktop pre-send review.
- Consolidate commands in `desktop/src/commands.ts` with the existing Ctrl+K palette. Add configurable keybindings and opt-in vim mode.
- Add voice as an on-demand downloaded component with checksum verification through the existing component lifecycle.
- Implement governed Skill Packs via `step-ai plugin install/list/enable`, including skills/hooks/agents validation and explicit import/export compatibility with `anthropics/skills` and `.claude/skills`.
- Create `gateway/line/` as an organization-server Node service: verify `X-Line-Signature`; map LINE user ids to employees through an allowlist; route and scan both inbound and outbound content; retrieve attachments through the content API and `evaluateDocumentPrivacy`; persist separate user sessions; permit no write/shell tools. Enable only with `lineGateway` policy and authorized organization channel secrets/tokens.

Use mock HTTP streaming endpoints and synthetic LINE signatures/webhooks, plus `step-ai run --output-format stream-json`. Live LINE delivery and Copilot/provider login require separate authorization and evidence.

## Phase 6: Live evaluation and documentation

Extend `desktop/eval/golden.ts` into a live feature matrix covering multi-turn memory/follow-ups, attachments, compaction, approved reads and gated writes, hook blocks, retry/resume and coordinator runs. Real API evaluation consumes quota and requires an explicit user instruction identifying an authorized administrator account/key. Update `desktop/README.md`, `docs/harness-foundation.md`, `CHANGELOG.md` and operator/employee documentation for the final managed policy schema and actual release evidence.

## Continue from another account

Start in `C:\Users\USER\Desktop\step-ai-harness` on this machine, or in a clean clone of `iisara555/STeP-AI-Harness`. Inspect status before switching branches. Preserve existing employee/user files and any uncommitted work.

```powershell
git fetch origin
git status --short
git log -1 origin/main
```

When the checkout has no conflicting local work, switch to `main` and update with `git pull --ff-only`. Create a `codex/` development branch for Phase 4. Read this document, `docs/openharness-parity.md`, `docs/desktop-policy.md`, `docs/desktop-tool-loop.md`, `docs/desktop-context-memory.md` and `desktop/VALIDATION.md`. Run the workspace's `step-ai ask "<latest user request>" --json` gate and load only its mandatory references. Use `node scripts/graphify-local.js query "<symbols>"` for narrow code navigation; verify inferred edges in current source and rebuild the code-only graph if stale.

The original checkout contains user-owned, untracked `.codex/`, `SVG/` and `TOR_Draft_AI_API_Gateway.docx`. Do not commit, overwrite or delete them. Keep `USER.md`, `MEMORY.md`, `ASSISTANT.md`, `.step/memory/`, account profiles and credentials local. Root tests mutate installation fixtures: use a managed test worktree and an isolated child profile, not the employee's real home or primary checkout.

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

> Read docs/openharness-handoff.md and desktop/VALIDATION.md. Confirm that Phases 0–3 are present on main, then implement Phase 4 on a codex/ branch through the existing governance boundary. Preserve local user files, use isolated synthetic validation, and report live/release acceptance separately. Do not start paid API evaluation or publish a release without explicit authorization.
