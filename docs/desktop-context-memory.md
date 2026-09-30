# Desktop context, memory and session controls

Phase 3 extends the Phase 2 host. Routing authority, standing governance, permissions and content consent still precede provider calls. This is a development preview with synthetic local validation; it is not a production release.

## Context compaction

`desktop/electron/compact.ts` uses the existing `estimateTextTokens` function and `script-aware-estimate-v2` method from `src/modules/context-budget/index.js`. The conservative input budget is 48,000 estimated tokens including standing instructions. This is an estimate, not a provider tokenizer or a model-specific capacity guarantee.

The host first reduces older file and tool-result text to marked previews. The latest source and result, current request, route and governance remain complete. When history still exceeds the budget, the same configured provider summarizes older messages in bounded chunks. The summary is untrusted data. The task-state envelope retains the request, current message, route, file inventory, Skill references, explicit revision decisions, approved draft-only plan and Playbook progress. The local transcript remains intact. At most 12 summary chunks are used; older omitted turns are explicitly marked. A required source or standing context that cannot fit fails with `CONTEXT_LIMIT` rather than being silently cut.

`pre_compact` and `post_compact` hooks receive session id and before/after token estimates only. A blocking hook stops the run. A provider prompt-length failure triggers one smaller retry; quota errors do not. Summary calls use no tools, images or native web search, receive privacy-checked data and contribute provider-reported usage to `/usage`. Original provider calls still use the selected account and model.

## Confirmed memory

Open `/memory`, the command palette or the conversation's memory button. Employees can add, review, edit and delete memories. The editor explains that selected memories may be sent to the configured AI after per-run context review. Memory proposals retain the exact matching user evidence and source session id. No proposal becomes durable memory until the employee confirms it.

Storage uses Markdown frontmatter inspired by [OpenHarness schema v1](https://github.com/HKUDS/OpenHarness/blob/main/src/openharness/memory/schema.py): `schema_version`, `id`, `name`, `type`, `scope`, `importance`, `ttl_days`, `created_at`, `updated_at`, `source` and the body text. Types are `user`, `feedback`, `project` and `reference`; scopes are `private`, `project` and `team`. This preview uses UUID filenames and accepts its own user-confirmed format; it does not import arbitrary OpenHarness memory directories. Importance is 0–1; TTL is 0–3650 days, with zero meaning no automatic expiry. Expired entries remain editable but never enter prompts.

- Private: `<app data>/memory/`.
- Project: `<workspace>/.step/memory/`, ignored by Git and inaccessible through general model file tools.
- Team: an existing shared folder explicitly assigned to the employee's team by managed policy. Both `features.memoryTeam` and that team's folder are required. The OS must also grant access; changing teams cannot expose another team's assigned folder.

Every proposed, saved and loaded item passes `evaluatePrivacyGate`. Personal-data findings, masking, human-review signals, restricted data and secrets are rejected. No identifiers are allowlisted for memory. Schema and body sizes are bounded; symlinks/junctions, hard-linked files, credential locations and administrator path denials are refused. Path rules check both configured and canonical locations, including Windows 8.3 aliases and project `.gitignore` updates. Absolute rule prefixes resolve through existing ancestors, preserving denials for mixed short/long names even before memory folders exist. Writes replace verified records atomically. Each scope permits at most 200 files; bodies are at most 4,000 characters. The privacy detector recognizes text patterns; it cannot certify that all personal or organizational data has been identified. Employees must keep memory free of such data.

Relevance selects at most five confirmed, unexpired memories using lexical overlap, importance and durable user preferences. Selection uses local computation. Autodream is a bounded local background queue after completed tasks: it proposes only conservative response preferences from user messages. It never learns assistant claims, server addresses, credentials, names or financial facts, and makes no additional provider call. This deliberately adapts [OpenHarness personalization extraction](https://github.com/HKUDS/OpenHarness/blob/main/src/openharness/personalization/extractor.py) to STeP evidence and privacy discipline.

Managed policy example:

```json
{
  "features": { "memoryTeam": true },
  "memory": { "teamDirectories": { "cc": "C:\\STeP-Shared\\CC\\Memory" } }
}
```

Shared-folder creation, ACL configuration and organizational approval are administrator responsibilities. The app does not provision a network share or grant access. Team changes or workspace changes invalidate pending context consent. Memory is a preference or reference, never authorization for an external action.

## Workspace instructions and personalization

The host discovers only root-level `STEP.md`, `AGENTS.md`, `ASSISTANT.md` and the employee-selected `.step/output-styles/<name>.md`. It performs no recursive instruction discovery. These bounded UTF-8 files use canonical Workbench paths, permissions and Privacy Gate. Their content and selected memories require one-time context transmission consent. The conversation shows the exact loaded filenames/memory names.

Workspace instructions and output styles are user preferences beneath organization governance and the current route. They cannot enable tools, change authority or waive confirmation. All reserved prompt tags are fenced in these sections, summaries, memory and task state.

The existing profile remains in `USER.md` through `src/modules/user-memory.js`. `generateAssistantPreferences` derives an assistant-only `ASSISTANT.md` when one does not exist, excluding employee profile data. Existing employee-authored persona files are preserved. Edit the persona through the Files pane; the current in-app profile remains the standing personalization source. `/memory` also selects available output-style files. Persona and memory files stay local and are ignored by Git.

## Sessions

Opening an existing conversation resumes its saved transcript and draft. It never automatically replays a provider request or tool operation after an interruption. Fork copies content into an independent session with its parent id, clears transmission consent, identifiers, usage, run traces, approved plans and retry checkpoints, and preserves the original draft.

SQLite `fts5` with the trigram tokenizer indexes titles, project labels, messages, drafts and approved attachment text. Existing databases are backfilled at startup. Search treats input as a literal phrase, handles short strings with a bounded substring fallback, and deletes index entries with sessions. This is local search, not external embedding/search transmission.

The conversation exports Markdown or JSON through a Save dialog. Exports include transcript, approved file text and draft. JSON excludes connection identity, consent tokens, allowed identifiers and retry checkpoints. Privacy scanning masks recognized identifiers and blocks secrets before writing. Local export does not authorize publishing or sending the file elsewhere.

## OCR and optional vision

Ordinary attachments accept supported images and scanned PDFs. The host uses `OcrService` on the fixed local loopback address, checks complete page text and then applies Privacy Gate. Employees inspect OCR text and confirm transmission. Empty/partial OCR results are refused. If OCR is unavailable, a scanned PDF keeps its explicit refusal reason; image attachments explain that OCR must be ready. Actual OCR accuracy, handwriting and full production document coverage remain separate acceptance checks.

Original-image input is off by default. With managed `features.vision`, the separate **attach image to AI** control accepts PNG/JPEG/WebP up to 4 MB. It requires OCR first; any flagged OCR forbids original-image transmission because text redaction cannot mask pixels. The employee sees the image and explicitly confirms sending it. OCR cannot detect hidden visual personal data; the employee must inspect the entire image and have permission to transmit it. Raw images are transient, sent only with the current Chat/Draft run, excluded from summaries/search and not stored in sessions. Reference-image generation/editing is not part of this input feature.

Codex uses image data URLs; Claude uses an image-bearing SDK user message; Gemini uses [ACP image blocks](https://agentclientprotocol.com/protocol/v1/content) only when the agent advertises the image prompt capability. Policy is checked again before provider transmission. Native model file/shell tools remain disabled. Synthetic tests verify wire formats and rejection; live model entitlement, visual quality and billed image-token accounting remain unverified.

## Verification boundaries

Phase 3 has 186 Desktop unit tests and five Electron smoke scripts. The new smoke covers real preload/IPC/SQLite/UI memory CRUD, privacy rejection, compaction and usage, FTS, fork, Markdown/JSON export, restart without replay, synthetic local OCR and gated image input. Provider adapters and OCR responses are synthetic; no account login or paid API evaluation is performed. See [desktop validation](../desktop/VALIDATION.md) for the final Harness and CI evidence.
