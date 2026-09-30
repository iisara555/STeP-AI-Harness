# OpenHarness adaptation delivery status

The approved roadmap adapts [HKUDS/OpenHarness](https://github.com/HKUDS/OpenHarness) to a document-oriented STeP employee workspace. Risky features must exist behind organization policy. LINE is the planned chat channel; compatible endpoints are optional provider profiles independent of data classification. Router authority, Privacy Gate and credential-path protection remain mandatory.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Merge both existing development lines and validate the common base | Complete in `359e34a` on `feat/openharness-parity` |
| 1 | Managed policy, Workbench permission gate, hooks, unified approvals and mode UI | Implemented and covered by local unit/Electron checks; see [managed policy](desktop-policy.md) |
| 2 | Bounded tool loop, parallel reads, document/spreadsheet/reference tools, plans, snapshots, output previews, retry/backoff and usage/cost | Implemented with synthetic local unit/Electron validation; see [tool loop](desktop-tool-loop.md) |
| 3 | Workspace instructions, compaction, confirmed memory, personalization, session resume/fork/search/export and local OCR input | Pending |
| 4 | Coordinator, background/cron tasks, gated autopilot, Docker sandbox and administrator-approved MCP | Pending |
| 5 | Compatible providers, Copilot, headless CLI, dry run, commands, voice, governed Skill Packs and LINE gateway/session runner | Pending |
| 6 | Live feature-matrix evaluation and remaining operator/employee documentation | Pending; live API runs require an explicit user instruction |

Keep each phase reviewable separately. The base branch carries the approved Phase 0 merge; Phase 1 changes are reviewed against that base. Subsequent phases depend on the permission/approval boundary. Do not label an administrator feature flag as proof of an implemented or released feature.

Phase 2 should extend the existing `step-tool` protocol and `WorkService` rather than create an alternate path around routing/privacy. Only approved read operations may execute automatically. Writes and shell execution must keep `ToolGate`, policy reload checks, hooks and the approval UI; automatically sending results to a provider needs a separate content privacy/consent check. The current shell filter is not a Docker or OS sandbox.
