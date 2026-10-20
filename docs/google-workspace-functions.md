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
An existing device policy can replace that list. Settings names the permissions that policy restricts instead of
implying they are absent from the installer. An app update cannot widen a managed allowlist or an existing account
grant; an administrator updates policy, then the employee uses **Change allowed services** on the existing account.

Settings → Passwords and connections → Google Workspace offers the service choices allowed by policy. Drive and
Calendar each have one card with an access selector. Separate Docs/Sheets/Slides choices replace the legacy combined
card when all three are available; existing app-managed `documents` grants remain valid.

Existing accounts do not gain services automatically. **Change allowed services** reauthorizes a specific existing
Google subject, preventing a different signed-in browser account from being substituted. The account stores selected
service intents separately from actual OAuth scopes. In particular, choosing Gmail drafts or mailbox management
cannot enable sending just because Google's compose/modify scope is broad. With Forms alone, partial consent can
permit form body work while response reads stay blocked. Selecting Forms together with Drive can permit response
reads through Google's accepted Drive scope even if `forms.responses.readonly` was declined; do not describe that
combination as body-only access.

The administrator can narrow `googleWorkspace.services`; both that policy and the employee's account intent apply
on every call, followed by actual scope checks. Every read/write asks for the account and exact request. Sending a
result to AI has its own privacy check. Plan mode, Vault, cancellation, context changes and untrusted-data handling
keep their existing boundaries.

## Google-side prerequisites

Enable the needed APIs in the Google Cloud project that owns the configured Desktop OAuth client: Gmail, Drive,
Docs, Sheets, Slides, Forms and Apps Script. Configure OAuth audience and Workspace Admin API controls for the
requested scopes; employees authorize only the services they need. These console changes are separate from shipping
source and are not performed by a source update. See [managed policy](desktop-policy.md#workspace-services-and-restricted-cohorts).

Apps Script project management also requires API access to be enabled in Apps Script settings. `appscript.run` takes
the **API Executable deployment ID**, uses `devMode: false`, and requires the script and caller to share a standard
Cloud project. The grant must cover the script's own Project OAuth Scopes. The app does not silently request arbitrary
runtime scopes. Google may reject a deployment that needs scopes outside the selected services. Runs can take up to
six minutes; cancellation/timeout does not prove the remote function stopped or had no effects.

## Limits and write confirmation

- Named Google operations only: no caller-selected URL, HTTP method, token, raw MIME or shell command.
- JSON/text responses are bounded to 1 MB, pages normally to 20 items. Use the returned page token and state the
  inspected scope. Binary files, PDF/DOCX exports and binary attachments must be opened in Google; transfer commands
  here validate UTF-8 decoding and reject NUL bytes, not every binary MIME type: an ASCII-only PDF can pass those
  text checks. Do not treat this as binary conversion or rely on MIME-based rejection. Upload text is at most
  50,000 characters. Encoded MIME/attachment bodies are decoded
  before privacy review; raw base64 is never returned to the model.
- Batch writes accept at most 50 allowlisted Google request types and 100 KB of structured input. Docs, Slides and
  Forms require fresh revision IDs. Sheets value writes use matching rectangles and at most 500 cells in total.
  The 500-cell and explicit `valueInputOption` rules apply to values APIs, not generic `sheets.batchUpdate` or clear
  operations; generic batch requests can target an entire sheet and set formulas via `userEnteredValue`. Review
  their full ranges and effects. Sheets has no atomic revision guard; do not promise protection against concurrent editors.
- Apps Script file updates require `contentHash` from `getContent`. The host rereads and compares the hash after
  approval, merges changed/new files, preserves all other files and removes only explicit `deleteFiles`. It retains
  the manifest, refuses writing credential-redaction placeholders, and never sends unchanged private source to AI
  as a side effect of editing another file. The write receipt includes only script ID, changed file names/types,
  explicitly deleted names and a content hash; reading source requires a separate read. Google has no atomic content precondition, so a concurrent edit can still
  occur between the check and the write.
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
