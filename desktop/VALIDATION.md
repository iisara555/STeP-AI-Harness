# Validation and release status

This is a development preview, not an accepted production release.

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

No release, deployment, commit, or push was performed by the implementation task.
