# Harness parity: first bounded pilot, 2026-10-13

The first pilot verifies that STeP's host tools can support a source-backed brief, a real spreadsheet, and error recovery through both text requests and a Claude native MCP bridge. It **does not provide a valid ranking of the three providers**: the ChatGPT run was stopped by the evaluator, Gemini did not reach tool execution, and the complete native matrix did not fit the remaining allowance. Caching has not been tuned.

## Fixed workload and evidence

Each attempted full trial receives the same public/synthetic three-task pack and the same `decision-memo` and `spreadsheet-work` instructions:

1. Read registered `step-public-profile`; create `brief.md` with the Thai organization name, `Make Innovation Simple`, the public-reference authority limit, an explicitly unknown headcount, and a real source citation.
2. Create `budget.xlsx`; preserve `00123` and `00007` as text, values 100 and 200, and the formula `SUM(B2:B3)`. Read the actual workbook back. Header source comments identify synthetic data. No formula recalculation is claimed.
3. Patch `recovery.md` after one injected `FILE_BUSY_ONCE` and a real `FILE_CONFLICT` caused by a concurrent edit. Preserve the added line and unrelated content; use a fresh hash.

The executor and privacy/permission path are shared. Native transport is one structured bridge with `argsJson`, not a separately typed schema for every host tool. The baseline is a scoped adapter/ToolLoop evaluation, not end-to-end UI routing. Reported SDK invocation counts are not comparable model-call counts: a native query can contain multiple model steps.

## Measured results

| Provider / model | Arm | Verified files/tasks | Host calls | Invalid calls | Injected errors recovered | Time | Reported total tokens | Run status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Claude / `claude-opus-5-5` | baseline | 3/3 | 9 | 0 | 2/2 | 25.4 s | 80,281 | completed |
| Claude / `claude-opus-5-5` | native SDK MCP | 3/3 | 10 | 0 | 2/2 | 33.4 s | 95,920 | evaluator cancelled at final usage report |
| ChatGPT / `gpt-5.6-luna` | baseline | 0/3 | 0 | no sample | not exercised | 15.7 s | 37,951 | evaluator budget guard cancelled |
| Gemini / `gemini-3.8-flash-medium` | baseline | 0/3 | 0 | no sample | not exercised | 5.7 s | 0 reported | `PROVIDER_REQUEST_FAILED` |
| Gemini / `gemini-3.8-flash-medium` | native capability attempt | 0/3 | 0 | no sample | not exercised | 5.8 s | 0 reported | `RUNTIME_EXITED` |

Claude's actual model was observed from SDK init/messages and pinned for its native arm. The actual brief contents were reviewed against the registered source, and both sets of XLSX and recovery artifacts passed physical file checks. Native Claude's files passed, but a clean final model response was not completed; artifact success must not be presented as full end-to-end run success.

The native Claude query reported 19.5% more tokens and took longer in this one ordered pair. Its additional host read and uncontrolled provider cache state limit the comparison. This is evidence to keep native integration experimental, not proof that native tools are worse or better.

Runtime versions: Claude Code 2.1.295 with SDK 0.3.284; installed Codex 0.158.0; Antigravity 1.2.17. The database's ready flags are cached state, not proof that live model requests will succeed. Antigravity's model-list command returned the selected model, but that did not resolve its live request failure.

Combined observed tokens: **214,152**. The ledger additionally retains 50,000 for the zero-usage Gemini baseline failure and 25,000 for its native startup failure: **289,152 / 300,000 accounted**. No allowance was reset and no inference was performed after these trials. Local artifacts and raw traces are in `output/CC/2026/10/harness-parity/` (ignored by Git); previous source fingerprints and the measured evaluator snapshot are retained there.

## Compatibility checks and fixes after measurement

- Codex app-server accepted `experimentalApi` and the dynamic tool schema without starting a model turn. This proves registration compatibility; native task performance remains unmeasured. [Protocol documentation](https://learn.chatgpt.com/docs/app-server).
- The Claude bridge actually invoked the shared host executor and recovered both injected errors. Subsequent unit tests also exercise the real MCP stdio subprocess against host path, tool and registered-source restrictions. [SDK custom-tool interface](https://code.claude.com/docs/en/agent-sdk/custom-tools).
- Antigravity native preflight still exits before a user prompt is sent. The prototype's early stdin close and incorrect agent aliases/frontmatter were corrected, but the zero-inference preflight still fails on this runtime. The unresolved exit is not a model-quality result; native support has not been accepted. [MCP configuration](https://antigravity.google/docs/mcp), [custom agent schema](https://antigravity.google/docs/subagents?tab=cli).
- The initial 50,000-token call reservation cancelled ChatGPT after a 37,951-token first response because its 75% guard fired. That result measures an evaluator limitation. Ambient repository instructions/Skill discovery may contribute to the large input, but this has not been isolated.
- Native Claude reported cumulative usage only at the final result, exceeding its 90,000 reservation while remaining inside the combined allowance. The evaluator now observes per-message usage without double-counting streamed blocks and checks next-step headroom at the MCP boundary. That correction passed synthetic tests and has not been remeasured with a live model. Runtime counters still cannot certify unseen provider helper usage or exact plan billing.

## Next experiment before caching work

Use a workspace outside repository ancestry, verify each connection with a bounded preflight, isolate ChatGPT's ambient context, and resolve Antigravity's startup failure first. Then freeze the models/runtime versions, use per-step admission for every native protocol, split the pack into budgeted trials, counterbalance arm order, and repeat the paired cases. Keep the source-backed file checks and error-injection acceptance criteria. Only after a complete comparable matrix should cache settings be evaluated.

These scripts are experimental and do not enable native tools in the shipped Desktop or change managed policy, approval rules, account settings, or runtime versions.

Local Windows verification: Desktop tests **701 passed / 4 platform skips**, formatting and build passed; the real-host self-test exercises all three positive outcomes and a negative source-fact case without model calls. Six focused tests cover durable accounting, bounded continuation, malformed requests, streamed native usage, recovery metrics, and real MCP subprocess forwarding with denied-path/tool/reference cases. Post-measurement safeguards and prototype fixes have not consumed additional inference quota.
