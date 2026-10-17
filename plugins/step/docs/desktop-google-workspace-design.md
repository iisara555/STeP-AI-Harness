# Employee Google Workspace connection and service access

Status: design handoff for PR #162. The native Desktop route (section 4) has since been implemented in `desktop/electron/google-workspace.ts`, `google-oauth.ts` and `google-operations.ts` and is on by default; see the [Google Workspace Skill](../skills/google-workspace/SKILL.md) and [policy](desktop-policy.md). The table in section 1 describes the state when this handoff was written.

Reference baseline: Desktop 0.6.3, commit `81fe787727487ab654701a19e55039750db76345`. Sources checked on 2026-10-14.

The requested outcome is a connection for each employee's Google Workspace account, with access to the Google services their account and organization permit. Employees should connect from Settings, select services, review access, work from chat or open the original service, and disconnect without entering Google passwords or tokens into STeP. This extends the [Vault handoff](desktop-vault-design.md); it does not authorize deployment, organization configuration changes or access to real employee data.

## 1. Existing paths and implementation boundary

| Path | Observed in this repository | Proposed next step |
| --- | --- | --- |
| Organization-managed MCP | Desktop recognizes `profile: "google-workspace"`; discovery and calls have separate consent. The profile is a setup label. OAuth, employee account binding and scopes belong to the server. | Preferred first integration: an approved HTTPS service with authenticated, isolated employee sessions and typed service capabilities. Prove authentication and account isolation before exposing employee tools. |
| Optional `gws` connector | Eight bounded Drive/Docs/Sheets operations in `src/modules/connectors/google-workspace.js`; the organization installs and signs into the CLI separately. Not automatically wired into Desktop. | Keep as an optional compatibility adapter. Do not turn it into an unrestricted CLI, share another user's CLI profile, or auto-import its tokens. |
| Native Desktop Google connector | No employee Google Workspace OAuth connection UI or general Google API transport is established by the current code. | Separate implementation after the auth/storage and execution-isolation gates below. |
| Gemini / Antigravity provider | Google sign-in authorizes an AI runtime according to that provider's setup. | Keep separate from Workspace service consent, tokens and disconnect controls. |

Existing references: [MCP setup](desktop-automation.md#google-workspace-through-an-organization-mcp-server), [optional connector](google-workspace-connector.md), `desktop/electron/mcp.ts`, `desktop/electron/policy.ts`, and `desktop/src/automations.tsx`. Current HTTP MCP uses administrator-configured transport headers; a per-employee OAuth broker and dynamic credential-reference transport still require implementation. Never put bearer tokens into policy files or use one static shared identity for all employees. The MCP profile alone proves neither account access nor successful document export.

The initial connector operations are `drive.list`, `docs.get`, `sheets.get`, `sheets.values.get`, `docs.create`, `sheets.create`, `docs.appendText`, and `sheets.values.update`. Mail, sharing, deletion and publication are not implemented there. Current tests use synthetic CLI/MCP responses; they do not prove live Google authorization.

## 2. Employee Settings and first connection

Proposed location: **Workspace Settings -> Connections -> Google Workspace**. English labels below describe behavior; production UI must use the app's Thai/English localization.

```text
Google Workspace                             [Connect work account]
Account: [masked identifier]                  Status: Not connected
Organization: [verified organization]         Route: Organization connector

Services                 Access                            Action
Drive / Docs / Sheets / Slides
                         Selected files                    [Review access]
Gmail                    Off                               [Enable service]
Calendar                 Off                               [Enable service]
Tasks / Chat / Meet       Off                               [Enable service]

[Test selected access] [Open Google service] [Pause] [Disconnect]
```

1. Display the approved connector, service purpose, data types, processing location and possible AI destination. Require affirmative consent before collecting content.
2. The employee chooses the services needed for their task. Only implemented, administrator-enabled capabilities can request scopes; future services remain off.
3. Open the official authorization flow in the system browser. The employee chooses their work account and completes Google/organization SSO, MFA or device approval there. STeP never captures the Google password or tries to autofill the Google OAuth login with Browser Vault.
4. Validate the resulting identity and granted capabilities in the trusted host/broker. Show the selected account in trusted Settings; send only an opaque account handle to the model. A refused service remains unavailable without invalidating other verified capabilities.
5. Test with a resource the employee deliberately selects or a synthetic document in an approved test location. Display separate states for account connected, scope granted, resource accessible and operation succeeded. Do not scan the mailbox/Drive to test a connection.
6. Let the employee select the active account for a workspace/session. Switching accounts invalidates pending approvals, queued jobs and cached resource handles; it does not change the employee's STeP role.

No real organization domain, tenant owner, client ID, quota, licence or administrator approval has been supplied. These are deployment inputs to be confirmed by the organization; example labels are not evidence of CMU Google configuration.

## 3. Service capability and scope matrix

Scopes below are candidate minima, not a request for all services at connection time. Prefix abbreviated service scopes with `https://www.googleapis.com/auth/`. The same OAuth grant can allow more actions than the product exposes; every action still passes a host operation allowlist and authority checks.

| Service | Proposed employee use | Scope / access boundary | Delivery |
| --- | --- | --- | --- |
| Identity | Bind the employee's chosen Google account | `openid email`; request `profile` only if needed. Identity scopes do not grant document/mail access. | G1 |
| Drive | Select/open/search allowed files; save approved artifacts | Prefer `drive.file` with user-granted file access. Existing-file access needs Google Picker or a proven equivalent grant; pasting an ID/URL alone does not grant access. Broad search needs separately approved `drive.metadata.readonly`; content outside selected files needs separately approved `drive.readonly`. | G2 |
| Docs | Read selected documents; create/edit approved drafts | Prefer `drive.file` where the Docs endpoint accepts it; otherwise justify `documents.readonly` / `documents` for the exact implemented operation. Revision-bound edits and conflict review. | G2 |
| Sheets | Read bounded ranges; create/edit reviewed cells | Prefer `drive.file`; otherwise `spreadsheets.readonly` / `spreadsheets`. Host restricts spreadsheet/range; OAuth does not enforce a per-tab or per-range boundary. RAW values by default; formulas need explicit review. | G2 |
| Slides | Read selected decks; create/update reviewed slides | Prefer `drive.file`; otherwise `presentations.readonly` / `presentations`. Show the resulting native deck/link and check rendered output. | G2 |
| Gmail | Search/read selected messages, prepare a reply, send after approval | `gmail.readonly` for reading, `gmail.send` for send-only, `gmail.compose` for server-side drafts. `gmail.compose` also permits sending: a draft is not an OAuth-enforced send prohibition. Default drafts stay local if no draft scope is granted. | G3 |
| Calendar | Read chosen calendars; propose and approve events | `calendar.calendarlist.readonly` for selection and `calendar.events.readonly` for events; `calendar.events` only for approved mutations. Account/calendar ACLs still apply. Invitations and updates affecting attendees require preview and approval. | G3 |
| Tasks | Read task lists; create/change chosen tasks | `tasks.readonly` / `tasks` as required. Writes remain exact-action approved. | G3 |
| Chat | Read authorized spaces/messages; send approved messages | User-authenticated `chat.spaces.readonly`, `chat.messages.readonly`, `chat.messages.create` only for reviewed operations. A Chat app identity is a separate integration and must not impersonate the employee. | G3 |
| Meet | Open/join a meeting; retrieve authorized meeting resources | Opening the website requires no API token. REST resources use separately reviewed Meet scopes, participant access and edition constraints. No camera/microphone, recording or transcript collection by default. | G3 |
| Contacts / Forms / Apps Script | Open the service; later add selected contacts, forms or reviewed automation | Browser entry initially. Separate API/scopes/operation review before contacts access, response collection or script execution/deployment. | Later |
| Admin Console / Cloud / other Google products | Open the official service when the employee has access | Separate privileges, licences, API coverage, billing and admin approval. No blanket Google access, service-account keys or domain-wide delegation in the employee MVP. | Browser / separate project |

[Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Docs scopes](https://developers.google.com/workspace/docs/api/auth), [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes), [Slides scopes](https://developers.google.com/workspace/slides/api/scopes), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [Tasks scopes](https://developers.google.com/workspace/tasks/auth), [Chat authorization](https://developers.google.com/workspace/chat/authenticate-authorize), and [Meet REST coverage](https://developers.google.com/workspace/meet/api/guides/overview) define endpoint support. Confirm scope classification and compatibility again for the version/operation shipped. `drive.file` is narrower; broad Drive read/metadata and Gmail read/compose scopes are restricted. Never request `https://mail.google.com/` for this design.

### Opening original Google services

Offer fixed, reviewed HTTPS launch entries for Gmail, Drive, Docs, Sheets, Slides, Calendar, Tasks, Chat, Meet, Contacts, Forms and Apps Script. The trusted host opens the official service or a validated resource link in the system browser; account hints are not authorization. The browser's active Google account may differ from the API connection: show the intended account, let the employee verify it, and never claim that opening a URL proves account access. Do not copy Google cookies or inject Workspace tokens into the URL/browser. Admin Console and Cloud remain subject to the employee's own entitlements. Browser agent work follows existing browser/privacy/approval rules independently of API consent.

## 4. OAuth ownership, employee identity and token lifecycle

### Organization MCP / broker route

Use a separately authenticated employee session at the approved organization broker. The broker owns its Google OAuth client, redirect flow and encrypted token store. Bind each grant to the verified organization and Google's stable subject, then authorize Desktop requests against the employee session and exact resource. Desktop receives capability/status metadata and operation receipts, never the Google refresh token. Server-side account/resource enforcement is mandatory; a model-supplied email, team, account handle or MCP tool annotation cannot confer access. Keep Google ID tokens separate from MCP authentication; a Google token for another audience is not a valid broker credential.

This route requires an approved server and data-processing/retention policy; it is not a server shipped in PR #162. It must reject redirects during MCP API calls, avoid shared employee credentials, and prove cross-account/cross-tenant isolation. Evaluate local stdio MCP code under the Vault host-execution gate; an HTTP endpoint does not automatically establish server trust.

### Optional native Desktop route

Use the organization's reviewed **Desktop app** OAuth client, authorization-code flow with PKCE `S256`, random `state` and OIDC `nonce`, and the external system browser. Bind a one-use, bounded loopback listener to `127.0.0.1` on an OS-assigned port; reject wrong path/state, duplicate/expired callbacks and profile/account switches. Close it on success, cancellation or timeout. No embedded login webview, OOB code-copy flow or password grant. Treat installed apps as public clients; no confidential web-client secret in the app/repository.

Google's installed-app guidance states that incremental authorization is unsupported for installed apps. Select the small implemented capability set before consent. Adding a service uses an explicit reauthorization flow for the reviewed requested set, then verifies the actual grant; do not assume silent scope accumulation or rely on `include_granted_scopes` as a native-app solution. Use a separately reviewed web-server flow if the organization broker implements incremental authorization. See [native OAuth guidance](https://developers.google.com/identity/protocols/oauth2/native-app).

Validate ID-token signature, issuer, audience, expiry and nonce with a supported library; use stable `sub` for identity. Check the trusted `hd` claim against administrator-approved Workspace domains if membership restriction is required. Email suffixes, a supplied `hd` hint and local team settings are not membership/role evidence. Do not automatically merge a newly selected account with a previous account. See [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

The native connector owns its new OAuth grants. Keep access tokens short-lived in trusted process memory and refresh tokens in a purpose-bound OS-protected credential provider; the proposed Vault may supply that storage only after P0/P1 acceptance and the execution-isolation gate pass. Binding includes profile, subject, OAuth client, approved sink and granted scopes. These are a separate credential kind with no browser fill, generic export or API-key conversion. Never import Gemini/Antigravity, `gws` or other runtime tokens. This is an explicit future connector-owned storage contract, not a change to existing provider-runtime ownership.

Refresh is serialized per account; preserve the stored refresh token if a successful response omits a replacement. Fail closed on unavailable storage, invalid grants, admin blocks and missing scopes; report reauthentication required instead of a false connected state. Retry bounded idempotent reads only. Unknown write outcomes require reconciliation, not blind replay. Google can expire/revoke grants, and External projects in Testing can issue seven-day refresh tokens for Workspace scopes; do not promise permanent login. See [OAuth lifecycle](https://developers.google.com/identity/protocols/oauth2).

## 5. Administrator readiness and release decisions

Before a pilot, the accountable administrator must provide the organization-owned Cloud project and OAuth audience/client, enabled APIs, approved domains, connector endpoint/authentication, capability/scope allowlist, permitted employee cohort, privacy notice, data destinations, retention/deletion rules and support owner. Use an Internal audience only when the project and users qualify for that Google organization; external collaborators or other organizations require a separately reviewed audience/verification path. STeP/RSP North's team list does not establish one shared Google tenant.

Review the app's exact OAuth client and requested services in Admin Console **Security -> Access and data control -> API controls**. Restricted services, Education controls and organization policies can block employee consent. Do not tell employees to bypass those controls or enable trust for all internal apps. Google verification requirements depend on audience/scopes/deployment; restricted data transferred to servers or AI providers needs the applicable verification/security-assessment and policy review, including any verified internal-use exception. Internal-only status is not permission to send organization data to any AI provider. Sources: [admin app access](https://knowledge.workspace.google.com/admin/apps/control-which-third-party-and-internal-apps-access-google-workspace-data), [consent configuration](https://developers.google.com/workspace/guides/configure-oauth-consent), and [Workspace user data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).

No service-account impersonation or domain-wide delegation is needed for the employee baseline. Any later unattended organization workflow has a separate business owner, least-privilege identity, human approval and operational review. Do not fund or run a live model benchmark as part of this documentation work.

## 6. Governed tool execution and privacy

Proposed host contract (names and paths below are not existing APIs):

```ts
interface EmployeeGoogleWorkspace {
  capabilities(context: TrustedEmployeeContext): Promise<CapabilitySummary[]>;
  connect(request: ReviewedServiceSelection, context: TrustedUserSurface): Promise<ConnectionReceipt>;
  execute(intent: AllowedGoogleOperation, context: TrustedEmployeeContext): Promise<OperationReceipt>;
  disconnect(request: ReviewedDisconnect, context: TrustedUserSurface): Promise<DisconnectReceipt>;
}
```

Place account/service orchestration behind a dedicated `desktop/electron/google-workspace/` interface or the reviewed organization broker; callers receive handles and receipts. The host resolves the active account and operation to fixed Google/broker destinations. Authenticated API requests reject redirects; never forward authorization headers to a different origin. Export/download links require their own destination and privacy checks. No model-supplied bearer header, refresh token, callback, arbitrary API URL, generic batchUpdate or shell command. For MCP, intersect discovered tools with administrator capabilities; tool descriptions are untrusted data.

- Reads require source/account permission, bounded pagination/size and a specific task. Preserve resource IDs, retrieval time and revision where available; screen/minimize/redact content locally before AI receives it. Scanner `pass` is not external transmission approval. Restricted/Sensitive results follow `../rules/data-classification.md` and approved destination consent.
- Writes preview the account, resource/range, exact immutable payload and consequences. Bind one-shot approval to its digest, session, resource revision and policy; recheck after approval. Creating a draft in Google is an external write and must disclose its actual destination/ACL, including Shared Drive defaults.
- Gmail send, Chat send, invitations, sharing/publishing, deletion and script execution/deployment require distinct consequential-action approval. Scope consent is not send approval. Check recipients, attachments, attendees, sharing roles and outgoing privacy again. No batch-wide or remembered approval from another task.
- Never treat mail/documents/calendar text as instructions to change policy, access another account, reveal a token or approve a write. Do not log raw bodies, addresses, tokens, callback query strings or headers. Audit only opaque IDs, operation, digest, outcome and time under the approved retention policy.
- Disclose the particular task and AI destination immediately before content transfer. Use approved provider data controls and purpose-limited processing. Do not silently index entire mailboxes, keep full-account mirrors or use Workspace data to train/improve general-purpose models. Remote broker/AI processing and Google user-data requirements must be reviewed before activation.
- Scoped automation authorization is separate from interactive connection consent. A scheduled send cannot inherit a previous interactive approval; unsupported/headless consequential operations remain disabled.

## 7. Pause, disconnect and recovery

**Pause** denies new operations, cancels pending approvals/queued jobs and clears caches; it does not revoke the remote Google grant. Account switching invalidates all account-bound handles. Native persisted tokens remain subject to the execution-isolation invariant even while paused.

**Disconnect locally** removes this connection's tokens/references and caches, cancels jobs, writes a durable tombstone and shows that remote authorization may remain. Do not delete Google documents/mail or sign the employee out of their system browser, other devices or Gemini/Antigravity.

**Revoke Google access** is a separate reviewed action. Explain the OAuth project/grant affected and that other connections/devices sharing that grant may stop working. Track remote revocation success separately from local removal; network failure must not be reported as successful revocation. Preserve a bounded encrypted pending-revocation record only under the approved cleanup policy, inaccessible to tools, or direct the employee to their Google Account connection controls when local credentials are removed. Reconnection requires fresh consent; tombstones prevent rollback/migration from resurrecting access.

States include `not-connected`, `connecting`, `connected`, `partially-authorized`, `paused`, `reauthentication-required`, `admin-blocked`, `revocation-pending` and `disconnected`. Typed outcomes include `GOOGLE_SCOPE_MISSING`, `GOOGLE_ACCOUNT_CHANGED`, `GOOGLE_RESOURCE_DENIED`, `GOOGLE_API_DISABLED`, `GOOGLE_QUOTA_LIMIT`, `GOOGLE_REAUTH_REQUIRED` and `GOOGLE_OUTCOME_UNKNOWN`; messages contain no credentials or private upstream diagnostics.

## 8. Milestones and acceptance evidence

| Milestone | Reviewable deliverable | Required evidence |
| --- | --- | --- |
| G0 - Readiness | Confirm broker/native route and administrator inputs; map the existing MCP and optional CLI capabilities | Reviewed scopes/data-flow/identity ownership; no production policy or tenant changes in a documentation PR |
| G1 - Employee account connection | Trusted Settings, browser OAuth, verified identity/capabilities, encrypted lifecycle, pause/disconnect | Wrong-account/tenant/callback denial; partial consent; expiry/revocation; account switch; crash/restart/upgrade; Windows/macOS native storage or separately verified broker persistence |
| G2 - Document services | Drive file selection, bounded Docs/Sheets reads/writes and Slides operations; original-service launch | Real authorized synthetic file access, Shared Drive denial, revision conflict, exact-action write approval, privacy/redaction and actual resource/link plus rendered output |
| G3 - Communication and planning | Separately enable Gmail, Calendar, Tasks, Chat and Meet operations | Approved test mailbox/calendar/space; exact recipient/attendee/content approval; no-send cancellation; unknown-outcome reconciliation; licence/API denial; no recording by default |

G1 native token persistence depends on Vault P0/P1 or an independently accepted OS credential provider, including agent host-execution isolation. The broker route has its own server token-storage and tenant-isolation gate. Neither route can treat browser fill grants as Google API grants. Ship capabilities off by default until their own evidence passes; a connected account or returned MCP catalog is not full Google service acceptance.

Acceptance must include synthetic secrets absent from model input/output, logs, exports, screenshots and subprocess arguments; malicious source text; denied/partial scopes; spoofed email/domain; account switch during approval; refresh races; restart and packaged-app upgrade; per-employee/per-tenant isolation; a blocked admin policy; Shared Drive permissions; bounded quotas/pagination; failed revocation; and update/delete followed by crash/rollback without credential resurrection. Native tests must prove Google Picker or equivalent grants without exposing tokens to the general renderer/model. Use synthetic Google resources only in an authorized test account/cohort for live tests, separate from local fixtures. Local/synthetic tests do not establish organization OAuth or service access.
