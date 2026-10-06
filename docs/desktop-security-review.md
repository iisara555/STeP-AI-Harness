# Desktop security review — 2026-10-06

Scope: Desktop source and bundled document parsers at `a817d16` (0.5.18), the fixes recorded below, and the local OCR HTTP service used by Desktop. This review uses synthetic documents, simulated providers/key stores and loopback fixture servers. It is not a penetration-test certification or a claim that all vulnerabilities have been found. Application/package versions and managed-policy defaults are unchanged.

## Confirmed findings and changes

| Boundary | Before | Result after the fix | Evidence |
| --- | --- | --- | --- |
| Workbench hard links — high impact | A benign workspace filename could refer to an inode outside the workspace, exposing or overwriting another file. | Multiply-linked regular files are rejected on path validation and bounded reads; a link substituted after staging is rejected at apply. | `desktop/test/workbench.test.ts`: read, bytes, stage and apply refused; synthetic outside content unchanged. |
| Git pathspecs/status — high impact content exposure, plus filename metadata | A literal filename such as `*.md` expanded in Git diff and included a file denied by managed policy; raw status also exposed denied filenames. | The content-producing diff uses literal pathspecs; parsed status and detected renames/copies obey the same path denials. | `desktop/test/workbench.test.ts`: allowed wildcard-named file appears; denied document content/filenames and a staged rename of a denied source do not. The wildcard filename test runs on POSIX because Windows forbids `*` in filenames. |
| Local OCR Host/Origin — conditional browser exposure | Loopback requests with a foreign Host or cross-site Origin reached the OCR worker. Loopback binding alone did not enforce the browser boundary. | Local binding accepts only the server's localhost/127.0.0.1 authority; supplied Origin must match it. Foreign/null origins and rebound hostnames receive 403 before body processing. | `test/ocr-service-security.test.js` runs standard-library Python HTTP tests with a fake worker; Desktop requests without Origin and the same-origin trial UI still succeed. |
| Local OCR resource exhaustion | Upload bodies and request threads could queue behind a busy worker. | A busy worker returns 503 before reading another document; body reads have a timeout and incomplete uploads are rejected. | Python service-security test holds the worker lock and verifies immediate rejection. |
| Linux credential fallback | `isEncryptionAvailable()` alone accepted Electron's `basic_text` backend, which uses a fixed password. | API-key/OAuth-token reads and writes require a supported OS-backed key store. Linux basic_text/unknown/unavailable stores are refused; Windows/macOS still require encryption availability. | Security unit tests cover platform/backend combinations; app IPC smoke verifies that rejected key storage creates no connection. |
| Update/sign-in reliability | Mac write-stream errors escaped download failure handling; renamed `.app` bundles could not update; Antigravity timeout/late exit could cancel a later prompt. | Download pipeline rejects read/write failures, removes incomplete archives and retains SHA-512 verification; swap locates the archive's canonical bundle independently of the installed name; attempt cleanup cannot cancel another attempt. | Mac-update and Antigravity regression tests, including synthetic swap execution. The native Mac swap test remains conditional on macOS. |

## Additional protection and verified boundaries

- App data/log directories are private (0700) on POSIX, including existing profiles. Existing linked SQLite database/WAL/SHM files and symlinked data/log directories are refused before SQLite opens them. Windows continues to depend on its per-user profile ACLs; this review does not configure or certify Windows ACLs.
- Agent-browser DNS checks cover subresources and redirected requests as well as initial pages. DNS failures/timeouts and disallowed private addresses fail closed; managed `network.privateHosts` retains its explicit intranet allowance. A synthetic Chromium test checks that a public-looking hostname resolving privately is inspected and blocked. Chromium owns the final connection, so this is **not DNS pinning** and does not prove resistance to every rebinding race or proxy/DNS configuration.
- Main renderer: sandbox enabled, context isolation enabled, Node integration disabled, inline scripts blocked by CSP. A real Electron test gives a separate window the preload bridge deliberately and verifies host-side `UNTRUSTED_SENDER` rejection. The application only accepts its own main frame. Unknown preload operations remain denied.
- Model Markdown: raw active HTML, executable links and remote image loading are rejected/escaped. Syntax-highlighted code remains escaped. External browser pages receive no app preload or Node capability.
- SQLite statements bind parameters. Workbench paths enforce workspace containment, managed denials and sensitive-file restrictions. File writes retain staging/conflict checks, approval gates and snapshots. Tool effects and content transmission remain separate decisions, and changing policy/workspace invalidates pending consent.
- Native provider runs disable their own tools and use controlled runtime homes; administrator-configured command/MCP integrations and explicitly approved shell commands remain trusted code, not an OS sandbox. Docker isolation is separately gated and uses read-only selected snapshots, no network and resource limits.
- Document parsing is bounded and worker-isolated; PDF evaluation/network loading and XML DTD/declared entities are disabled. API secrets stay out of renderer snapshots and use OS key storage. Ordinary transcripts/drafts in SQLite are **not encrypted by the app**.
- Local OCR logs contain method/known route only, excluding document filenames, query values and unparsed request contents. Trial artifacts and real documents remain outside the public repository; the OCR acceptance gate remains open.

## Dependency evidence

`npm audit` initially reported 15 affected Desktop packages (12 high, 3 moderate), resulting from three advisories in build/download dependencies. They are not 15 independent application exploits. Targeted overrides preserve the application version and current toolchain:

| Dependency | Remediation | Advisory |
| --- | --- | --- |
| http-cache-semantics | 4.3.0 | GHSA-ch52-4w7c-c8xp |
| source-map-js | 1.2.2 | GHSA-68fv-2mgg-jv7q |
| sprintf-js through roarr/global-agent | Use global-agent 4.1.3 for @electron/get, removing this dependency chain; proxy bootstrap checked. | GHSA-hp3w-g68c-fv3c |

After the change: Desktop full and production-only dependency audits report zero known advisories. The `scripts/privacy-vendor` lockfile audit also reports zero. The Harness root has no dependency lockfile/dependency declarations to audit; a failed root `npm audit` is not a clean audit. These results describe the advisory database at review time, not undiscovered vulnerabilities in Electron/Chromium, native ML models, operating systems or vendor services.

## Limits and organizational deployment decisions

1. Windows/macOS installation, native update/rollback, filesystem ACLs, OS-keychain interaction, Google OAuth and live provider accounts need native-machine verification. Linux mocks do not establish those outcomes. No real receipts or paid/provider-account calls were used.
2. macOS currently uses ad-hoc signatures. SHA-512 from the HTTPS release feed and codesign integrity checks protect against delivery corruption; they do not independently authenticate a trusted publisher if the release account/feed is compromised. Organizational rollout should use an approved signed/notarized distribution channel and protected release credentials. No signing keys, release settings or policy defaults were changed here.
3. Browser address checks do not pin Chromium's connection to the checked DNS answer. Enforce organization egress/proxy controls where intranet protection is required. An explicitly allowlisted intranet site is trusted within that allowance. Browser labels for final actions are heuristics; administrator approval rules and application/server permissions must remain authoritative.
4. An approved arbitrary shell command, custom runtime, administrator hook or MCP process has the employee's OS privileges unless separately sandboxed. Pattern denials and repeated path checks do not certify protection against encoded commands or a hostile same-user process racing filesystem operations. Do not treat them as an OS security boundary.
5. Protect local transcripts/backups with OS account access, disk encryption and managed backup controls. A compromised OS account, administrator or malicious native dependency is outside the demonstrated application boundaries. Native OCR model/parser runtimes were not installed or audited as part of this synthetic review.
6. Default `checks.privacy` and `checks.authority` remain off as configured by the repository. Organizations handling controlled data should explicitly enable and test their managed checks, allowed providers, tool permissions and release channel. Privacy detection is pattern-based and original images need their own review. This review neither enables those policies nor grants permission to transmit organizational data.

## Reproduction and required checks

```sh
npm test
npm run validate
npm run desktop:test
npm run desktop:build
npm --prefix desktop run format:check
npm --prefix desktop run test:electron
npm --prefix desktop audit
npm --prefix desktop audit --omit=dev
npm --prefix scripts/privacy-vendor audit
```

The default Harness test command includes the new OCR HTTP-security runner; Desktop's unit-test glob includes the regression/security tests. New app/agent network smoke tests are in `desktop/package.json` `test:electron`. Linux Electron tests require a display such as Xvfb. Cloud tests use temporary homes/fixture data and the environment's process-reaping wrapper.

Final validation on Linux:

- Harness: 901 tests, 899 passed and 2 platform/environment skips.
- Desktop: 406 tests, 404 passed and 2 native-platform skips (macOS bundle swap and Windows launcher).
- All 27 Electron smoke scripts passed. Receipt UI also passed separately with a synthetic image and fake OCR; affected chat/tool-loop smoke scripts were repeated after the final Git status filtering change.
- Harness validation, Python validation wrapper, Desktop build and format checks passed. OCR worker-failure isolation/cleanup checks passed.
- Full Desktop, production-only Desktop and privacy-vendor dependency audits reported zero known advisories.

Passing synthetic tests do not close real-device or real-document acceptance gates or establish real-document OCR accuracy.
