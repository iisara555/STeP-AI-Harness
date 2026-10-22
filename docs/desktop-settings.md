# Settings: current state, saving and account scope

Settings keeps the existing visual design and uses six tabs: General, Connect AI, Accounts and services,
Display and language, Privacy, and Organisation policy. The Thai names are the source UI strings.

## General and saving

General opens with a compact profile/team section. The portrait gallery opens only through Change picture.
Assistant name, speaking style and chat language follow; the output folder and additional setup options have their
own section. Prepared examples use the same synthetic reminder request for every speaking style and make no AI call.
Output style selects an installed answer structure; it does not change answer length or the speaking style.
Settings search finds tabs by their labels and fixed Thai/English keywords; it does not search account data.

Save changes saves General/display fields and leaves Settings open. Back to work leaves without saving only when
there are no pending fields, or after an explicit discard. Pending fields survive tab changes. A failed write keeps
the fields and unsaved status, with a local error that clears on retry. An acknowledged write stays saved even if
refreshing the snapshot fails. The app's unsaved guard also covers Settings when closing the window; task/view
navigation and setup/tour entry defer until the employee decides whether to discard. Connected accounts and
permissions already confirmed are not rolled back by discarding General fields.

App language changes menus/buttons immediately. Chat language is saved independently as auto/Thai/English;
explicit language requests take precedence, and formal documents keep their requested language and Skill standard.
Folder selection, account actions and confirmed service permissions take effect immediately and say so locally.

## AI accounts

The selected account is marked separately from text-test readiness. Use for this task changes the current task's
connection; Use for new tasks changes the composer's connection for new work. Neither is described as a persistent
global default. Selection is disabled while that task is running. The connection card exposes tool/web and image
eligibility and limits without opening a fold; text/image-generation details remain available underneath.

Text test passed means the last text-response check passed. The last successful test time is shown only when stored;
older accounts do not receive an invented time. Text readiness does not establish image-model entitlement or Google
Workspace access. Claude Pro/Max experimental controls appear beside the first relevant Claude account, with a
developer disclosure when no Claude account exists. The organisation policy still controls availability.

## Accounts and services

The all-account switch describes app access to Google, website accounts and password managers. It does not sign out
of AI or revoke Google grants. Global pause is shown beside affected Google accounts. Pause this account changes
only that Google connection. Google Workspace appears before website/form details and optional password managers.
Manager enablement is separate from installed/unlocked status; CLI setup instructions are folded. Address controls
explain that autofill is limited to authorised websites. Active host-execution warnings remain visible.

Google permissions are grouped as Gmail, Calendar, documents/files and additional services. New forms select no
service in advance, and there is no select-all shortcut. A legacy app-managed `documents` choice stays distinct
when editing an account; it does not silently become full Docs/Sheets/Slides scopes. Per-service text names real
effects such as sending, trash, sharing and script execution. Existing grants remain until the employee explicitly
reauthorises or revokes them. Google grants can be broader than the app's selected operation intent, particularly
Gmail compose/modify scopes; the app still requires sending intent and exact-payload confirmation to send mail.

The selected-service summary says that changing the form does not yet change account permissions. Confirming in
Google applies them immediately, independently of the General save button. View files lists accessible files; it is
not an AI file-allowlist or a change to Google ACLs. Chat read consent follows the one-approval-per-request contract
in [Google Workspace functions](google-workspace-functions.md#connection-and-intent). Daily summaries retain their
separate saved consent; direct Settings reads and managed per-operation policy keep their established checks.

## Verification

`desktop/test/settings-clarity-smoke.mjs` uses the real main/preload/renderer and synthetic account actions to check
save failure/recovery/discard, selection scope, language separation, service intent, pause scope, manager state,
search and real Chromium zoom at 125–150%. The existing connection, Google, style and language smokes retain their
assertions with selectors adapted to the new labels and explicit save/back flow. No live employee account, real
Google grant or accessibility certification is implied by these fixtures. No version bump or publication is included.
