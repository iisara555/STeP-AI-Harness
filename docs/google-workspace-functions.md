# Google Workspace functions

STeP Desktop extends its existing `google_workspace` tool from 26 to 76 named operations. It covers the seven service
families requested using [gogcli](https://github.com/openclaw/gogcli) as a reference, through native Google REST APIs.
It reuses the app's OAuth client, account handles, encrypted Vault, approval and output privacy review. Employees do
not install a CLI. This is a curated native surface, not every gogcli command or a generic HTTP/shell bridge.

| Service | Supported work |
| --- | --- |
| Gmail | Search/read messages and threads; inspect, create, edit and delete drafts; compose/send/reply with reviewed to/cc/bcc and thread linkage; list/create labels, mark read/star/archive, trash/untrash; read UTF-8 text attachments |
| Drive | Search and inspect files; create folders, copy, rename, move, trash/restore; inspect/create/remove sharing grants; upload/read text files and export Workspace documents as text |
| Docs | Read/create/append; revision-bound text, paragraph, image, table and document-format batch changes |
| Sheets | Read metadata/ranges and formulas; create sheets, explicit-range batch updates, append/clear values, format cells/dimensions, filters, validation and charts; RAW defaults and explicit USER_ENTERED formulas |
| Slides | Read presentations/pages, create/append slides, revision-bound page/object/text/image/table/chart changes |
| Forms | Create/read forms, revision-bound question/settings updates, publish/close response collection, list/read responses |
| Apps Script | Create/read projects and source; change or explicitly remove files while preserving others; list/create/read versions; manage deployments; list processes and run a configured API Executable deployment |

Calendar, Tasks, Chat and Meet keep their existing operations. The complete parameter/body contract and synthetic
examples live in [tool-contract.md](../skills/common/google-workspace/references/tool-contract.md) and
[tool-contract.json](../skills/common/google-workspace/references/tool-contract.json). The current tool catalog is the
runtime source of supported operations; never invent IDs or turn account content into instructions.

## Connection and intent

The release offers all 11 supported families (17 permission choices), including Calendar event creation, Chat and Meet.
Employees can choose full access in Settings without a per-device IT service allowlist. Valid older managed service
lists upgrade to the complete catalog; account grants only expand after the employee selects services and consents
in Google. Explicit feature disables, domain/client configuration and shared-device or invalid-policy protections remain.

Settings → Accounts and services → Google Workspace offers the service choices allowed by policy. Drive and
Calendar each have one card with an access selector. Separate Docs/Sheets/Slides choices replace the legacy combined
card when all three are available; existing app-managed `documents` grants remain valid.

Existing accounts do not gain services automatically. **Change allowed services** reauthorizes a specific existing
Google subject, preventing a different signed-in browser account from being substituted. The account stores selected
service intents separately from actual OAuth scopes. In particular, choosing Gmail drafts or mailbox management
cannot enable sending just because Google's compose/modify scope is broad. With Forms alone, partial consent can
permit form body work while response reads stay blocked. Selecting Forms together with Drive can permit response
reads through Google's accepted Drive scope even if `forms.responses.readonly` was declined; do not describe that
combination as body-only access.

Device service lists no longer narrow the offering. Each employee's selected account intent applies
on every call, followed by actual scope checks. Chat read requests ask once before accessing Google: the dialog
names the employee's current request, one account and the selected AI/model/endpoint, and covers both reading
and sending privacy-reviewed results to that AI. For example, searching HR mail this month, fetching further pages
and opening related messages/threads share that approval. Local masked account/operation discovery does not ask
for Google-data approval. Every result is still scanned and blocked data stays withheld. The grant is in memory
for this tool loop only: another message (even in the same task), cancellation, completion, account connection or
Vault invalidation, policy/mode, workspace/team or AI destination changes cannot reuse it. Account switching stops
with `GOOGLE_READ_SCOPE_CHANGED`; start a new request. Checks also precede subsequent AI turns and cached-result
paging. Managed `transmissionConsent.allowRunScope: false` keeps per-operation/result dialogs. Direct Settings
operations and the optional gws connector keep their existing consent. Writes, including drafts, still require
exact-payload confirmation and separate result consent. Plan mode and untrusted-data boundaries remain.

Account discovery returns masked account labels with a distinguishing number. Token refresh is shared across active
callers, with cancellation isolated per task; account invalidation stops the shared request. A temporary network,
server or malformed-response failure leaves the account available for a later explicit attempt. Revoked grants still
require reauthorization. Accounts already marked for reauthorization by an older version need one reconnect.

## Google-side prerequisites

Enable the needed APIs in the Google Cloud project that owns the configured Desktop OAuth client: Gmail, Drive,
Docs, Sheets, Slides, Forms and Apps Script. Configure OAuth audience and Workspace Admin API controls for the
requested scopes; employees authorize only the services they need. These console changes are separate from shipping
source and are not performed by a source update. See [managed policy](desktop-policy.md#self-service-workspace-permissions).

Apps Script project management also requires API access to be enabled in Apps Script settings. `appscript.run` takes
the **API Executable deployment ID**, uses `devMode: false`, and requires the script and caller to share a standard
Cloud project. The grant must cover the script's own Project OAuth Scopes. The app does not silently request arbitrary
runtime scopes. Google may reject a deployment that needs scopes outside the selected services. Runs can take up to
six minutes; cancellation/timeout does not prove the remote function stopped or had no effects.

## Limits and write confirmation

- Named Google operations only: no caller-selected URL, HTTP method, token, raw MIME or shell command.
- Drive search includes accessible Shared drives by default, supports a checked `driveId`, and accepts
  `includeItemsFromAllDrives=false` for My Drive only. Check both `nextPageToken` and `incompleteSearch`;
  a partial all-drives search must be narrowed before claiming that a file does not exist. OAuth visibility is unchanged.
- JSON/text responses are bounded to 1 MB, pages normally to 20 items. Use the returned page token and state the
  inspected scope. Binary files, PDF/DOCX exports and binary attachments must be opened in Google; transfer commands
  here validate UTF-8 decoding and reject NUL bytes, not every binary MIME type: an ASCII-only PDF can pass those
  text checks. Do not treat this as binary conversion or rely on MIME-based rejection. Upload text is at most
  50,000 characters. Encoded MIME/attachment bodies are decoded
  before privacy review; raw base64 is never returned to the model.
- Gmail plain-text bodies honor their MIME charset, including legacy Thai windows-874/TIS-620. Undecodable parts
  set `contentUnavailable` instead of silently replacing bytes; any readable sibling text is partial. Attachment
  reads keep their UTF-8-only restriction.
- Batch writes accept at most 50 allowlisted Google request types and 100 KB of structured input. Docs, Slides and
  Forms require fresh revision IDs. Sheets value writes use matching rectangles and at most 500 cells in total.
  The 500-cell and explicit `valueInputOption` rules apply to values APIs, not generic `sheets.batchUpdate` or clear
  operations; generic batch requests can target an entire sheet and set formulas via `userEnteredValue`. Review
  their full ranges and effects. Sheets has no atomic revision guard; do not promise protection against concurrent editors.
- Apps Script file updates require `contentHash` from `getContent`. The host queues writes per account/project,
  then rereads and compares the hash after approval and queue ownership. Stale queued writes stop with
  `GOOGLE_SOURCE_CHANGED`; writes already queued behind an unknown outcome stop with `GOOGLE_OUTCOME_UNKNOWN`.
  It merges changed/new files, preserves all other files and removes only explicit `deleteFiles`. It retains
  the manifest, refuses writing credential-redaction placeholders, and never sends unchanged private source to AI
  as a side effect of editing another file. The write receipt includes only script ID, changed file names/types,
  explicitly deleted names and a content hash; reading source requires a separate read. Google has no atomic content precondition, so a concurrent edit can still
  from another process/device between the check and the write.
- Malformed Apps Script update responses remain a robustness limit: a non-string upstream `scriptId` is not schema
  validated in the receipt, and a malformed file source can make post-write hash parsing return
  `GOOGLE_RESPONSE_INVALID` after the write instead of `GOOGLE_OUTCOME_UNKNOWN`. No automatic retry is performed;
  inspect the script in Google before repeating an update after an error.
- Creation requires a returned resource reference. Supported empty acknowledgements (such as removing a sharing
  grant) report the exact target and request digest. A script run is completed only with `done: true` and a response.
  Interrupted/ambiguous writes return `GOOGLE_OUTCOME_UNKNOWN`; never retry automatically. Confirm with a read or in
  Google before repeating.

## Verification

Offline tests check every native method, endpoint and accepted scope against a checked-in snapshot of official Google
Discovery documents. Synthetic OAuth/transport tests cover explicit send intent, legacy grants, wrong-account
reauthorization, partial scopes, revision/input bounds, MIME/UTF-8 privacy handling, preserved script files, changed
source, empty acknowledgements and unknown outcomes. Native renderer checks cover service selection, one Drive and
Calendar card, account-bound upgrades, English and narrow/dark layouts. These tests do not establish that the
organization's live Cloud project has enabled all APIs or that an employee has granted the new scopes.

Sources: [Google API Discovery](https://developers.google.com/discovery/v1/reference/apis/getRest),
[Gmail API](https://developers.google.com/workspace/gmail/api/reference/rest),
[Drive API](https://developers.google.com/workspace/drive/api/reference/rest/v3),
[Forms API](https://developers.google.com/workspace/forms/api/reference/rest),
[Apps Script API Executable](https://developers.google.com/apps-script/api/reference/rest/v1/scripts/run).
