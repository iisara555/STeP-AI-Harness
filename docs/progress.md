# Progress — what is in flight

Shared state for every agent and person working on this repository (see [AGENTS.md](../AGENTS.md)). Update it in the
pull request that changes the state. Newest first inside each section; keep it short and move finished items to the
CHANGELOG instead of growing this file.

_Last updated: 2026-10-10_

## Latest release

- **Desktop v0.5.37** (2026-10-09) — Windows x64 and macOS Apple silicon: PR #126 (one-line chat status, answer time,
  Antigravity streaming, policy problem reasons, STeP document sources, optional `answerCheck`, HTML preview, retry of
  unreadable tool requests, `AGENTS.md`) and PR #127 (receipt fields filled from the AI image reading). Intel Macs stay
  on 0.5.35. Harness **0.7.7**.

## In progress

- **Desktop 0.5.38 prepared release**: combines PR #130/#131/#133 on main after #132, with review fixes for credential streaming/cursors, Windows URL paths, exact ISO document lookup and snapshot provenance, provider-independent public Bing web search and one-page OCR handoff/consent fixes. Source version is not publication evidence; the release workflow publishes only after the combined PR passes checks and is squash-merged. Harness remains **0.7.7**.
- Validation of this combined change: root `npm test` 964 passed/3 skipped (967 cases); Desktop unit suite 637 passed/2 skipped (639 cases); `npm run validate`, `npm run desktop:test`, Python validator, formatting and build passed. Receipt handoff/consent and focused regressions use synthetic data. All 39 Electron smoke scripts passed locally with synthetic providers (the receipt disclosure checks open the relevant details). Windows CI exposed two CRLF-sensitive MIS assertions; their fixes also passed simulated CRLF reads. Windows/macOS native checks must pass on the final combined PR head before merge. A live Bing request in this cloud failed DNS resolution, so live search is not claimed here.
- Native provider tool transport, employee-machine process-tree acceptance and signed-in model acceptance remain open. Background masking deliberately withholds oversized lines and possible credential continuations.

## Waiting on the owner

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
