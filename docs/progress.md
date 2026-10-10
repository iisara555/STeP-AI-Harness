# Progress — what is in flight

Shared state for every agent and person working on this repository (see [AGENTS.md](../AGENTS.md)). Update it in the
pull request that changes the state. Newest first inside each section; keep it short and move finished items to the
CHANGELOG instead of growing this file.

_Last updated: 2026-10-10_

## Latest release

- **Desktop v0.5.38** (2026-10-10) — Windows x64 and macOS Apple silicon: PR #132 (agent `tasks` lifecycle,
  recursive `search_files`, exact staged `patch`, `tool_search`/`tool_describe`, three independent review rounds; four
  LOW output-masking items listed in the CHANGELOG remain). Intel Macs stay on 0.5.35. Harness **0.7.7**.

## In progress

- Desktop execution parity follow-ups: the four LOW output-masking items from review round 3 (CHANGELOG v0.5.38),
  native provider tool transport, and acceptance on real Windows/macOS process trees and live models.

## Waiting on the owner

- **Claude Pro pilot** on the owner's machine: the policy file has a problem since 2026-10-09 13:31 (`policy-problems: 1`
  in diagnostics), so `claudeSubscription` is not applied. After PR #126 the policy tab names the reason.
- **Antigravity streaming** needs one check with a signed-in `agy`: whether `ttftMs` in `diagnostics.jsonl` is now
  lower than `ms`.
- **HTML preview on a real machine**: WebGL (Three.js) and full screen inside the Web tab were not testable in CI.
- **Branch protection on `main`** (GitHub Settings → Branches): require pull requests and the `validate` checks, so
  no agent can push straight to `main`.

## Known issues

- `desktop/test/office-skill-benefit.test.mjs` fails in cloud containers (no Office runtime); not a code failure.
- macOS Apple silicon `tool-loop-smoke` timed out once at release time and passed on re-run.
- GitHub Packages workflow fails: package scope `@step-cmu` does not exist (403).
- Knowledge search misses: "ทีม HD ทำหน้าที่อะไร" finds no document; "แนะนำร้านกาแฟในเชียงใหม่" wrongly matches an HR
  document.
- Small models with a 4,096-token window cannot fit the smallest prompt.

## Not started (ideas the owner approved in principle)

- Antigravity image input; Learning Inbox shared across a team.
