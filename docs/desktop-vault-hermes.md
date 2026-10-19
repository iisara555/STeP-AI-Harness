# Vault browser workflows — Hermes behavior

Status: source for the next Desktop release. Enabled by default under `features.vault`; this document is not evidence of published installers or live account acceptance.

The owner requested Hermes-style Vault/browser behavior on 19 October 2026. The reference is NousResearch/hermes-agent `6e9b3e3b8852f12bf965f888213470574b72803e` and its [Passwords & Logins guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-vault). STeP implements the employee-facing capabilities on its existing Electron browser; it does not install Hermes or the Python Browser Use stack.

## Employee flow

Ask the assistant to open a website and sign in. It lists saved accounts for the exact HTTPS site and fills a selected login automatically, including both username and password. `submit: true` also presses the verified sign-in button. Saving a login grants future login use on that site; it does not grant purchases, sending, booking or approvals.

With no saved account, **Save login and sign in** opens a trusted masked dialog in the app. Enter the username and password there and explicitly choose to remember them on the personal device. The host saves and signs in without copying either value into a chat message. Cancelling ends the request. The older `request_save` action still opens Settings for compatibility.

An OTP step uses a saved authenticator key when present. Otherwise **Verification code** asks for the code in a masked dialog. The host supports RFC6238 SHA1/SHA256/SHA512, six to eight digits, custom period and `otpauth://totp`. Passkeys, hardware keys, CAPTCHA and approvals in another app remain employee actions. Add or remove an authenticator key in **Passwords and connections**. Codes and seeds do not go into Skills, Memory or chat.

`browser_vault` actions are `list`, `fill`, `save_login`, `enter_code`, `unlock`, and compatibility `request_save`. The input is the current task's browser tab ID. Models cannot supply a password, code, seed, card or address as tool arguments. Results include handles, labels, origin and login identifier, never a secret. Unlike the previous implementation, the identifier is intentional model-visible metadata, as in Hermes.

## Functions and defaults

| Capability | Default and behavior |
| --- | --- |
| Saved login | Automatic fill on the saved exact origin; no repeated fill approval |
| Save and sign in | Trusted dialog, explicit personal-device remember consent |
| Manual OTP | Trusted masked dialog, separate from `ask_user` and conversation persistence |
| TOTP | Generated on the host, bound to the selected login's exact origin before resolving the seed |
| Payment cards | Store in encrypted Vault; every fill requires a fresh human approval |
| Addresses | Store in encrypted Vault; automatic exact-origin fill |
| Final browser actions | Existing browser permission and final-action approvals still apply, including Verify/checkout buttons; card fill is not permission to pay |
| 1Password / Bitwarden | Auto-detect installed `op` / `bw` CLI; each source can be disabled, locked or unlocked in Settings |
| Coding tools | Available with their normal permissions even after Vault enrollment |
| Managed strict host gate | IT can set `credentialStorage.blockHostExecution: true` to retain the previous global execution restriction |

The function being enabled does not install password-manager CLIs, create accounts, unlock an employee's manager or override organization denial. Users sign in to those CLIs themselves. There is no export/import of an employee's real manager database in this change.

## Password managers

The managed strict host-execution policy disables CLI password-manager adapters as well. With the release default, both adapters are enabled. Windows npm installations of Bitwarden use its [official JS entry](https://github.com/bitwarden/clients/blob/main/apps/cli/package.json), run through the bundled Node runtime without interpreting a `.cmd` shim.

Adapters use fixed executable argument arrays without a shell. 1Password receives the master password on stdin; Bitwarden receives it only in the child environment named `STEP_VAULT_MASTER`. Session tokens stay in main-process memory with a 30-minute idle limit; status polling does not refresh it. Errors contain fixed codes, not CLI diagnostic text. `OP_SERVICE_ACCOUNT_TOKEN`, if already configured by the operator, can be used without a master-password prompt; its value is never returned to the renderer or model.

Only exact HTTPS origins saved on a login item are used. Bitwarden **Never** URIs are excluded. The host re-fetches item metadata before use and rejects changed URL bindings. Locking denies new adapter calls even when the CLI has desktop integration or a service-account token; locking during an outstanding unlock rejects the late result. Pause, app shutdown, policy/workspace identity changes and renderer loss cancel prompts and invalidate pending handles. Local lock does not claim to lock another application's own UI.

## Storage and trust boundaries

Existing AES-256-GCM SQLite records and OS-wrapped random keys remain compatible. Username/password are still encrypted together at rest; card/address payloads and optional TOTP seeds use the same authenticated records. The change does not downgrade storage to a key file beside ciphertext. There is no master-password/biometric or secure-erasure claim.

The broker supplies session-bound handles reusable through a login's password/OTP steps, with a 30-minute idle lifetime; local writes, revisions, pause and identity changes invalidate them. Inner storage fills still use one-use 90-second grants. Listing accounts no longer allocates unused inner grants.

Browser fills use a private structured CDP call in an isolated top-level world. Website login keeps exact origin, URL, navigation generation and form/action checks. Payment/address/OTP targets are fingerprinted and checked again at execution and during each field write; supported selectors include autocomplete, labels and bounded name heuristics. Combined card expiry, matching select-option value/text and adjacent one-character OTP boxes are supported. Ambiguous targets stop instead of guessing. Cross-origin frames and arbitrary JavaScript are not exposed.

During a protected card/address/OTP form, model reads return only actionable button metadata, with no page text or editable field values; screenshots remain refused. This lets the assistant reach Verify/Continue/checkout through the existing final-action approval. Navigation resumes normal reading. A filled login form stays withheld; full navigation or a verified SPA login transition releases it. A person can also resume explicitly in Settings.

Known secret values and common URL/base64 encodings are registered before filling and redacted from later outgoing text. Numeric status fields and host-generated opaque IDs stay usable in JSON; page text is scrubbed. This does not establish protection against every encoding, screenshots after navigation, hostile same-origin scripts or arbitrary code with the same OS-user rights. The site receives the values as it would when a human types them.

The default now follows Hermes's host trust model: sensitive-path protections and normal command approvals remain, while approved host code can access data owned by the OS user. It is not an OS/container sandbox. Use managed `credentialStorage.blockHostExecution: true` when that broader host trust is inappropriate; pause or deleting the last entry does not remove a strict gate while the wrapped key remains.

## Scope of parity and verification

Functional parity here covers Vault login/save, manager discovery/unlock, manual OTP/TOTP, address/card filling and coexistence with coding tools. It does not mean byte-identical storage, every website/browser backend, CLI UX parity, or unattended browser jobs. STeP's scheduled jobs still use its existing draft-only contract and expose no browser tools; saved-login resolution itself has no UI dependency, while missing-login/manual-code/card steps require an interactive surface.

Verification uses synthetic credentials and a deterministic local provider. `vault-parity.test.ts` covers RFC vectors, origin/revision/lock races, manager subprocess channels and stable handles. `vault-hermes-smoke.mjs` exercises the real app's chat, dedicated prompts, encrypted storage, login, manual OTP, automatic TOTP, protected Verify controls and a custom coding runtime after enrollment. `vault-electron-smoke.mjs` exercises actual OS wrapping across restart and native HTTPS forms, including cards/addresses/selects/split OTP and final-action refusal. `vault-workspace-ui-smoke.mjs` preserves the managed strict-gate path.

Live 1Password/Bitwarden accounts, real employee sites/SSO, packaged Windows/macOS upgrades and the complete macOS CI remain separate acceptance evidence. Do not call these live integrations verified from fake CLI tests.

Implementation: `desktop/electron/vault*.ts`, `browser-agent.ts`, `main.ts`, `desktop/src/vault-*.tsx`, credential settings and tool registry. Semantics were studied from Hermes/OpenInstinct's MIT-licensed implementations; this is an independent TypeScript implementation on the existing STeP host.
