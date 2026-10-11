# Progress — what is in flight

Shared state for every agent and person working on this repository (see [AGENTS.md](../AGENTS.md)). Update it in the
pull request that changes the state. Newest first inside each section; keep it short and move finished items to the
CHANGELOG instead of growing this file.

_Last updated: 2026-10-11_

## Latest release

- **Desktop v0.5.38** (2026-10-10) — published from combined PR #134 (`b5d6ed7`): Windows x64 and macOS Apple silicon installers and the in-app `desktop-latest` update feeds. Combines #130/#131/#133, MIS ISO register lookup, protected credential streaming, public search for every connection, one-page OCR handoff, web extraction, consented vision, image tool calls, organization Google MCP profile and local tool diagnostics. Harness **0.7.7**; Intel Macs stay on 0.5.35.

## In progress

- **FE03 startup recovery**: repeated transient snapshot errors now offer an accessible retry; success restores the saved task and onboarding state. Electron regression failed before the change and now passes with zero provider calls. No saved data migration or policy change.

- **FE02 effective readiness**: a previously successful Claude plan connection no longer appears ready after access is disabled. Snapshot projects policy status without changing stored test success; re-enable restores it, and account cleanup remains accessible. Synthetic Electron regression reproduced the mismatch first. No entitlement or policy-default changes.

- **FE01 shared modal accessibility**: failing Electron Tab regression now passes; dialogs isolate background controls/shortcuts and restore focus after Escape or confirmation. Existing chat/privacy approval paths remain covered with synthetic providers; native screen-reader acceptance remains open.

- **BE04 image intent**: reject Thai compounds that mean text overviews/formats and explicit no-image instructions before shared host/renderer auto-routing. Regression failed on main first. Explicit image mode and existing privacy/destination gates remain unchanged; follow-up brief retention is outside this fix.

- **BE01 LINE intake recovery**: durable metadata before webhook acknowledgement; interrupted jobs are visible to the loopback operator and require reviewed input plus explicit provider approval. Queued/in-flight restart and failed-write regressions reproduced failures first and now pass with synthetic signatures/providers. Real organization credentials/channel rollout remain an IT acceptance step; policy defaults unchanged.

- **PR #135 / Desktop 0.5.39 prepared release**: based on released main 0.5.38. Review keeps `developmentMode` false by default (managed permission plus local opt-in), bounds/cancels warm claim waiting, falls back only before a prompt runs, reports a refused model without replay, and prevents late startup/finishing requests from resurrecting spares after logout/quit. Only successful text requests replenish the pool; policy revocation cancels Claude plan runs/sign-in. Both READMEs, operator docs, in-app notes and version/lockfile align with 0.5.39.
- Regression evidence: seven new tests reproduced the original problems (six failures plus a startup-wait timeout), then passed after fixes. Additional cancellation, idle expiry, late-start cleanup and held-conversation reuse use a synthetic SDK. Local validation passed: root 964 passed/3 skipped (967 cases), Desktop 661 passed/2 skipped (663 cases), frozen install, formatting, build, both validators and all 40 Electron smoke scripts. Final Windows/macOS CI must pass before merge; release publication remains a separate workflow on the merged commit.
- Real Claude account/quota behavior and employee-machine performance remain unverified after these review changes. Prior timing reported by the PR author has not been remeasured; the SDK documents roughly 230–260 MB per parked process. No new dependencies, credential handling or privacy/permission defaults added. Native provider tool transport, employee-machine process-tree acceptance and signed-in model acceptance remain open.

## Waiting on the owner

- **Google Workspace MCP**: IT must supply the approved server endpoint/authentication in managed policy. Catalog discovery and calls pass with a synthetic server; real Google scopes/document access remain unverified. Vision and generated-image quality also need signed-in provider acceptance.
- **Claude Pro pilot** on the owner's machine: the policy file has a problem since 2026-10-09 13:31 (`policy-problems: 1`
  in diagnostics), so `claudeSubscription` is not applied. After PR #126 the policy tab names the reason.
- **Antigravity streaming** needs one check with a signed-in `agy`: whether `ttftMs` in `diagnostics.jsonl` is now
  lower than `ms`.
- **HTML preview on employee Windows/macOS machines**: native acceptance remains open. PR #130 records Linux/Electron/Xvfb rendering, fullscreen and permission checks with `--no-sandbox`; that does not establish native GPU or OS sandbox acceptance.
- **Branch protection on `main`** enabled and read back in PR #130: PR required, strict `validate`, `desktop`, `windows-tests` and `desktop-macos-electron` checks; admin enforcement, no force-push/deletion.

## Known issues

- `desktop/test/office-skill-benefit.test.mjs` fails in cloud containers (no Office runtime); not a code failure.
- macOS Apple silicon `tool-loop-smoke` timed out once at release time and passed on re-run.
- GitHub Packages workflow fails: package scope `@step-cmu` does not exist (403).
- Knowledge search misses: "ทีม HD ทำหน้าที่อะไร" can match HD form lists rather than team duties; "แนะนำร้านกาแฟในเชียงใหม่" can match an HR document. Exact document-number retrieval has separate cross-team regression tests; the 59/61 benchmark is local search evidence, not model-answer accuracy.
- Small models with a 4,096-token window cannot fit the smallest prompt.

## Document source and acceptance backlog

- MIS ISO metadata register is included (1,217 entries, snapshot 2026-10-10); current revisions must be checked in MIS. The private extract, source documents and detailed acceptance evidence stay outside this public repository.
- Owner-confirmed WI/QP → Skill mapping remains open, especially correspondence, procurement and finance. Do not infer rules/rates from document titles or unverified revisions.
- Five-tool acceptance remains open for TOR, memo, external letter, project proposal and minutes: synthetic cases, then private owner review of real documents and exported DOCX in Word with the correct templates/fonts. Host/export tests do not establish live-model or owner acceptance.

## Not started (ideas the owner approved in principle)

- Antigravity image input; Learning Inbox shared across a team.
