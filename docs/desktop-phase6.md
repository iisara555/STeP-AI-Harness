# Desktop Phase 6: scoped consent and feature evaluation

Phase 6 reduces repeated transmission dialogs while preserving explicit consent, source privacy checks and the host permission boundary. It adds a reproducible synthetic/live feature matrix. This is a development implementation, not a packaged release or production acceptance.

## Employee consent flow

The first eligible tool-result dialog still shows a masked preview. The employee can approve that result once or explicitly select **allow new reads in this scope until the round ends**. The checkbox starts unchecked. Selecting it declares that the employee reviewed source rights and permits Public/Internal text in the displayed scope. A pattern scan does not establish source classification or grant permission by itself.

The scope binds to one host tool loop (one routed step), session, workspace, team, permission mode, policy revision, connection/account and selected model:

| Source | Reusable scope |
| --- | --- |
| Text file reads and directory listings | One canonical directory, excluding child directories |
| Public browser/web fetch results | One exact HTTP(S) origin; fetching each URL still requires destination consent |
| Registered Skill/reference text | One exact Skill/reference identifier |

Each scope permits at most **24 results, 200,000 characters total, and 10 minutes**. Limits include the first approved result. Consent checks serialize parallel reads so a three-read batch can share one explicit approval. The host still scans each complete bounded text-file source before masking/paging, and scans each outgoing result.

A bar above the composer shows source, provider/account/model, remaining allowance and expiration time. **Revoke and stop** cancels the current run and clears its grants. No grant is persisted in SQLite, session export, a fork, remembered workspace permissions or diagnostics. Completion, cancellation and failure dispose it. A later step, retry, session or app restart needs fresh consent.

The following retain separate confirmation or denial:

- A new source scope or destination/account/model, changed workspace/team/mode/policy, or exhausted/expired allowance.
- Recognized personal data, masking, review findings or uncertain extraction; pre-masking text-file risk is retained through the outgoing check.
- DOCX/PDF/XLSX results, raw images, MCP, shell/sandbox output, staged changes, plans and questions do not qualify for reusable transmission consent.
- Generated search queries and URLs require one-time destination consent before access. Result consent cannot authorize that request.
- Credentials and sensitive identifiers remain blocked. Path denials, hooks and plan mode apply regardless of consent.
- Applying edits, commands, publish/merge/delivery and business authority retain independent human gates.

Consent authorizes transmission, not execution or business actions. Already approved data may remain in the loop's paging/history cache; revocation stops subsequent provider calls but cannot retract a request already sent.

## Administrator setting

An optional managed-policy field disables the run-scoped choice:

```json
{ "transmissionConsent": { "allowRunScope": false } }
```

Omitting it permits the explicit, bounded employee choice; it never auto-selects consent. The only accepted field is a boolean `allowRunScope`. Malformed values reject the managed policy using existing safe defaults. Administrators should separately deny restricted source paths. Text patterns cannot establish whether an unlabelled document is confidential.

## Feature matrix

From `desktop/`, run `npm run eval:features` for offline evaluation using disposable profiles, synthetic data, the real Router, WorkService, memory store, compaction, ToolGate/Workbench and coordinator. It writes local, Git-ignored `eval-results/<timestamp>-matrix/results.json` and `report.md`.

| Feature | Checks | Live evidence boundary |
| --- | --- | --- |
| Memory/follow-ups/attachments | Confirmed synthetic memory selection, reviewed file text, current prompt, retained source marker, consent cleared on fork | Actual generation in live mode |
| Compaction | Real summarization, smaller token estimate, retained current message/task state | Actual summary generation in live mode |
| Reads/writes/hooks | Three clean reads, scoped consent, separate change-result review, staged file stays unapplied, blocking hook | Deterministic local protocol fixture; not live tool obedience |
| Retry/resume | Actual routed TOR Playbook checkpoints and resumes the failed step with prior draft | Injected quota failure; generation is real in live mode |
| Coordinator | Two concurrent WorkService subtasks precede final merge | Fixed synthetic decomposition/approval; generation is real in live mode |

Reports label evidence `local`, `live` or `hybrid`. Failed generation retains typed error codes. These checks do not certify document quality, subscription entitlement, native tool denial or production readiness. Read saved live outputs separately.

Live mode requires `STEP_EVAL_MODE=live`, `STEP_EVAL_APPROVE_LIVE=1`, a named provider and explicit auth source. API-key runs use `STEP_EVAL_API_KEY`. Claude subscription runs require an absolute `STEP_EVAL_CLAUDE_PROFILE` and may name `STEP_EVAL_CLAUDE_EXECUTABLE` to select an installed approved runtime. The existing profile is used for authentication without copying credentials; the provider may refresh its own auth state. Other runtime homes/cwd are temporary. Native tools, settings discovery, MCP and plugins remain disabled by the adapter. This evaluation option does not enable employee subscription login in the product.

Example for an already authorized Claude Code profile in PowerShell:

```powershell
$env:STEP_EVAL_MODE = 'live'
$env:STEP_EVAL_APPROVE_LIVE = '1'
$env:STEP_EVAL_PROVIDER = 'claude'
$env:STEP_EVAL_AUTH = 'subscription'
$env:STEP_EVAL_CLAUDE_PROFILE = '<absolute approved Claude profile>'
$env:STEP_EVAL_CLAUDE_EXECUTABLE = '<approved Claude Code executable>'
$env:STEP_EVAL_MAX_CALLS = '14'
npm run eval:features
```

The default is 20 provider calls (accepted range 1–50). A conservative 200,000 reported-token threshold stops later calls; it is not a hard bill cap or in-flight token limit. Auth, permission and quota failures stop later real calls. Golden quality evaluation also requires `STEP_EVAL_APPROVE_LIVE=1`, shares the runtime boundary and defaults to one run per scenario: `npm run eval:golden`. Both commands consume quota and require the account owner's explicit authorization.

## Evidence from 2026-10-01

- Offline feature matrix: **5/5 groups passed**. Three clean file reads used **1 transmission dialog instead of 3**. Including a staged-change result, the fixture used **2 dialogs instead of 4**. This measures fixture prompts, not real employee confirmation fatigue.
- Desktop unit tests: **216 passed**. Build and both repository validators passed. Electron evidence is recorded in `desktop/VALIDATION.md`.
- User-authorized Claude Code OAuth: bundled SDK runtime **2.1.284** verified the named profile's logged-in status. Personal npm runtime **2.1.221** was below the existing profile-isolation version gate and was not upgraded.
- Live matrix attempt: **1/5 groups passed**, the deterministic local tool group. Five provider attempts reported zero usage and produced no accepted generation. A subsequent auth check returned `LOGIN_REQUIRED`. This does not establish zero billing or successful live quality acceptance. At the user's request, further calls stopped and the failed report stayed local.
- The earlier attempt stopped pending renewed login and authorization. The user subsequently requested the [Claude OAuth follow-up](claude-oauth-followup.md), completed official CLI sign-in and passed a real generation probe and all five feature-matrix groups. Keep this earlier failed result as historical evidence. Product connection lifecycle and release acceptance remain separate.
- No production policy, credential migration, external delivery, main merge, installer or release is included. OpenAI/Gemini, real native tool denial, voice hardware, LINE operations and clean packaged installs remain separate acceptance work.
