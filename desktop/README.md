# STeP Desktop (development preview)

Local Electron workspace with Thai chat, Tiptap text editing, SQLite history, conflict-safe proposals, source review, and versioned exports. The shared routing service retains the CLI contract. Graphify is developer tooling only.

## Run

Use Node 24 LTS and Python 3.10+ for repository validation. From the repository root:

```sh
npm --prefix desktop ci
npm run desktop:build
npm run desktop:start
```

Open Settings, select a workspace and team (optional), add a provider connection, then run its explicit connection test. That test sends one short request and may consume provider quota. No credentials are imported from personal CLI installations.

In-app Claude subscription chat is off by default and needs `STEP_CLAUDE_SUBSCRIPTION=1` in the environment. Keep it off in releases until Anthropic approves offering claude.ai login in STeP (the Agent SDK terms require prior approval). With the flag off, existing subscription connections can still sign out and be removed, but cannot connect, list models or chat.

For Claude subscription chat, install Claude Code 2.1.268 or newer yourself, choose Claude → บัญชี Claude, then connect. Claude Code opens the browser and manages authentication; paste a code into STeP only if prompted. Login, status, SDK inference and logout share a per-connection `CLAUDE_CONFIG_DIR` under STeP app data. The installed executable is used for both authentication and SDK requests. STeP does not copy personal Claude credentials, implement OAuth itself, or automatically install Claude Code. API-key chat and the optional external Claude Code handoff remain available. If the runtime is removed, reinstall it before signing out so it can clear its credential store. Live Pro access and macOS credential isolation require separate live validation; automated tests do not prove subscription entitlement.

## Verification

```sh
npm test
npm run validate
npm run desktop:test
npm --prefix desktop run build
cd desktop
node test/electron-smoke.mjs
npx tsx test/runtime-probe.ts
powershell -NoProfile -File test/office-smoke.ps1
```

Unit tests use fake generation, real routing, SQLite and export libraries. Electron smoke tests exercise actual IPC, editing, version restore and themes without authenticating providers. Runtime probes initialize the bundled protocols without sending prompts. These checks do not prove live account access, quota handling, macOS support, or broad document layout coverage. The optional Windows Office smoke requires Word, Excel and PowerPoint and opens only synthetic exports.

## Distribution

`npm run package` creates an unpacked app. `npm run dist:win` creates an NSIS installer. `npm run dist:mac` must run on a macOS build host for each architecture. A signed, notarized release and clean-machine tests remain release gates; unsigned development builds are not production releases.

## Boundaries

- Conversation history and drafts are local application data, not diagnostic logs. API secrets use Electron secure storage. Provider-managed authentication is stored in an isolated runtime profile.
- Only extracted, reviewed text is sent for attachments; original documents are not uploaded. Unsupported/incomplete extraction is blocked. One source attachment per request preserves one-source Playbook constraints.
- The host rejects provider tool requests and exposes no external submission or publishing IPC. Runtime built-in tool restrictions still require adversarial live verification. Export happens through host code.
- DOCX/PDF/Markdown preserve headings, lists, bold and italic. Office exports use simple layouts. XLSX splits tab-separated or Markdown table rows. PPTX paginates text; this is not an Office layout editor.
- Graph edges are navigation aids, never authoritative evidence. Use `node scripts/graphify-local.js build` from the root and verify inferred edges against source.
- Live account login, provider failure behavior, packaging, signing, and macOS require independent validation before release.
