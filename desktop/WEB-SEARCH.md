# Public web search and activity feedback

Public, time-sensitive chat requests such as Thai government holidays, weather, exchange rates and latest news can use the selected account's native web search. Explicit public web search requests also qualify. Internal employee policy, attachment analysis, drafting, image creation and consequential actions retain their existing routing and authority checks. This is a deliberately bounded deterministic classifier, not general semantic intent detection.

The exact request `ประกาศวันหยุดราชการปีงบ 2570` routes to GENERAL with mandatory governance references even when a synthetic CC profile is selected. The evidence prompt distinguishes a Thai fiscal year (October through September) from the calendar year and requires official announcements covering both years, rather than assuming additional holidays are final.

Retrieval is a separate ephemeral provider run receiving only the current privacy-passed public request. Attachments, history, drafts and organization instructions are not supplied to the retrieval model. OpenAI/Codex uses `web_search = live`; Gemini CLI enables only `google_web_search`; Claude Agent SDK exposes only `WebSearch`. All native tools are disabled again during the final answer run. Search summaries are untrusted data; the answering model must cite primary sources and distinguish missing announcements and assumptions. Search and answer token usage are combined when reported by the provider.

The host requires an observed completed search-tool event before proceeding. A runtime without search support, a failed search tool, or a model that skips searching produces a visible error instead of silently substituting a memory answer. Account entitlement, model compatibility, organization policy and tool availability can still prevent searches. No new search-service key is required. Source cards open HTTP(S) links in the existing sandboxed Browser only after a user click; scripts, credentials, IP literals and local host links are rejected.

Activity is reported from actual runtime events: preparation, searching, reading (when the runtime reports opening a page), evidence summarization, waiting for the answer and streamed answer generation. A host heartbeat runs every three seconds. The renderer shows elapsed time, completed phases and a slow-step hint without clearing streamed text. The heartbeat indicates host responsiveness, not provider progress; cancellation and timeouts remain available.

## Validation

Automated tests use synthetic accounts, mock SDK hooks, fake JSON-RPC runtimes and an isolated SQLite profile. They cover routing, privacy/authority stops, attachment isolation, cancelled retrieval, unsupported search, source-link validation, provider tool allowlists and real Electron progress/streaming. These tests do not establish live subscription entitlement, official source freshness, search quality or actual holidays.

Before release, test each supported account on Windows and macOS with a public request, confirm official source links and dates, verify unavailable-search and quota errors, and cancel a slow search. Verify that internal policy requests still use organization sources. Signing/notarization and clean installation remain separate release checks.

Provider references: [Codex configuration](https://developers.openai.com/codex/config-reference/), [Codex app-server events](https://developers.openai.com/codex/app-server/), [Gemini web search](https://geminicli.com/docs/tools/web-search/), [Gemini configuration](https://geminicli.com/docs/reference/configuration/), [Claude SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions).
