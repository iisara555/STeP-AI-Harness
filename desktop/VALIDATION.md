# Validation and release status

This is a development preview, not an accepted production release.

## OpenHarness adaptation — Phase 6 (2026-10-01)

- Branch `codex/openharness-phase6`, stacked on Phase 5: bounded source/account/model/policy consent scopes, risk provenance and revocation; synthetic/live feature matrix; explicit account/auth live boundary; native npm Claude launcher support; documentation.
- Desktop: **216 unit tests passed**, zero failures/skips, including pending-dialog disposal and administrator one-time/web-destination checks. Synthetic matrix: **5/5 groups passed** through actual routing, WorkService, memory, compaction, Workbench/ToolGate, checkpoints and coordinator. Three clean reads changed from 3 transmission prompts to 1; including a staged-change result, 4 changed to 2. This is a fixture measurement, not an employee usability study.
- All **eight Electron smoke scripts passed** with isolated synthetic profiles. Phase 6 exercises real UI/preload/IPC/local SSE: unchecked scope choice, three reads with one dialog, visible bounded scope, separate write-result consent, no applied file, no persisted approval, and revoke-and-stop during generation.
- TypeScript/production build, formatting and both repository validators passed (51 Skills, no likely secrets, package whitelist). Existing Vite renderer size warning remains (~859 KB). Full Harness tests were not repeated for Desktop/documentation changes; Phase 5 full isolated/CI results remain historical evidence.
- User-authorized Claude Code OAuth: bundled runtime 2.1.284 verified the existing profile; personal runtime 2.1.221 was not upgraded. Live matrix failed accepted generation: five provider attempts, zero reported tokens, **1/5 groups passed** (local tool group), subsequent auth check `LOGIN_REQUIRED`. This does not prove zero charges, entitlement or live quality. The user requested no further live calls. Failed report retained at ignored `eval-results/2026-10-01T03-31-58-253Z-matrix/report.md`; final synthetic report at `eval-results/2026-10-01T03-50-58-657Z-matrix/report.md`.
- Logs/screenshots are ignored under `release/qa/phase6-*`. No credentials, employee data, production policy, delivery, main merge, installer or release was created. Renewed login and explicit retry authorization are needed for live acceptance.

## OpenHarness Phase 5 local verification (2026-10-01)

- Desktop: 205 unit tests passed. New cases cover fail-closed policy fields, fixed GitHub device OAuth/polling/cancellation, official Copilot SDK no-native-tool/config-discovery options, keybinding collisions/platform modifiers, composer Vim, pinned voice installation/tamper detection/PCM validation/transcript privacy and temporary recording cleanup. Existing Golden scenarios continue to use the real Router and `WorkService` through shared preflight.
- All seven real Electron smoke scripts passed with isolated synthetic profiles. Phase 5 exercises a real loopback compatible provider through renderer/preload/IPC/SQLite, readiness estimates, custom palette shortcuts, Vim, imported Skill source consent and voice approval refusal. Copilot SDK/device flow and voice transcription/downloads use injected fixtures; no live login, microphone/hardware or production model was exercised.
- Harness: 824 passed, 6 platform skips, zero failures (830 total), in a managed test worktree and isolated child HOME/USERPROFILE/APPDATA/LOCALAPPDATA. The ten new Phase 5 cases include actual split UTF-8 SSE, native tool/endpoint/stream failures, shared privacy/authority/hooks/policy/budget guards, CLI stream-json plus default CLI denial, inert pack import/approval/tamper/export, exact LINE signatures/HTTP/employee session isolation/replay/attachments/operator gates and actual shared-runner/Router LINE drafts/clarification without delivery.
- Desktop formatting, TypeScript/build and both repository validators passed (51 Skills; dependency resolution, no likely secrets and package whitelist). Implementation commit: `e83329f`; [draft PR #83](https://github.com/iisara555/STeP-AI-Harness/pull/83) is stacked on Phase 4. Check [PR CI checks](https://github.com/iisara555/STeP-AI-Harness/pull/83/checks) for the final revision's Linux Node 20 Harness and Windows/Linux Node 24 Desktop results. Local evidence is in ignored `desktop/release/qa/phase5-*`. The Vite bundle-size warning remains; no installer/release was produced.
- Remaining acceptance: actual compatible/Ollama/Anthropic and Copilot login/entitlement/usage/tool denial; approved compatible REST proxy transport (currently fails closed when configured); administrator-reviewed multilingual voice artifacts, OS microphone permissions and accuracy; real organization LINE employee enrollment/channel/permissions/retention/recovery operations; text-only third-party Skill interoperability; packaged Windows/macOS dependencies, signing and clean installs. LINE generates private pending drafts and never delivers automatically. [Operator notes](../docs/desktop-phase5.md) describe limits and human gates. These synthetic results do not establish production acceptance, paid evaluation, real LINE delivery or main merge authorization.

## OpenHarness Phase 4 local verification (2026-10-01)

- Desktop: 200 unit tests passed. New checks establish actual three-way `WorkService` concurrency, dependency ordering/barriers/versioned artifacts, declined plans, context changes and authority blocks, the global run limit, cron syntax/CRUD/context binding/serialized queue/restart without replay, MCP SDK stdio/HTTP/search, denied servers/PII/redirects/uncertain-call retry prevention, Docker snapshot arguments/privacy/path guards/cancellation/cleanup and safe policy defaults.
- All six Electron smoke scripts passed. The Phase 4 script uses the real renderer/preload/IPC/SQLite with isolated synthetic provider and MCP processes; it exercises plan consent, independent child sessions, a merged parent proposal, automation create/edit/run/history/delete and attended MCP discovery/call approvals. It reproduced and repaired approval dialogs being covered by the automation dialog. Docker invocation uses an injected runner in unit tests; the Electron fixture checks protected-path denial without launching Docker.
- Desktop formatting, TypeScript/production build and repository validation passed (51 Skills). Six autopilot tests passed using disposable Git repositories, synthetic GitHub/coder responses, absolute/wildcard managed path denials, actual isolated worktree commits, unchanged test scripts and a separate test profile. No fixture publishes a real PR, merges a remote branch or consumes provider quota. The full Harness suite passed in a managed worktree and isolated child profile: 814 passed, 6 platform skips, zero failures (820 total). Remote CI passed all three jobs for code commit `f6185ca`: [run 36753076528](https://github.com/iisara555/STeP-AI-Harness/actions/runs/36753076528). Harness on Node 20 passed 819 tests/1 platform skip on Linux and 814 tests/6 skips on Windows (820 total each); Desktop on Node 24 passed 200 tests on Windows and 199 tests/1 platform skip on Linux (200 total each), with formatting and build passing on both platforms.
- Ignored evidence is under `desktop/release/qa/phase4-*`. The existing Vite renderer bundle-size warning remains. No Phase 4 installer or release was published.
- Remaining acceptance: live CLI account/tool-denial/billing behavior; actual Docker/image isolation on target engines; administrator-managed organization MCP interoperability/auth/proxy/failure handling; native notifications/background operation on packaged Windows/macOS; real autopilot publication/CI-repair/human-gate merge with an authorized disposable repository. Synthetic fixtures do not establish these production gates.

## OpenHarness Phase 3 local verification (2026-09-30)

- Desktop: 186 unit tests passed, zero failures. New checks cover canonical Thai-aware context estimation, micro/summary compaction, task-state retention, hook blocks, prompt-length retry and summary usage; confirmed memory/privacy/scope/TTL/path boundaries; SQLite migration/search/fork/resume/export; complete OCR text and gated provider image blocks.
- Harness: 808 passed, 6 platform skips, zero failures (814 total), in a managed worktree with an isolated child profile. Repository validation passed (51 Skills, resolved dependencies and package whitelist, no likely secrets detected). Desktop TypeScript/production build and formatting passed. The existing Vite bundle-size warning remains.
- All five Electron smoke scripts passed using real renderer/preload/IPC/SQLite with isolated synthetic profiles. The Phase 3 smoke verifies memory creation/editing and privacy rejection, explicit context consent, bounded history summary and usage, source search, independent fork, both conversation export formats, restart without replay, synthetic OCR attachment extraction and flagged-image refusal.
- The Windows memory path-rule regression was reproduced with real 8.3 short-path aliases and mixed short/long parent names, then repaired by checking configured/canonical paths and canonical absolute rule prefixes. Unit coverage includes workspace-relative and absolute memory denials before directories exist, canonical `.gitignore` denials and hard-linked records. Check CI on the final follow-up commit; an earlier passing local suite did not expose the CI runner's short user-directory path.
- [Context and memory operator notes](../docs/desktop-context-memory.md) document limits, shared-folder policy and transmission boundaries. Providers and OCR responses are synthetic; actual OCR accuracy, live visual generation/input quality, provider entitlement, shared-folder ACLs/network behavior, packaged installs, macOS and production acceptance remain unverified. Integration into `main` is authorized separately by the user; it does not establish release acceptance. No live API evaluation or release was performed. See the [handoff](../docs/openharness-handoff.md) for remaining work.

## OpenHarness Phase 2 local verification (2026-09-30)

- Desktop: 170 tests passed, zero failures. Covers routing/authority boundaries, bounded tool turns/parallelism, approved-result paging, separate data and generated-web destination consent, cancellation, real DOCX privacy extraction, XLSX scalar edits, conflict-safe backup/restoration, SSRF/proxy checks, retry-after and usage estimates.
- Harness: 806 passed, 6 platform skips, zero failures, using a managed worktree and isolated child profile. Repository validation passed (51 Skills and no likely secrets); TypeScript/build and formatting passed.
- All four Electron smoke scripts passed using synthetic profiles and a local fake Codex RPC runtime. The enabled-loop smoke exercises five model turns, result consent, option answers, plan approval, staged-only file changes, `/usage` token totals and pending-question cancellation through the real preload/IPC/UI. The earlier manual-proposal smoke explicitly disables `toolLoop` to verify fallback behavior.
- [Tool loop operator notes](../docs/desktop-tool-loop.md) describe exact limits and the optional trusted proxy. Complex Excel features, live provider accounts/entitlement, corporate proxy and HTTPS proxy E2E, packaged installs and production acceptance remain unverified. No live API generation, merge or release was performed for this phase.

## Desktop 0.4.0 chat and workspace tools

Local verification passed: Harness 799 passed / 6 skipped; Desktop 103 passed; TypeScript/renderer build, formatter, both repository validators and both Electron smoke scripts passed. The CLI fixture cleanup now retries transient Windows locks. Live accounts remain outside these results.

- Chat returns the complete assistant answer in the conversation. Draft mode keeps versioned proposals and human edits. Markdown code blocks and tables render as escaped content; no provider HTML is executed.
- Enter and button sends, repeated turns, draft acceptance, inert model tool proposals, terminal output, reviewed file changes, browser reading, and preservation of unsent text on an unready connection passed the real Electron/preload/IPC smoke using an isolated synthetic Codex RPC runtime. No personal profile or live provider was used.
- Browser uses separate sandboxed windows without the application preload, credentials, IPC, file navigation, downloads, or browser permissions. Website text can be explicitly reviewed and attached to Chat. It is not an autonomous browser agent.
- Terminal runs approved commands in the selected workspace and tracks them as cancellable background tasks. Commands use the person's OS permissions; the selected folder is a working directory, not an OS sandbox. The native approval dialog displays the exact command. Provider credential environment variables are removed and output is scrubbed before local persistence.
- Files supports bounded text previews and edits. Changes stages before/after previews without writing, refuses stale content and workspace changes, and writes only after human approval. Traversal, escaping junctions and sensitive credential paths are rejected. Git diff disables external diff, text conversion and fsmonitor helpers.
- Models can propose host tool requests as structured data. Opening a proposal does not execute it. The person reviews the request, runs it, then explicitly attaches any result to Chat through the normal privacy/consent path. Native runtime tools remain disabled.
- Explicit image-creation requests route to the selected OpenAI or Google API connection. The host checks the account model catalog before generation. Documented candidates include `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare` and Gemini 3 image models. OAuth/subscription connections without Image API support report an actionable error instead of switching accounts or producing a text-only substitute.
- Mocked OpenAI Images and Google Interactions responses passed model discovery, verified local image storage, unsupported models/auth modes and error handling. These tests do not establish live image entitlement, billing, OAuth image support, or actual generated-image quality. This preview supports text-to-image; reference-image editing remains unsupported.
- The installer workflow runs the synthetic Electron checks on Windows and both Mac build jobs. The prior 0.3.4 installers succeeded in CI at commit `89d7275`; Mac builds are ad-hoc signed and have not been notarized. Clean install and live account validation remain pending.

## Current automated verification

The Windows validation/OAuth repair and Desktop 0.3.4 provider-selection fix were checked locally with Node 25.8.0:

- Harness: 799 passed, 6 skipped, zero failures (805 tests including nested cases).
- Desktop: 92 passed, zero failures, including synthetic OAuth cancellation, awaited runtime shutdown and the Anthropic CLI preload permission regression.
- The Electron smoke test exercises Google OAuth/API selection and Claude Console availability through the real preload bridge. Selecting Claude previously threw `UNKNOWN_OPERATION` during an effect and unmounted the renderer; the bridge now permits that existing host operation and availability checks also catch synchronous failures. No live provider calls were made.
- TypeScript/production build, Desktop formatting and repository validation passed. Repository validation reports 51 Skills and no likely secrets.
- Windows validation CI is configured to run Harness checks with Node 20 and Desktop checks with Node 24. That separate validation job has not been executed by this local task. The Desktop 0.3.3 installer workflow passed on Windows and both macOS build jobs with Node 24; its artifacts remain development previews.
- Live OAuth, provider entitlement and packaged-app acceptance remain pending; the checklist below is not a completed validation record.

## Previously verified on Windows

- Existing Harness regression suite: 464 passing tests, including nested dependency exclusion and first-party TSX secret scanning.
- Desktop service suite: 17 passing tests. Includes real deterministic routing for 22 teams, fake provider generation, cancellation, draft conflicts, SQLite restart recovery, and basic DOCX/XLSX/PPTX content checks, structured draft persistence/validation, RPC exit handling, default tool-request denial, and CLI descendant cancellation.
- TypeScript and production build passed.
- Electron smoke passed with real IPC, SQLite, editor save, restore, heading persistence after reload, all five exports, and light/dark/narrow screenshots.
- Bundled Codex and Gemini protocol initialization passed without account authentication or model calls.
- Graphify 0.9.23 built a code-only graph; sampled source paths exclude employee documents, registries, rules, skills, dependencies and vendored parsers.
- Unpacked Windows app and refreshed NSIS installer produced. Authenticode inspection reports NotSigned.

- Actual Word, Excel and PowerPoint opened the synthetic Thai exports and rendered them to PDF. Electron generated its own PDF through the export IPC. Short plain-text and heading fixtures were visually inspected; this is not broad document layout acceptance.
- Dependency audit reports zero known vulnerabilities after scoped image-size 2.0.4 and uuid 11.1.1 overrides. Export regression checks passed; this does not establish absence of unknown vulnerabilities.

## Remaining acceptance work

### Live OAuth checklist (pending; automated fixtures do not prove account access)

- Use an authorized test account and disposable synthetic inputs. Sign in to ChatGPT, Gemini, or Claude Console through the Desktop connection flow; confirm the connection uses its isolated STeP runtime profile.
- Run the explicit connection probe (one short model request, which may consume quota), then reopen the app and confirm account reuse. Check a short streamed response and cancellation without exporting credentials or raw auth output.
- Sign out and remove the test connection; confirm its runtime profile can be removed and personal CLI profiles still work. Check expiry, denied permissions and quota errors using controlled account conditions when available; record any untested cases.
- Keep Claude Pro/Max in-app login disabled until its separate approval and live validation requirements are met. Record provider, runtime version, platform and outcome only; never record tokens, authorization codes or raw credential responses.

### Other acceptance work

- Authenticated provider end-to-end tests on disposable authorized inputs: login, streaming, account expiry, quota exhaustion, cancellation and runtime tool-denial behavior. UI readiness requires a successful local generation probe, but that is not a full safety certification.
- Claude SDK runtime integration has not been exercised against a live account. Claude subscription login (via the user's installed Claude Code, isolated `CLAUDE_CONFIG_DIR`) is covered only by synthetic-runtime tests plus a logged-out `auth status` probe against a real Claude Code 2.1.284 on Windows; live Pro login, chat, expiry and logout are unverified, macOS is untested, and Anthropic's Agent SDK terms require prior approval before offering claude.ai login in a third-party product.
- Confirm no runtime built-in tool can bypass host boundaries. Do not distribute broadly before adversarial attachment and tool tests pass.
- Structured headings, lists, bold and italic persist and export through DOCX/PDF/Markdown. Whole-proposal acceptance remains the default; granular change acceptance and direct table editing are future enhancements. XLSX/PPTX use plain content.
- Local draft export uses the existing action gate with a host-owned low-risk descriptor. External actions are unavailable; no scoped authorization is granted to provider tools.
- Expand document layout coverage beyond the verified short Thai fixture, including long tables and multi-page drafts.
- Complete all-team domain-specific task acceptance; the current 22-team test checks routing health with a shared meeting-summary request.
- macOS build, signing/notarization, clean-machine install, runtime packaging and end-to-end verification are not run on this Windows host.
- Windows installer clean-machine verification, release signing, branding/icon, dependency security review and update/rollback remain release gates.

The repair branch was committed and pushed with user authorization. No merge, GitHub Release, notarization, or production deployment was performed.
