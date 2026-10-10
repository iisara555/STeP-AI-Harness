# AGENTS.md — working in this repository

For coding agents (Codex, Claude Code, others) and the people driving them. This is a directory page: read what a
task needs, not everything. Employee workspaces get a different, generated `AGENTS.md` from `step-ai init`; do not
run the installer inside this checkout, it would overwrite this file.

## Start of every session

1. Read [`docs/progress.md`](docs/progress.md): what is in flight, what waits on the owner, the latest release.
2. `git fetch origin main` and check the latest Desktop release (`desktop-v*` tags / GitHub Releases). Several agents
   push to this repository; do not assume your last view of `main` is current.
3. Work on a branch and open a pull request. **Never push to `main` directly**: CI runs on pull requests, and a red
   `main` blocks every release.

## Map

| Path | What it is | Read first |
| --- | --- | --- |
| `desktop/` | STeP Desktop (Electron + React): chat, document drafting, receipts, AI connections | [`docs/desktop-development.md`](docs/desktop-development.md) |
| `desktop/electron/` | Main process: providers, tool loop, policy, permissions, memory, updater | [`docs/desktop-tool-loop.md`](docs/desktop-tool-loop.md), [`docs/desktop-policy.md`](docs/desktop-policy.md) |
| `src/` | Harness CLI and modules (router, privacy gate, skills, installer) | [`docs/architecture.md`](docs/architecture.md) |
| `skills/`, `rules/`, `manifest/` | Skills, writing/safety rules, registries | [`docs/developer-guide.md`](docs/developer-guide.md) |
| `docs/knowledge/` + `manifest/documents.yaml` | Organization documents the app answers from | [`docs/knowledge/README.md`](docs/knowledge/README.md) |
| `experiments/local-thai-ocr/` | Local PaddleOCR service for receipts | its README |

## Done means verified

Run the checks for what you changed before saying a task is done, and say which ones you ran:

- Desktop: `cd desktop && npm ci && npm run format:check && npm test && npm run build`
- UI or Electron main-process changes: also the relevant `node test/<name>-smoke.mjs` (Linux needs `xvfb-run -a`);
  CI runs the full `npm run test:electron` on macOS.
- Harness (`src/`, `skills/`, `manifest/`): `npm test` and `python3 scripts/validate_repo.py` at the root.
- A test that fails without your change too is not yours to skip: name it in the PR. Never disable or delete a test
  to get green. `desktop/test/office-skill-benefit.test.mjs` cannot run in cloud containers (no Office runtime).

## Rules that are easy to break

- **STeP answers come from STeP documents.** Anything about STeP must be answered from organization documents, never a
  generic answer. Keep this in any prompt-size or token-saving change. A new organization document goes in
  `docs/knowledge/` and must be registered in `manifest/documents.yaml`, or the app will never find it; the knowledge
  benchmark must stay at or above its floor (59/61 since the MIS ISO register, `desktop/test/knowledge-accuracy.test.ts`).
- **Thai first.** Staff-facing text is Thai; English UI strings go in `desktop/src/locales/en.ts`.
- **One task per pull request.** Do not refactor or "tidy up" unrelated code in the same change.
- **Versions.** Before bumping `desktop/package.json`, check the newest `main` and published releases; two agents have
  picked the same number before. A version bump also updates the lockfile, `desktop/src/whats-new.ts`, both READMEs'
  version lines and `CHANGELOG.md` (one `## Desktop vX.Y.Z` section, newest first; work in progress goes under
  `## Unreleased`).
- **Releases only when the owner asks.** Publish by running the `Build STeP Desktop installers` workflow
  (`desktop-release.yml`) on `main` with **publish** ticked (tag pushes are blocked from cloud sessions). Releases build
  Windows x64 and macOS Apple silicon only. Several ready pull requests ship as one combined release.
- **Decisions already made:** installers stay unsigned / not notarized; Claude subscription sign-in is a developer-only
  pilot behind policy `features.claudeSubscription` (see [`docs/claude-subscription.md`](docs/claude-subscription.md)).
- **Secrets and privacy.** Never commit keys, tokens or real staff data; tests use synthetic data. The privacy gate
  and permission checks are not to be bypassed for convenience.

## End of every session

Update [`docs/progress.md`](docs/progress.md) in the same pull request: what you finished, what is left, what waits on
the owner. Leave no stray files, temp folders or half-applied changes behind.
