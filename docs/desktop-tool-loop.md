# Governed Desktop tool loop (Phase 2)

Chat and Draft share a host tool loop in `WorkService`. Existing provider adapters remain isolated and their native file/shell/MCP tools remain disabled. Models request host operations in explicit `step-tool` JSON fences. The default limit is eight model turns and at most eight requests per turn. Consecutive read operations execute in groups of three; commands, staged previews, questions and approvals execute sequentially. The final turn cannot start another operation.

## Permissions and outgoing data

Model-generated search queries and fetch URLs require their own one-time destination consent before network access. Only pattern-checked public requests qualify; confirming a provider result does not authorize a new web/search destination. Policy/workspace checks repeat after this consent.

Model text-file reads scan the complete bounded source before paging. Known credentials block the entire source; paging offsets refer to masked text so detection cannot be bypassed at a chunk boundary. Manual previews remain local and use the existing attachment consent when sent into Chat.

The initial request and later human requests retain routing and authority checks. `skill` accepts only a catalog entry with `status: routed`, reroutes the original task with that Skill, and rejects blocked, unavailable or ambiguous authority. `reference` resolves a controlled document ID and returns its status/authority/verification. Context reads enforce canonical boundaries, credential exclusions and managed path rules.

`features.toolLoop: false` keeps proposals inert for manual review. Plan mode allows research/questions/plans but rejects model staging and command execution. Local tools retain Phase 1 path, command, mode, pre/post hook and policy-change checks. Shell execution requires confirmation unless policy enables both auto mode and `shellByAi`; it uses the employee's OS permissions and is not an OS sandbox. Models cannot apply Changes.

Every new result is scanned and checks transmission consent. Eligible clean reads can share an explicitly selected scope for one loop; the default remains approval once. Scopes expire after at most 10 minutes, 24 results or 200,000 characters, bind to source/provider/account/model/workspace/team/policy/mode, and never persist. Masked sources and document/spreadsheet/MCP/shell/write results require separate review. See [Phase 6](desktop-phase6.md) for source scopes and the revoke-and-stop control. Consent remains independent of execution permissions. Credentials and withheld redactions cannot transmit. Declining returns a code without content. Workspace/mode/policy changes invalidate the loop. Cancellation closes pending approvals/questions and stops commands started by that run. Completed runs can leave approved background tasks in Tasks.

Results and prior requests are tagged as untrusted data. The paging cache contains approved/masked text only and is discarded after each run. Results expose a 4,000-character preview, result ID, total size and `nextOffset`; `read_remaining` gets another approved cached page through the hook gate. Cache size is capped at four million characters, one result at one million. Context checks remain in force; compaction belongs to Phase 3.

## Protocol

```step-tool
{"tool":"files","input":"notes.md","args":{"offset":0}}
```

| Tool | Arguments and behavior |
| --- | --- |
| `files` | Relative path; `args.action: list` lists a directory. Reads return 40,000-character pages with explicit offsets, bounded at 8 MB. Manual Files previews use 200,000-character pages and prevent editing a partial page. |
| `changes` | Path and `content` stage text; `args.action: list` or `diff` reads authorized current-workspace changes. No model apply operation. |
| `terminal`, `tasks` | Approved command execution and bounded background output; task ID or empty input reads tasks. |
| `browser`, `web_fetch` | Public HTTP(S) URL; background text retrieval without cookies or browser credentials. Manual Browser remains separate. |
| `web_search` | Public pattern-checked query, native search on the same provider, without source files/history/organization context. Requires a native search completion signal. |
| `skill`, `reference` | Registered routed Skill ID or controlled document ID, with authority and path checks. |
| `doc_outline`, `doc_section` | DOCX/PDF path and `args.index` for a section. Uses the existing disposable document/privacy worker. Outline derives from extracted headings and bounded text groups, not a preserved Word TOC or PDF page map. Partial/unreadable extraction is withheld. |
| `sheet_read` | XLSX path, optional `args.sheet` and `args.range`, default `A1:J20`, maximum 500 cells; reports worksheet dimensions. |
| `sheet_edit` | XLSX path, optional sheet name, `args.edits: [{cell:"A1",value:"new value"}]`, maximum 200 scalar edits. Stages a readable cell preview and workbook, without direct writes or object-valued formula edits. |
| `ask_user` | Question in `input`, up to six labels in `args.options`; Chat accepts an option or free text. Cancellation stops the run. |
| `plan` | Plan text in `input`; one-time approval before continuing to draft. Does not authorize business actions. |
| `snapshot` | Path and `args.action: create` or `list`; `restore` plus snapshot ID in `args.id` stages restoration. |
| `read_remaining` | Result ID and `args.offset`; cannot read another run's cache. |

XLSX parsing runs in a disposable worker with 256 MB heap and a 20-second deadline. Source/result workbooks are capped at 8 MB. ExcelJS rewrites the workbook; complex charts, pivots, external relationships or unsupported features may not round-trip. Synthetic checks prove cell values/types and conflict handling, not every Excel feature. Only `.xlsx` is supported.

Applying an existing file saves its exact bytes in local SQLite first. The source must still match the preview hash; changed files/workspace paths are refused. Restoration stages another Changes preview through the same apply gate. Backups are limited to 30 entries/40 million base64 characters; employees can inspect/remove a selected backup in Changes. Staged bytes/backups stay local and are never sent as binary tool results. They are not Git worktrees or OS snapshots. New files have no earlier file to restore.

## Public retrieval and organization proxy

Address exclusions use a conservative subset of the [IANA IPv4 registry](https://www.iana.org/assignments/iana-ipv4-special-registry) and [IANA IPv6 registry](https://www.iana.org/assignments/iana-ipv6-special-registry). Some special-purpose globally reachable ranges are intentionally excluded.

Host URLs allow HTTP(S), ports 80/443 and no credentials. Local/reserved IPv4, non-public/mapped/transition IPv6 and non-public hostname suffixes are rejected. Every DNS answer must be public; the actual connection pins a verified IP. Four redirects maximum, with repeated URL/DNS checks. Responses permit uncompressed HTML/plain text/JSON at 2 MB, with a 30-second deadline. Script/style content is removed; nothing is executed. This is text retrieval, not authenticated or JavaScript browsing.

Trusted policy can set `"network": {"proxyUrl": "https://proxy.example.org:8443/"}`. The proxy URL has no credentials/path/query/fragment. CONNECT targets the verified public IP; HTTPS verifies the destination certificate. Administrators choose the trusted proxy, including internal endpoints. Proxy authentication is unsupported. Tests cover a real local HTTP CONNECT proxy and private redirects; live corporate configuration and HTTPS proxy E2E remain unverified. This setting governs host fetches, not provider runtime traffic.

## Retry and usage

`PROVIDER_BUSY`, `PROVIDER_NETWORK` and `RUNTIME_EXITED` get three retries at 2/4/8 seconds with 25% jitter and cancellation-aware waits. Structured `retry-after` seconds/date or `retryAfterMs` takes precedence, bounded at two minutes. Tests inject delays. Non-transient errors, quota failures and tool effects are not replayed. Usage before a failed provider attempt stays counted.

`/usage` and the command palette open a local ledger for Chat/Draft and native web search, grouped by UTC day/provider/model. Prices are USD per million tokens, keyed by model or `provider:*`. Missing prices remain explicitly unpriced; policy changes do not rewrite past estimates. Daily token/monthly cost warnings appear at 80% of configured budgets and are advisory, not hard spending caps. Missing provider usage, image pricing, OCR resolution, hook prompts, subscriptions and work outside the app are not billing reconciliation.

Validation uses synthetic accounts/documents and actual local Electron/preload/IPC. It does not establish live provider entitlement, production acceptance, install/signing behavior, sandboxing or future phases.
