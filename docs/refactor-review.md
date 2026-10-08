# Runtime structure and concurrency review

Review date: 2026-10-08. Source baseline: `be9e505`, Harness 0.7.6 / Desktop 0.5.28, with the separate README rewrite retained in the working tree.

## Scope and structure

The review mapped runtime imports and entry points across Harness, Desktop, installers/scripts and the experimental LINE gateway. It examined the local OCR process/HTTP lifecycle and focused manual review on asynchronous task ownership, form updates, persistence, consent and policy changes. Existing tests supplied coverage for routing, authority/privacy gates, provider retries, tools, file boundaries and release helpers. This is a source and regression-test review, not a certification that every race or vulnerability has been eliminated.

The main ownership boundaries remain:

| Area | Responsibility |
| --- | --- |
| `src/modules/router/`, manifests, Skills and rules | Shared routing, source requirements and organizational guidance |
| `src/modules/runner/`, actions, privacy and provenance | Governed execution, budgets and data/source boundaries |
| `desktop/electron/` | IPC, stored tasks, providers, permissions, filesystem access and exports |
| `desktop/src/` | User intent, task selection, editable drafts and receipt review |
| `experiments/local-thai-ocr/` | Optional local OCR, worker isolation and experimental acceptance measurements |
| `plugins/step/` | Generated distribution; edited through its source and builder |
| `gateway/line/` | Experimental gateway, not an employee production channel |

No orphan runtime module was established by the dependency scan. Files without an ordinary importing parent were accounted for as package/renderer/Electron entry points or explicitly launched workers. The Codex compatibility re-export, CLI adapters and legacy installation helpers remain reachable or support documented migrations; removing them would change supported behavior. Vendor code and generated Skill copies were not treated as application dead code.

## Confirmed findings and fixes

| Finding | Change | Evidence |
| --- | --- | --- |
| A completed chat run released its active entry twice. A completion listener could start a new run between releases, which then lost cancellation and exclusivity. | `WorkService.run` owns the sole release and final change notification. | The new `workspace.test.ts` regression failed before the fix; it now verifies the next run remains active, rejects duplicate sends and can be cancelled. |
| Sends and deletion checked task ownership before awaiting organization hooks. A second send or delayed deletion could then overwrite an active task's status or remove its draft/template. | Recheck run ownership immediately after the hook and before mutating the task; check the parallel limit again for sends. | The native-template Electron regression pauses two submit hooks and a deletion hook, starts one held model run, then verifies the duplicate/deletion are rejected and the active task and snapshot survive. A negative control reproduces the original race. |
| Concurrent OCR starts could spawn multiple children. Stopping during health checks did not stop a later spawn, and an old child exit could clear a replacement. | Share one pending startup; invalidate stopped attempts; bind child cleanup to the exact child; handle spawn errors. | `ocr.test.ts` exercises simultaneous starts, stop-before-spawn and a delayed exit from the previous child using synthetic processes. |
| Concurrent configuration read/merge/write operations lost fields and exposed truncated JSON to readers. | Acquire an exclusive file lock before reading, write a private unique temporary file, then rename atomically. Clean up on failure. | `user-config-concurrency.test.js` failed before the fix. It now checks concurrent updates in one process and three separate processes, continuous readers and failed-write recovery in temporary profiles. |
| Parallel shared-profile saves used the same per-process temporary filename and failed with `ENOENT`; older settings snapshots could be persisted after newer settings. | Serialize writes by resolved profile path, use exclusive unique temporary files, and read current stored settings when exporting the profile. | `shared-profile.test.ts` reproduced the failure and now checks 30 overlapping saves, final invocation order and cleanup. |
| Concurrent settings requests could write older personalization into `USER.md` or use a workspace that changed during a write. | Queue personalization synchronization, read current settings inside the queued job, capture its directory and check it before creating assistant defaults. | The Electron smoke performs 20 overlapping settings requests and compares `USER.md` and the shared profile with the authoritative final settings. |
| Late vision or candidate-filter results replaced manual receipt corrections, including their provenance. | A receipt form reducer owns values, origins, guesses, description and review state together. Suggestions preserve manual edits and are bound to a receipt source ID. | `receipt-form.test.ts` covers manual corrections, intentional blanks, late results from another receipt and confirmation reset. The renderer smoke edits the merchant, reference, date and description while a synthetic AI reading is pending. |
| Receipt IPC claimed its AI busy flag after consent/rendering awaits. Another request could enter meanwhile; consent writes also restored stale settings. | `ReceiptOperations` claims the workflow before the first await, across read/vision/filter. Consent updates merge current settings. Background status refreshes do not release a foreground UI action. | Unit tests cover exclusion, cancellation and retry. Real IPC smoke checks overlap while a file picker is pending and a settings change while consent is pending. |
| A receipt vision request could continue under policy permissions captured before a consent dialog. | Policy reload cancels the receipt operation. Check policy/abort state after awaits and immediately before provider calls; propagate cancellation to OCR and provider requests. | The IPC smoke enables privacy checks while consent is pending and verifies rejection before image rendering or a provider call. Policy defaults are unchanged. |
| Out-of-order snapshots and task-resume replies restored old UI state. Multiple save callers could race on the same draft revision. | Apply only the latest snapshot/navigation request, including navigation to another page; serialize draft saves and keep dirty state when editing during a save. | Real renderer smoke reproduced a late selection switching back to task A after task B was selected. It checks latest selection/page/snapshot and overlapping saves with edits made while saving. |
| A change event from another task cleared the single pending completion identifier. An old callback could also clear a newer attempt. | Track completion attempts separately by session and token; remove only that attempt after a terminal status, preserving other active tasks. | The renderer smoke checks that an unrelated task change does not remove the notification for a synthetic background completion. |
| Unused JavaScript import bindings obscured dependencies. | Remove 12 unused bindings from 10 runtime files. Keep public exports and active modules. | Import/reference scan, root tests, Desktop type checking and build. |

## Verification and practical limits

- `npm test`: 947 tests, 945 passed, 2 skipped by existing conditions.
- `npm run desktop:test`: 476 tests, 474 passed, 2 skipped by existing platform conditions.
- `npm run validate`, `python3 scripts/validate_repo.py`, Desktop TypeScript/build and formatting checks.
- `desktop/test/async-lifecycle-smoke.mjs`: real Electron renderer and preload/IPC, controlled out-of-order replies, temporary SQLite/profile files, synthetic image, synthetic provider reading and background completion. Model discovery/sign-in/live sends are blocked or simulated by the fixture. No live provider account or real receipt is used.
- Existing Electron chat/tools and document-tool smoke tests passed, including all five Skill-backed document forms, editor and DOCX export, using synthetic providers and no live accounts.
- New root tests are included in `npm test`; new Desktop unit tests are picked up by the existing test glob; the Electron regression is included in `test:electron`.

The cloud checks run on Linux. Native Windows/macOS installers, OS keychains, actual OCR model startup, real provider performance and employee hardware are not certified by these tests. Existing conditional tests retain their platform skips. The OCR acceptance gate and Skill/Router registration were not changed.

The configuration lock coordinates callers of `saveUserConfig`. It times out after five seconds rather than deleting an existing writer's lock. A lock left after a crashed writer requires inspecting that writer before removing `config.json.lock`; a timeout does not replace the configuration. Profile saves are serialized within the Desktop process, with unique temporary files separating other processes. These changes do not promise arbitration of simultaneous manual file edits by other applications.

`App.tsx` and `main.ts` remain large integration files. Future extraction should move cohesive task/navigation controllers and IPC domain handlers behind existing contracts and tests, one area at a time. Their size alone is not evidence that their branches are unused. The new receipt reducer and operation owner isolate two concrete responsibilities without replacing the UI, routing rules or authorization defaults.

No versions, dependencies, policy defaults, releases or external services were changed by this refactor. All regression fixtures are synthetic; no real OCR accuracy claim is made.
