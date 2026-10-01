# Claude Code OAuth follow-up

Date: 2026-10-01. Review branch: `codex/claude-oauth-followup`, based on `codex/openharness-phase6`.

## Authentication observed on this machine

The user renewed authorization to follow up the existing local Claude Code account after the earlier Phase 6 evaluation stopped at `LOGIN_REQUIRED`. Both the installed CLI and bundled runtime initially reported logged out, with both the personal and temporary home. This comparison did not establish profile isolation as the cause of the missing login.

The official CLI printed an authorization URL on `claude.com` but did not open the browser when launched with piped output. A local helper opened that URL without sending it to chat or diagnostics. The browser returned a manual code, so the user completed a fresh sign-in directly in a local terminal running the unmodified Claude Code binary. Authorization codes and credentials were not read into chat or copied to STeP storage.

The approved existing profile then passed `auth status --json` through Claude Code **2.1.284**, with the reported configuration directory verified. A single bounded generation probe returned exactly `EVAL_READY` and reported **466 input + 9 output = 475 tokens**. No native tools were enabled. This proves that the selected account and runtime generated that response; it does not establish the root cause of the earlier generation failure.

The personal npm CLI remains **2.1.221** and was not upgraded. The existing application minimum **2.1.268** remains enforced. Evaluation selected the already installed SDK runtime, not a credential migration or a global CLI upgrade.

## Browser launch repair

`desktop/electron/claude-auth.ts` now uses the connection host's existing `openExternal` callback for the complete authorization URL emitted by the official CLI. It accepts HTTPS only, the exact `claude.com` or `claude.ai` hostname, `/oauth/authorize`, the code response type and required OAuth parameters. It rejects alternate ports, user information, fragments, lookalike hosts, unrelated endpoints and incomplete output chunks.

Each login opens at most one link. URL and manual code stay process-only; progress contains no auth details. The CLI owns account selection, callback handling and credential persistence. Browser launch failure cancels the CLI and closes the pending code dialog with `LOGIN_BROWSER_FAILED`; synchronous and asynchronous failures are both covered. A previously signed-in profile does not reopen login.

The live sign-in above used the official CLI terminal. The application browser repair is validated with synthetic native-process fixtures, not a live STeP employee connection.

## Feature evaluation

The rerun passed **5/5 groups**, with **8 real provider calls** and **100,329 reported tokens**, within the configured 14-call bound. The token total includes provider-reported cached input; it is not a charge estimate. Evidence remains separated:

| Group | Evidence | Outcome |
| --- | --- | --- |
| Memory, follow-up and attachment retention | Live generation with actual host memory/history | Pass |
| Compaction | Live summary with actual compaction | Pass |
| Read consent, staged write and blocking hooks | Deterministic local tool fixture | Pass |
| Checkpoint retry/resume | Live drafts with an injected quota failure | Pass |
| Coordinator | Live subtasks/merge with fixed decomposition and approval | Pass |

The failed-step resume took about 237 seconds; the successful rerun was not instantaneous. The synthetic consent measurement remains three clean-read dialogs reduced to one, or four reduced to two including a staged-write result. This is not an employee usability study or proof of provider-native tool denial.

Local report: `desktop/eval-results/2026-10-01T05-04-52-619Z-matrix/report.md`. The earlier failed report remains available and has not been rewritten as passing.

## Golden quality evaluation and output review

The three live scenarios each produced a saved draft, with **91,985 reported tokens** in total. The shared runner then rejected each output with `PRIVACY_REVIEW_REQUIRED`. The original evaluator retained the draft but lost that post-generation error code, displaying `error` and `0/0` checks. Formal Golden acceptance remains **0/3**, not a successful release or quality gate.

An offline replay of the saved drafts through the unchanged shared output gate reproduced the failures with **zero additional provider calls**. Signals were `name-table-review` for TOR and `unresolved-identifier` for meeting/ISO drafts. All were `human-confirm`, with no redaction change. An independent local rubric check passed **14/14 checks**: TOR 6/6, meeting 4/4, ISO 4/4. This assesses content checks only and does not override the output gate.

Spot review found that the drafts retain the total budget without inventing installments, keep missing owners unconfirmed, separate a workshop proposal from a meeting decision, and mark the audit criteria and document revision as unconfirmed. The TOR timeline still depends on unverified procurement timing and holiday assumptions; it is a planning draft, not an operationally approved schedule.

`desktop/eval/golden.ts` now retains a safe typed error from preflight/post-generation failure even when WorkService has no failed trace. Reports identify blocked runs as **not graded** and list their codes. A regression uses a synthetic unresolved-name table and the real shared Privacy Gate. No privacy rule was relaxed and the saved live report was not overwritten.

Original live report: `desktop/eval-results/2026-10-01T05-13-00-768Z-claude/report.md`. Offline analysis: `offline-review.json` in that same ignored folder. Attended output review remains required for formal Golden acceptance; no further paid rerun was performed after diagnosing this local gate.

## Local verification

- **220 Desktop tests passed**, including four browser-link, piped-login, browser-failure and post-generation error-code regressions.
- TypeScript/production build and formatting passed. The existing renderer bundle-size warning remains.
- Chat/tools Electron smoke passed with an isolated synthetic profile.
- Both repository validators passed with **51 Skills**. Full Harness tests were not rerun locally for this Desktop-only repair.

## Scope and remaining acceptance

The existing employee subscription feature remains disabled by default. Evaluation uses an explicitly named profile and user-owned quota; it does not enable product sign-in or grant distribution approval. No logout, credential inspection/copy, main merge, policy change, installer or release was performed.

Successful local evaluation is separate from approval to offer subscription login in a product. The current [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) requires prior approval for third-party products offering claude.ai login. The [Claude Code credential-use guidance](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) distinguishes product routing from a user signing into the unmodified Claude Code binary. The supported API/Console route and future product review remain separate from this user's local account check.

Live STeP connection sign-in/restart/expiry/logout, macOS, packaged installs, native tool-denial acceptance and broad document-quality review remain unverified. Reports use synthetic public inputs and stay under ignored `desktop/eval-results/`.
