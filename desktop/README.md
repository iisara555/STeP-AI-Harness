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

### Optional local Thai OCR

The base STeP Desktop installer intentionally does **not** include Python, PaddlePaddle or OCR model weights. Employees who never use receipt OCR therefore do not download or install that runtime. The small STeP OCR application code and requirements are included so the Receipt page can install the component later.

When an employee opens **ตรวจใบเสร็จ AFP** and chooses **ติดตั้ง OCR**, STeP Desktop downloads a pinned Python build, verifies its SHA-256 checksum, installs PaddlePaddle and the Thai OCR requirements into the employee's app-data folder, and prepares the OCR models. The component remains local to that user and can be retried cleanly after a partial failure. Receipt recognition continues to bind only to `127.0.0.1`; original receipt files are not uploaded to an OCR web service.

The automatic component currently supports Windows x64, macOS Apple silicon, and Intel macOS. Intel macOS uses the last PaddlePaddle CPU build supported by that architecture.

## Boundaries

- Conversation history and drafts are local application data, not diagnostic logs. API secrets use Electron secure storage. Provider-managed authentication is stored in an isolated runtime profile.
- Only extracted, reviewed text is sent for attachments; original documents are not uploaded. Unsupported/incomplete extraction is blocked. One source attachment per request preserves one-source Playbook constraints.
- The host rejects file, shell and action requests from provider runtimes and exposes no external submission or publishing IPC. A separate public retrieval run enables only native web search after privacy and authority checks. Runtime restrictions still require adversarial live verification. Export happens through host code.
- DOCX/PDF/Markdown preserve headings, lists, bold and italic. Office exports use simple layouts. XLSX splits tab-separated or Markdown table rows. PPTX paginates text; this is not an Office layout editor.
- Graph edges are navigation aids, never authoritative evidence. Use `node scripts/graphify-local.js build` from the root and verify inferred edges against source.
- Live account login, provider failure behavior, packaging, signing, and macOS require independent validation before release.


### Claude Console OAuth

STeP Desktop รองรับ OAuth แบบ official ผ่าน Anthropic `ant` CLI โดยใช้ `ant auth login` และเก็บ profile แยกต่อ connection ใน app data ผ่าน `ANTHROPIC_CONFIG_DIR`. Claude Agent SDK อ่าน profile เดียวกันโดยตรง จึงไม่ต้องคัดลอก OAuth client ID, อ่าน token file หรือบันทึก access/refresh token ในฐานข้อมูลของ STeP

โหมดนี้ใช้ Claude API workspace/usage ของ Claude Console ไม่ใช่โควตา Claude Pro/Max. การใช้ Pro/Max ภายในแอปยังคงปิดไว้หลัง `STEP_CLAUDE_SUBSCRIPTION` จนกว่าจะได้รับอนุมัติที่เหมาะสม; ผู้ใช้ Pro/Max ยังส่งต่องานไป Claude Code ภายนอกได้ตามเดิม
