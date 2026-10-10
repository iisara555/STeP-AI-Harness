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

- Branch `fix/plugin-home-tests-20261010`: portable `~/` link checks fixed; root tests pass 952 with 3 skips on Linux. Independent review passed; awaiting PR merge, no release change.
- Separate knowledge-search and tool-result/policy fixes are in review worktrees, not yet merged.

## Waiting on the owner

- **Claude Pro pilot** on the owner's machine: the policy file has a problem since 2026-10-09 13:31 (`policy-problems: 1`
  in diagnostics), so `claudeSubscription` is not applied. After PR #126 the policy tab names the reason.
- **Antigravity streaming** needs one check with a signed-in `agy`: whether `ttftMs` in `diagnostics.jsonl` is now
  lower than `ms`.
- **HTML preview on employee Windows/macOS machines**: still awaiting native acceptance. On 2026-10-10 real Electron/Linux/Xvfb passed public-CDN Chart.js rendering, Three.js module loading, SwiftShader WebGL rendering, fullscreen, local-file blocking and device-permission denial. Run used `--no-sandbox`, so it does not certify the OS sandbox or native GPU.
- **Branch protection on `main`** enabled and read back on 2026-10-10: PR required, strict `validate`, `desktop`, `windows-tests` and `desktop-macos-electron` checks; admin enforcement, no force-push/deletion.

## Known issues

- `desktop/test/office-skill-benefit.test.mjs` fails in cloud containers (no Office runtime); not a code failure.
- macOS Apple silicon `tool-loop-smoke` timed out once at release time and passed on re-run.
- GitHub Packages workflow fails: package scope `@step-cmu` does not exist (403).
- Knowledge search misses: "ทีม HD ทำหน้าที่อะไร" finds no document; "แนะนำร้านกาแฟในเชียงใหม่" wrongly matches an HR
  document.
- Small models with a 4,096-token window cannot fit the smallest prompt.

## Not started (ideas the owner approved in principle)

- Antigravity image input; Learning Inbox shared across a team.
