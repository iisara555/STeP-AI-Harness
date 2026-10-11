# Progress — what is in flight

Shared state for every agent and person working on this repository (see [AGENTS.md](../AGENTS.md)). Update it in the
pull request that changes the state. Newest first inside each section; keep it short and move finished items to the
CHANGELOG instead of growing this file.

_Last updated: 2026-10-11_

## Latest release

- **[Desktop v0.6.0](https://github.com/iisara555/STeP-AI-Harness/releases/tag/desktop-v0.6.0)** (2026-10-11) — published from #152 (`0fcc500`); GitHub confirms #136–#151 merged with their original heads preserved. Includes the reviewed LINE/image/modal/startup/Dev/receipt/HTML/capability/knowledge/Office-eval changes. Windows x64 and macOS Apple silicon installers are published; `desktop-latest` Windows/Mac feeds both read 0.6.0 and reference the published assets. Harness **0.7.7**; Intel Macs remain on 0.5.35.
- **Release verification**: protected PR CI `38152679294`, main CI `38153426248` and [installer/publish workflow `38153926977`](https://github.com/iisara555/STeP-AI-Harness/actions/runs/38153926977) all pass. Local Windows root 968/8 platform skips, Desktop 675/4 platform skips, frozen install, both validators, format, build and all 42 Electron smoke scripts pass. Mac DMG signature/guide and packaged launch pass. Separate #151 first reproduced the native fullscreen-exit hang, then synchronized enter/leave events with all assertions retained and bounded waits; corrected native CI passes. Zero extra live model calls; original external budget/report hashes remain unchanged. Employee/Office acceptance below is still open.

## In progress

- **Office Skill acceptance / fixed budget**: all six account-listed models were evaluated once on clean source `449424b` through Desktop OAuth (self-test → list → authenticated probe → live), with synthetic inputs and the original external ledger. 43 new admitted calls plus 2 prior astra calls remain unchanged. Three comparable Excel pairs: gpt-6-luna passes with Skill only; gpt-6-sol and gpt-5.6-sol pass both arms. PPTX pairs are incomplete; memo is unrun because every model reached its token admission threshold. Human recalculation/rendering/semantics remain unverified. Reporting/source fixes #144, #147–#150 are merged; they do not authorize quota/auth retries, reseeding, new budget folders, extra live prompts or lifecycle promotion. Private recordings/reports remain outside Git; original budget/report SHA-256 is unchanged.

- **Office prompt cost — live savings unproved**: 14/19 recorded arms expose usage (631,172 input / 6,395 output tokens); 169,533 ledger tokens cannot be attributed retrospectively. The merged #150 scopes the eval host to its four executable tools in both arms while retaining WITH Skill/references and normal Desktop gates. Offline reconstructed system text is 67% shorter WITHOUT and 41.5–48.8% shorter WITH; these are character savings, not provider token savings. Per-turn metadata survives failed calls and rejects stale context. Live token savings and complete PPTX/memo evidence remain unproved.

## Waiting on the owner

- **Audit changes — employee acceptance**: synthetic Windows/macOS Electron CI covers receipt/source confirmation, HTML fit/fullscreen, Dev controls, capability/policy disclosures, startup recovery and modal focus. Real OCR/AFP outcomes, signed-in account/image/MCP entitlement, native screen readers and employee workflows still need acceptance; CI does not certify those results.
- **HA05 knowledge answers**: local top-document retrieval/abstention reaches 61/61 on the original staff corpus with paraphrase/independent synthetic regressions. Live answer quality and unseen staff questions remain unproved; titles and retrieval tests do not approve organization decisions.

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
