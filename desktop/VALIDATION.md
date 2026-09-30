# Validation and release status

This is a development preview, not an accepted production release.

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
