# Antigravity backend comparison

The owner asked for a smoother chat, tool, browser, connection and approval experience without changing the UI. This
comparison uses the locally installed Antigravity 2.24.0 on Windows. REA inspected shipped files without executing them or
using an account. Static capability is not evidence that a feature ran or that its approval policy matches STeP.

## Evidence and limits

| Evidence | Observation | Scope and uncertainty |
| --- | --- | --- |
| `ev_8ff45ec41cea49ced1cabf80ad7e6a4b6ecf1c9c66152539ef1e22aa5c05395d` | Its Electron wrapper starts a separate language-server process, waits for its port and retries a crash with a bounded restart policy. Its host bridge binds to loopback and checks Host and a bearer token. | Partial static JavaScript analysis of `app.asar` (SHA-256 `bd10a0054ca3ad469142b2c2757566493ecc0afb934b9a61ce45d38a4d09316e`). The bridge is not established as the chat transport. |
| `ev_083015bccf10d74a801eba8ad6a1b03f8d07a0a92b68d802ba67e13fa09aa683` | The bundled Chrome DevTools MCP 1.9.0 contains page navigation, snapshot and interaction operations, and code for either attaching to an existing browser or launching one. Attached browsers are disconnected rather than closed at shutdown. | Four selected JavaScript files of 80; this establishes bundled capabilities, not which tools the product invokes or its consent behavior. |
| `ev_4464933c7809463c4e070677a1baf9c5941000dc4195bffb108f4f18bb491a06` | `language_server.exe` is a Windows x64 PE with embedded Go compiler metadata. | SHA-256 `12ae561f6f070b52d8342056fa28c9e45043f07712bb735868842c0314257dc4`; the main module was not recovered. REA native analysis providers were unavailable. Chat, tool-loop, model, approval and connection behavior inside this executable remain unknown. |

The evidence supports bounded recovery and continuity as useful design goals. It does not establish feature parity or
justify changing STeP's trust boundaries. No Antigravity account, private profile, network capture or runtime scenario
was inspected. For a fuller comparison, analyze the native backend with an available REA provider and independently
observe authorized synthetic scenarios.

## STeP implementation scope

STeP keeps its host-owned `step-tool` loop, governed registry and separate provider adapters. The changes in this
branch address concrete failures in batches and waiting, duplicate website approvals, the browser's reused-tab
navigation/cancellation and connection-test results. Tool creation remains an approved workspace-file/script
workflow: it does not dynamically register or grant new host tools. Confirming a web destination does not grant
unrelated destinations, data classes, accounts, actions or later permissions. Completion and external side effects
still require their existing validation and approval checks.

The comparison is incomplete for native tool transport, arbitrary browser profiles, live account behavior and
subjective model quality. Synthetic tests cannot prove full equivalence with Antigravity or employee-device acceptance.
