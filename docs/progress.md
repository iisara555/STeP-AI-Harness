# Progress — what is in flight

Shared state for every agent and person working on this repository (see [AGENTS.md](../AGENTS.md)). Update it in the
pull request that changes the state. Newest first inside each section; keep it short and move finished items to the
CHANGELOG instead of growing this file.

_Last updated: 2026-10-11_

## Latest release

- **Desktop v0.5.39** (2026-10-11) — published from PR #135 (`7f33d12`): managed/local Dev mode gates for Claude plan access, bounded cold fallback and idle prewarming cleanup. Windows x64 and macOS Apple silicon installers are published; Harness **0.7.7**. Intel Macs stay on 0.5.35. The audit fixes below are pull requests and are not in this release.

## In progress

- **macOS HTML preview smoke**: #151 first reproduces a red native run: HTML fullscreen entry resolves, then exit is sent about 12 ms later and stalls until the 90-second watchdog fails the test. Wait for BrowserWindow's native enter/leave-full-screen events before proceeding; retain DOM/layout/fit/fullscreen assertions and bound each transition at 10 seconds. Keep phase reporting and the watchdog, plus a 20-minute CI job bound; temporary Playwright tracing is removed. Windows smoke passes; final native CI is tracked in #151. No eval/provider calls or budget changes.

- **Desktop 0.6.0 release preparation**: owner authorized publication after all CI checks pass. Combine the ordered #136–#150 source commits and the separate macOS smoke fix, retaining original PR history. Version, lockfile, Thai/English in-app notes and both READMEs are prepared; macOS diagnosis, final integration CI and installer publication remain pending. Harness stays 0.7.7; no live eval calls or budget reset.

- **Office eval prompt cost (offline)**: original Windows recordings expose usage for 14/19 arms: 631,172 input / 6,395 output tokens; 169,533 ledger tokens cannot be attributed retrospectively. Restrict the eval host prompt to its four executable tools, equally in both arms, while retaining full WITH Skill/references and normal Desktop tool instructions/gates. Reconstructed initial host system text is 67% shorter WITHOUT, 41.5–48.8% shorter WITH; these are character savings, not measured provider token savings. New per-turn size/estimate/observed-usage metadata survives failed calls and fingerprints the helper. Synthetic regressions cover default host behavior, paired isolation, successful/failed usage and stale-context resume without additional calls. Failing tests preceded the fix; root 968/8 skipped, Desktop 675/4 skipped, validate/format/build and Electron tool-loop smoke pass on Windows. The linked plugin documentation was regenerated after the root stale-plugin check failed. Zero new live prompts; original budget/report SHA-256 unchanged. Live savings and complete PPTX/memo evidence remain open.

- **Windows OAuth Skill eval / reporting coverage**: evaluated all six account-listed models on clean source `449424b` with the original OAuth runner (self-test → list → authenticated probe → live), synthetic inputs and one external ledger. 43 new admitted calls plus 2 prior astra calls; all models reached the token admission threshold before memo. Only three Excel pairs completed comparably: gpt-6-luna passed with Skill only; gpt-6-sol and gpt-5.6-sol passed both arms. PPTX pairs are incomplete; memo is unrun; recalculation/rendering/human semantics remain unverified. No quota/auth retry, reseeding, new budget folder or lifecycle promotion. Reporting-only follow-up retains all planned task rows and `error` statuses; regeneration uses recorded results, not new prompts. Root 968/8 skipped and Desktop 672/4 skipped, validators/format/build passed before live; after reporting fix root 968/8 skipped and Desktop 673/4 skipped, validate/format/build pass again. Private reports and budget remain outside Git.

- **Windows evaluator shutdown**: the old/new Skill comparator now sets its exit status and lets HTTP handles/stdout drain. The existing loopback-model regression reproduced a libuv abort on Node 24 and 25 after writing a successful report; success and regression exit codes remain covered. This is separate from the OAuth WITH/WITHOUT runner.

- **Windows validator regression**: the secret-scope subprocess test now uses the validator's Python 3.10+ discovery instead of a hardcoded `python` command. Reproduced failure with the Windows Store alias and working `py -3`; shared discovery is covered without skipping the scanner.

- **HA05 knowledge relevance**: original staff-query corpus improves from 59/61 to 61/61 for local top-document retrieval/abstention. Topic coverage avoids shared-location matches; role-table evidence answers team duties instead of form lists. Paraphrase and independent synthetic cases added; exact document-number, restricted-source and cache behavior retained. 32 related regressions, root 968 passed/3 skipped, Desktop 674 passed/2 skipped, validators/format/build pass on Linux. Model-answer quality and unseen staff questions still require evaluation.

- **HA03 effective capabilities**: shared Connect AI/Setup disclosures explain policy and transport blockers per account, with organization routing/MCP/draft/check status once per page. Unknown configuration stays unknown; text readiness does not establish image or MCP entitlement. Synthetic keyboard/policy-revocation, Setup and English Electron checks pass on Linux; root 968 passed/3 skipped, Desktop 670 passed/2 skipped, validators/format/build pass. Native employee/account acceptance remains open.

- **HA01 Skill evidence**: Thai paired Office reports distinguish verified file outcomes, missing/failed/stale pairs and memo human review. Context fingerprints prevent mixing source/tool revisions on resume; ledger/call limits remain unchanged. Synthetic scorer and controlled real-host Office checks pass. No Desktop OAuth profile is available in this cloud (0 model prompts); signed-in Windows/macOS live results and existing eval debt remain open.


- **Right-panel HTML preview**: app-zoom geometry and fixed-slide cropping reproduced in failing Electron tests, then corrected. Local HTML has **พอดีพื้นที่ / ขนาดจริง** controls, with temporary scaling below Chromium’s zoom floor; responsive reports preserve vertical scrolling and source files/permissions stay unchanged. Synthetic resize/reload/fullscreen regressions pass on Linux/Xvfb; root 968 passed/3 skipped and Desktop 662 passed/2 skipped, both validators, formatting and build pass. Branch `fix/html-preview-responsive` builds on the audit/OCR stack; Windows/macOS employee acceptance remains open.

- **Minimal OCR review**: original on the left; corrections, next actions and five basic elements on the right. Employee UI has no advanced pilot controls. Ordinary edits remain available on demand; the backend/private benchmark APIs and provenance are retained. Synthetic layout, failure recovery, Gemini vision, consent, delayed edits and private scoring/export pass. Root 968 passed/3 skipped and Desktop 662 passed/2 skipped; both validators, formatting and build pass. Combined 41-script Electron and platform CI outcomes are tracked in [PR #142](https://github.com/iisara555/STeP-AI-Harness/pull/142); real OCR/AFP/native-machine acceptance remains open.

- **Easy Dev mode**: discoverable stateful button in the shared Connect AI flow (Setup and Settings), with IT-policy explanation and one-click return. Existing provider-policy/forced-off restrictions remain intact; synthetic Electron checks cover the button and short-window Setup. No policy defaults changed.

- **FE03 startup recovery**: repeated transient snapshot errors now offer an accessible retry; success restores the saved task and onboarding state. Electron regression failed before the change and now passes with zero provider calls. No saved data migration or policy change.

- **FE02 effective readiness**: a previously successful Claude plan connection no longer appears ready after access is disabled. Snapshot projects policy status without changing stored test success; re-enable restores it, and account cleanup remains accessible. Synthetic Electron regression reproduced the mismatch first. No entitlement or policy-default changes.

- **FE01 shared modal accessibility**: failing Electron Tab regression now passes; dialogs isolate background controls/shortcuts and restore focus after Escape or confirmation. Existing chat/privacy approval paths remain covered with synthetic providers; native screen-reader acceptance remains open.

- **BE04 image intent**: reject Thai compounds that mean text overviews/formats and explicit no-image instructions before shared host/renderer auto-routing. Regression failed on main first. Explicit image mode and existing privacy/destination gates remain unchanged; follow-up brief retention is outside this fix.

- **BE01 LINE intake recovery**: durable metadata before webhook acknowledgement; interrupted jobs are visible to the loopback operator and require reviewed input plus explicit provider approval. Queued/in-flight restart and failed-write regressions reproduced failures first and now pass with synthetic signatures/providers. Real organization credentials/channel rollout remain an IT acceptance step; policy defaults unchanged.


## Waiting on the owner

- **LINE Gateway deployment**: signed synthetic intake/restart/operator-retry checks are ready. This cloud has no LINE channel configuration or operator/allowlist bindings. IT must configure an authorized test server, TLS and private storage as documented in [Phase 5](desktop-phase5.md); live channel/employee approval and delivery remain external acceptance, not a completed production rollout.

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
- Small models with a 4,096-token window cannot fit the smallest prompt.

## Document source and acceptance backlog

- MIS ISO metadata register is included (1,217 entries, snapshot 2026-10-10); current revisions must be checked in MIS. The private extract, source documents and detailed acceptance evidence stay outside this public repository.
- Owner-confirmed WI/QP → Skill mapping remains open, especially correspondence, procurement and finance. Do not infer rules/rates from document titles or unverified revisions.
- Five-tool acceptance remains open for TOR, memo, external letter, project proposal and minutes: synthetic cases, then private owner review of real documents and exported DOCX in Word with the correct templates/fonts. Host/export tests do not establish live-model or owner acceptance.

## Not started (ideas the owner approved in principle)

- Antigravity image input; Learning Inbox shared across a team.
