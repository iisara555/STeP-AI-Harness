# Validation and release status

This is a development preview, not an accepted production release.

## Verified on Windows

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
