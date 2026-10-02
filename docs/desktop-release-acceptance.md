# Desktop release acceptance after PR #88

Scope: the behavior introduced at `0d7481a` and merged by PR #88, plus this follow-up. Automated fixtures prove app behavior under controlled conditions. They do not prove provider eligibility, real OAuth, MIS access, signing, or employee-device acceptance. An unchecked row remains **pending**, even when CI is green.

## Automated merge checks

| Area | Executable evidence | Pass condition |
|---|---|---|
| Chat, tools, questions, cancellation, session reuse | `desktop/test/chat-smoke.mjs`, `tool-loop-smoke.mjs`, `account-connect-smoke.mjs`, `phase2-service.test.ts` | Synthetic provider; interaction completes and no hidden native tools run |
| Gemini configuration | `desktop/test/ui.test.ts`, `gemini-api-smoke.mjs` | Organization sign-in requires a syntactically valid project; API path independent |
| Browser | `desktop/test/browser-agent-smoke.mjs`, `phase2-tools.test.ts` | Fresh references, native select, disabled options, stale DOM, login suppression, recognized final controls blocked before approval |
| Packaged Windows/macOS | `desktop/test/packaged-launch-smoke.mjs` | `app.isPackaged`, expected architecture/resources, synthetic connect, chat → file → question → answer, export, memory, restart persistence |
| Windows installation | `desktop/test/installer-upgrade-smoke.mjs`, `installer-payload-smoke.mjs` | Isolated application identity; fresh install, normal reinstall, simulated failing 0.3.2 uninstall migration, real test-profile state retained, uninstall preserves database |
| README | `desktop/test/readme-screenshots.mjs` | All five screenshots generated against current UI, uploaded by Validate workflow; inspect them before replacing published images |
| Organization policy | `desktop/policies/organization.json`, `policy.test.ts`, `pilot.test.ts`, `policy-smoke.mjs` | Both optional checks enabled in managed example; credential-only default accurately documented |

`desktop-release.yml` builds on PR changes and uploads `acceptance-*` JSON separately from installer artifacts. Windows runs the NSIS tests; macOS uses native Apple silicon and `macos-15-intel` runners. Packaged fixture reports explicitly say `synthetic: true`, `liveAccount: not-tested`, and `gatekeeperOrSmartScreen: not-tested`. A fresh fixture database preserved across reinstall does not prove migration from every historical production schema.

## Live release gates (pending until evidence is attached)

Use an authorized test account and non-sensitive sample files. Record commit, installer SHA-256, OS/build, CPU architecture, app/runtime versions, account **tier only**, date and reviewer. Keep credentials, callback URLs, auth codes, employee data and private pages out of public CI artifacts.

| Gate | Actual test required | Evidence / stop condition |
|---|---|---|
| ChatGPT OAuth | Fresh renderer sign-in → model list → answer → tool read → follow-up; restart; logout and reconnect; revoked/expired session; quota/error display | Video/screenshots with account data removed plus run metadata; no success claim from `account/read` alone |
| Gemini API and organization OAuth | API response and tool cycle; separately licensed Standard/Enterprise account with authorized Cloud project → fresh sign-in and restart; invalid project/denied entitlement recover clearly | Consumer Google AI Pro/Ultra is not CLI entitlement. Do not list consumer OAuth as supported. No real account tested by the fixture |
| Antigravity | Check official CLI version, account entitlement and native tool isolation **before** inference; verify cancellation/logout semantics | CLI 1.2.14 remains blocked by `ANTIGRAVITY_TOOLS_UNAVAILABLE`. Do not remove that guard to make a test pass. Keep experimental/unavailable until isolation and a live tool cycle are proven. Native credentials can use the OS keyring; disconnect is not native logout |
| MIS | Employee opens login and completes credentials/MFA themselves; agent receives no login fields; read permitted page after login; fill/select draft fields; cancel; session expiry; detected submit/approve/e-sign remains manual | Administrator's description of same-origin login is not acceptance. Cross-origin SSO, iframe/shadow DOM and custom controls may be unsupported. A custom final-action control missed by the heuristic must not be delegated |
| Windows release | Install exact downloaded production artifact on clean employee-like Windows; normal launch; chat/tool/export/restart; upgrade a backed-up previous real version/profile; verify conversations, settings, connections and memory | CI fixture uses a different installer identity. Record SmartScreen/signature result and actual migration source version; no claim of trusted distribution from CI alone |
| macOS release | Download and install exact DMG on Apple silicon and Intel; Gatekeeper/quarantine path, launch, OAuth, chat/tools/export/restart and upgrade existing profile | Ad-hoc signing is not Developer ID/notarization. Record signing/notarization status and OS acceptance for each architecture |
| Response time | At least 5 cold and 5 warm turns per offered provider; simple chat, local file, user question, browser read, cancel/retry | Record median/range for click-to-visible-answer and total time, tool/consent wait separately. Set rollout target before sign-off; fixture milliseconds are not provider latency |

Manual recorder from `desktop/`:

```sh
node test/live-check.mjs "/path/to/packaged/executable" acceptance-local.json
```

The recorder creates an isolated profile, leaves sign-in, terms and all requests to the operator, supports recording/restart, and records only status/timing metadata. It does not mark the matrix passed. `--dev` is useful for diagnosis but is not packaged acceptance. Use the UI to sign out before removing the retained profile. No real-account recorder run has been performed by this change.

`RunTrace.firstResponseMs` measures time to the first provider text delta, which can be tool protocol; it is **not** user-visible first-token time. Total run time includes human and tool waits. The three-second heartbeat proves host liveness, not model progress; provider steps may wait up to ten minutes. Record perceived latency independently in the live checklist.

## Follow-up measurements

Pending-memory count is exposed in the footer; confirm/reject remains a human choice. Broader Thai synonyms and router improvements should use a reviewed golden set with positive and unrelated-query cases before changing scoring thresholds. Bundle-size optimization and a larger latency study can follow a limited pilot; the live release gates above cannot be replaced by those optimizations.
