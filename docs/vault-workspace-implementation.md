# Vault and employee Google Workspace implementation

This branch implements the initial local Vault and native employee Google Workspace path described in PR #162. It does not publish a release, configure a Google tenant or establish live employee-account acceptance. Both new capabilities default to off. Existing organization MCP and optional `gws` setups keep their separate authentication and operation contracts.

## Employee flow

Open **Settings -> Passwords and connections**, or use local `/vault` or `/google`. Save a website account in the trusted form, enter username/password yourself and explicitly choose to remember it on your personal device. Labels/origins are visible; saved plaintext is never read back through IPC. Editing requires entering the username again; leaving password blank retains the existing password. API keys remain managed through the existing AI connection screen.

The AI can discover `browser_vault`, list handles for its own browser tab's exact HTTPS origin, request the secure form or request one approved fill. The host checks the top-level POST form and action origin before approval and again at execution. Credentials are structured arguments to a private CDP primitive, not code strings, argv, model input or a public evaluation tool. Changed targets stop filling; partial results list the fields already filled. A username-first attempt binds the next password fill to the same credential revision for five minutes. Google OAuth login is excluded from browser password fill.

After a fill, model-facing DOM reads and screenshots for that tab remain disabled. The employee handles Next/Login/MFA in the visible browser. After inspecting the page, open Settings and choose **Reviewed: resume AI website reading**. This confirms resumption for the selected tab; it does not certify that a compromised website cannot encode/reveal credentials. Exact-origin checking cannot establish a website's trustworthiness.

Google Workspace uses a separate employee OAuth grant. Choose administrator-enabled services, review the requested set and complete authorization in the system browser. No Google password/token is entered in chat. Adding services starts an explicit authorization flow, not installed-app incremental authorization. A masked account identifier and granted services appear in trusted Settings; models receive session-bound account handles. Fixed Google operations still ask for the exact account/resource/payload. Sending a Google result to the AI requires an additional result-specific privacy/transfer decision, even if general privacy checks or pilot mode are off.

Google API service adapters implement bounded Drive listing; Docs get/create/revision-bound append; Sheets get/range-read/create/RAW range update; Slides get/create/revision-bound text-slide append; Gmail selected-query listing/get/plain-text draft/send; Calendar listing/bounded events/create; Tasks lists/list/create/complete; Chat spaces/messages/send; and Meet space get. Sharing, deletion, attachments, arbitrary batch updates, recording, Apps Script execution and domain-wide delegation are not exposed. Sheets updates target an exact reviewed range; they do not claim an atomic cross-user revision lock. Native document create/read receipts include a validated Google document URL when a document ID is returned.

`drive.file` operates on files already granted to the app or created by it. This implementation does not embed Google Picker or pretend that pasting a file URL grants access. Separately enabled `drive-read` requests `drive.readonly` for reading existing files and wider Drive search; that restricted scope requires administrator/Google policy review. Existing-file writes still require `drive.file` access. Original-service buttons open fixed official HTTPS pages in the system browser without injecting tokens/cookies. Verify the browser's account independently.

## Storage and execution invariant

`desktop/electron/vault.ts` stores encrypted records in `<userData>/vault/vault.sqlite` with a random 32-byte data key wrapped by Electron `safeStorage`, AES-256-GCM, unique 12-byte nonces and authenticated canonical metadata. Key creation and record writes use durable SQLite transactions; integrity/storage failures preserve existing ciphertext. The existing secure-backend guard rejects unavailable OS protection and insecure Linux backends. There is no master-password/biometric reauthentication claim or plaintext export endpoint.

Saving the first protected credential is denied while tasks, connection setup, command hooks or local MCP executables may be running. Once a wrapped Vault key exists, app-owned terminal commands, custom provider runtimes, command hooks, stdio MCP and sandbox execution remain denied across every session. Permission gates recheck after approval; the Workbench also checks at spawn. Suspend, feature disable and deleting the last entry do not release this restriction, because stored keys, ciphertext/WAL or browser state can remain. Settings explains that consequence. Trusted fixed provider/Office runtimes retain their existing denial/validation contracts; this is application capability enforcement, not an OS sandbox against other software running as the same OS user.

Pausing Vault persists across restart, invalidates handles and cancels app generation. Workspace/team/mode/policy changes invalidate pending credential/account handles. A policy-designated shared device cannot enroll remembered website/Google credentials. Profile directories and Vault paths retain the existing private-path protections. JavaScript strings cannot guarantee erasure of every plaintext memory copy. No key-rotation UI, external password-manager adapter, device-transfer recovery or trusted monotonic protection against whole-store backup replay is claimed in this implementation.

## Legacy API-key migration

In Desktop 0.6.5, enabling the feature exposes Vault without enrolling API-only profiles. Explicitly remembering a website account or connecting Workspace creates the first protected credential and starts legacy API-key migration; startup retries migration only for an already protected profile, and subsequent key use migrates remaining records. Each key is decrypted only in main, saved and read back in the new bound record, then the original SQLite transaction stores `credential-ref`, archives the encrypted legacy record under `vault-legacy` and sets `secret` to null. References are authoritative: readers never fall back if a referenced Vault entry is missing or invalid. A crash before publishing the reference can leave an unused new encrypted record; the legacy source remains readable for a subsequent migration attempt. There is no cross-database atomicity claim.

Replacing/deleting the key clears archived fallback and the old `secret` record. An older app that knows only `secret` therefore requires reauthentication rather than silently reviving an old key. Delete never revokes a remote account by itself. Encrypted recovery remnants are not automatically exported or used as credentials. Cleanup is scoped; SQLite/WAL does not establish secure physical erasure.

## Desktop 0.6.5 release activation

The owner requested availability on every released installation. Vault and Workspace are enabled by release defaults; existing managed denials still apply. Only the public installed-app client ID is distributed. Employees must authorize their own Workspace account and select services. A developer can use the one-click Dev mode switch for a personal Claude Pro/Max demo, then switch back manually. This is not confirmation of live account/service acceptance or organizational Anthropic approval.

## Administrator configuration

Merge these non-secret fields into the existing protected Desktop policy only after the organization reviews the account/data flow. Replace the synthetic client with an organization-owned **Desktop app** OAuth client and confirm the allowed Workspace domains for the intended cohort. Do not replace other policy fields or distribute a confidential web-client secret.

```json
{
  "features": { "vault": true, "googleWorkspace": true },
  "credentialStorage": { "sharedDevice": false },
  "googleWorkspace": {
    "clientId": "synthetic-client.apps.googleusercontent.com",
    "domains": ["step.cmu.ac.th"],
    "services": ["documents", "calendar-read", "tasks"]
  }
}
```

Supported service names are `documents`, `drive-read`, `gmail-read`, `gmail-draft`, `gmail-send`, `calendar-read`, `calendar`, `tasks`, `chat`, and `meet`. Enable only implemented services approved for that cohort. Required APIs, OAuth audience, organization app access, Google verification/assessment requirements, quotas/edition entitlement, retention and approved AI destinations remain administrator responsibilities. The owner supplied a verified Desktop app client on 2026-10-14 and requested release-wide activation. Desktop 0.6.5 bundles only its public client ID, with `step.cmu.ac.th` and documents/calendar/tasks selectable. No client secret is needed in policy or bundled. Managed policy can replace or clear the configuration and deny these capabilities. Project API enablement, audience/test-user setup and tenant access remain separate from client-type validation.

On 2026-10-14, a user-authorized identity-only Google OAuth Playground check verified a signed, unexpired ID token with `hd=step.cmu.ac.th`, matching issuer, audience and the requested account. No refresh token was requested or received. This confirms that account's hosted domain, not a configured Desktop grant or live Workspace service acceptance. No account identifiers or tokens are recorded here. The authorization URL now supplies the configured domain as a UI hint (or `hd=*` for multiple domains); the signed claim allowlist remains the access check.

The native connector uses PKCE S256, state/nonce, a bounded one-use random loopback callback, signed OIDC validation against Google's JWKs, and issuer/audience/expiry/verified-email/domain checks. Refresh tokens are separate purpose-bound Vault records; refresh is serialized per account and preserves an omitted replacement token. No provider/CLI auth profile is imported. OAuth/MCP identities remain separate. Network calls use fixed endpoints, time/output limits and redirect denial; token values and private error bodies never reach returned receipts. Unknown write outcomes are not retried automatically.

Pause denies new operations without revoking the grant. Local disconnect removes the account/reference and writes a tombstone; remote authorization can remain. Remote revocation asks separately and may affect other devices sharing that OAuth grant. Failed revocation retains the connection so the employee can retry; no false remote-success receipt is returned. Neither action signs out the system browser or Gemini/Antigravity, nor deletes Google documents.

Official references: [installed-app OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Workspace user-data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage). Recheck current Google policies before activation.

## Verification and remaining acceptance

- 2026-10-14 follow-up: the configured hosted-domain authorization hint is covered by all 11 Google connector regressions; root tests pass 969/977 with 8 existing platform/dependency skips, alongside both repository validators and formatting. Regenerated linked plugin documentation resolves the stale-plugin CI check. The latest remote checks must still run against the follow-up commit.
- Native macOS follow-up `9218caa` passed unit/evaluator and all prior Electron checks, then reached the Vault success message before the job timed out without a Settings result. That log cannot distinguish Vault cleanup from Settings startup. Both new smokes now report lifecycle phases and have 90-second failure watchdogs; the browser fixture explicitly closes its final owned view before app shutdown, and Settings waits for onboarding before saving the legacy key. All storage/migration/browser/approval assertions remain; workflow and operation timeouts are unchanged. Windows native reruns pass; final macOS CI acceptance remains required.

- `desktop/test/vault.test.ts` and `google-workspace.test.ts` use synthetic fixtures for encryption/integrity, origin/session/grant races, username-first account binding, exact immutable operation approval, PKCE callback/state, OIDC signatures/claims, token-refresh concurrency, disconnect and withheld diagnostics.
- `vault-electron-smoke.mjs` uses real Electron/OS `safeStorage`, two separate processes with the same profile, and an exact-certificate local HTTPS fixture for one-page/identifier-first fill, changed-form partial outcomes and model-read suppression. This does not prove packaged-app upgrade behavior.
- `vault-workspace-ui-smoke.mjs` uses the real renderer/preload/IPC/SQLite, legacy encrypted API-key migration on restart, explicit remember consent, metadata-only state/edit, missing Google configuration, pause and terminal denial. Screenshots are synthetic and kept under ignored `desktop/release/qa/vault/`.
- Existing Desktop formatting, unit/build and relevant Electron regressions are required before committing. The two new native smokes are included in the existing macOS Electron CI command.

Remaining external acceptance: configured organization-owned OAuth client, approved test-account/resource API access, admin-denied and partially granted real consent, actual Shared Drive/Google editions, native account refresh/revocation on employee machines, packaged Windows/macOS install/upgrade and policy rollout. Source/synthetic evidence is not proof of these gates. Desktop 0.6.5 makes browser fill and Workspace connection available by release default with explicit employee enrollment/consent; actual service access still requires project/tenant and account acceptance; this branch authorizes no release or live-model benchmark spend.
