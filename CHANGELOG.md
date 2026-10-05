# CHANGELOG — STeP AI Harness

บันทึกสิ่งที่เปลี่ยนในแต่ละรุ่นที่แจกให้พนักงาน รุ่นที่ยังไม่มี GitHub Release ถือเป็นรุ่นเตรียมออก ไม่ใช่รุ่นที่อนุมัติแจกแล้ว ชุดติดตั้งต้องมาจาก release tag และผ่าน Release Gate ตาม [Pilot Operations](docs/pilot-operations.md)

workflow `Publish Pilot Release` ใช้ส่วน `## v<รุ่น>` ของไฟล์นี้เป็น release notes ของ GitHub Release และจะไม่ออก release ถ้ายังไม่มีหัวข้อของรุ่นที่ระบุใน `package.json`

## Unreleased

The first four sections below are not released yet. STeP Desktop version 0.5.11 contains the next five sections, published as `desktop-v0.5.11`: "Long tasks: compaction sized to the model, more tool turns, a progress report at the limit", "Work in progress survives switching pages", "Web agent: finds tiles on menus that load late, and asks only at the final step in auto mode", "Tables, clean Excel and the Thai official layout" and "Qwen and MiniMax with the employee's own key". "Your plan through Claude Code: off by default, on for the pilot" was published as `desktop-v0.5.10`. "Open source under the MIT License", "Claude Pro / Max in the app, on by default" and "Apps set up before 0.5.8 share their profile too" were published as `desktop-v0.5.9`. Three further sections were published as `desktop-v0.5.8`: "Uninstalling" (the uninstaller's data choice), "One profile for STeP Desktop and Setup-STeP-Skills" and "Gemini via Antigravity: opt the STeP agent out of built-in tools". "STeP Skills for Claude, Codex and Antigravity" belongs to the harness, not the app. The six sections from "The browser agent can click tiles" through "Update card above the profile" were published as `desktop-v0.5.7`. "Gemini: faster tool turns", "Profile pictures" and the contextual empty-state illustrations (PR #91) were published as `desktop-v0.5.6`. Everything from "Updates inside the app" down was published as `desktop-v0.5.5`.

### Learning from work, part 4: opt-in background review and a health report

- **Background review** (after Hermes Agent):
  - Every 10 user turns in a task, the AI drafts lessons from it into the Learning Inbox, marked "automatic task review". They are proposals only.
  - It runs only when an administrator allows it (`features.learningReview`, off by default) and the employee turns it on in the inbox.
  - It runs at most 10 times a day, one at a time, never during a running task or in Plan mode. The tokens count in Usage.
- **Lesson store health report** in the inbox, report-only:
  - It flags lessons that look duplicated (character-bigram similarity, which works for Thai), procedures sharing trigger words, proposals waiting over 30 days, long lessons and a store close to its limits.
  - It never merges, deletes or disables anything, and it does not treat a rarely used lesson as worthless.
- Tests: `test/learning-curator.test.ts`. `test/learning-smoke.mjs` checks that the review is off until turned on, that no review happens at 9 turns, that one happens at 10 with source "review", and the daily count.

### Learning from work, part 3: compare a Skill before and after a change

- `node scripts/skill-eval-compare.mjs <skill> --base origin/main` answers the Skill's eval cases with the old and the new `SKILL.md`, using a real model (`STEP_EVAL_BASE_URL`, `STEP_EVAL_MODEL`, `STEP_EVAL_KEY`).
  - The cases include those not used to write the lesson, plus pending lesson cases.
  - A grader model (`STEP_EVAL_JUDGE_MODEL`, ideally a different one) checks each `outputAssertion`.
  - The result is a table per case, old → new, with the assertions the new version still misses.
  - Any case that gets worse fails the run.
  - `--record` stores the result in `baseline.modelSideRun`; `--dry-run` shows the plan without calls.
- The **Skill eval (old vs new)** GitHub workflow runs it on demand from repository secrets and attaches the report.
- `scripts/apply-skill-proposal.mjs` now applies the patch itself instead of with `git apply`. A Windows checkout with CRLF line endings takes the proposal, and the file keeps its line endings.
- Tests: `test/skill-eval-compare.test.js` runs the gate against a fake model on loopback. It checks a lesson that makes its case pass (better, exit 0), the reverse (worse, exit 1) and the record. The proposal test now applies to a CRLF checkout. Not run against a live model here.

### Learning from work, part 2: propose a lesson to a Skill's maintainers

- A confirmed lesson in the Learning Inbox can be sent to the maintainers of an organization Skill ("Propose to the Skill maintainers"). The app writes a proposal file containing:
  - the lesson and its evidence;
  - a patch that adds the lesson to the Skill's `SKILL.md` under "## บทเรียนจากการใช้งาน";
  - a regression test case for `evals/skills/<skill>.json`.
- The app never edits an organization Skill. The whole file passes the privacy check before it is saved, and Plan mode cannot create one.
- For maintainers, `node scripts/apply-skill-proposal.mjs <file>` (with `--dry-run`):
  - checks the patch touches only that Skill and still applies;
  - refuses a test case whose prompt is still the TODO placeholder;
  - applies the patch, adds the case and runs the repository validator, without committing.
  - The Pull Request then goes through the usual review and CI, which routes the case's prompt.
- Tests: `test/skill-proposal.test.ts` applies the patch with `git apply` and runs the script on a full checkout, including the validator. `test/learning-smoke.mjs` creates a proposal from the real app and checks the Skill file is unchanged.

### Learning from work, part 1: Learning Inbox, lesson rollback and AI drafts

- A Learning Inbox (`/learn`, the conversation menu or the Command Palette) holds lessons the employee reviews before they are used:
  - Kinds: a preference, or a procedure with trigger words.
  - Every confirmed change is a new revision that can be disabled or restored.
  - Only confirmed lessons go into the context of later tasks, at most five and 8,000 characters each time.
  - Existing proposals from "needs fixing" notes can be brought in for review.
- New: **Have the AI draft lessons from this task.** In a finished task, the connected AI reads the last 30 messages and the draft, masked and without tools. It drafts up to five lessons, each with the quote it rests on and its reason. The rules follow Hermes Agent's reviewer: write steps, never record a failed approach as reliable, never blame a tool for a one-off problem, return nothing rather than guess. Drafts arrive as pending candidates marked "drafted by the AI", and a draft carrying personal data is dropped. The tokens count in Usage, and Plan mode cannot draft.
- [docs/desktop-learning.md](docs/desktop-learning.md) has the details. Tests: `test/learning.test.ts`, `test/learning-draft.test.ts` and `test/learning-smoke.mjs` (real app with a synthetic AI). Not tried with a live account.

### Long tasks: compaction sized to the model, more tool turns, a progress report at the limit

- The conversation was compacted at about 48,000 tokens on every model, although current models take 128,000 to 1,000,000. Older turns were summarized early and lost detail, and each summary cost tokens. The budget is now 60% of the connected model's window, between 48,000 and 160,000:
  - Claude: 120,000.
  - GPT-5 / Codex and Gemini: 160,000.
  - DeepSeek and Qwen: 76,800.
  - MiniMax: 120,000.
  - A local or custom model of unknown size, or a custom runtime, keeps 48,000.
- One message could make only 8 tool turns. A long web task (open, read, click, read again…) stopped with "เครื่องมือทำงานครบจำนวนรอบ" partway. It now allows 40.
- At the limit, the AI no longer stops with an error. It gets one last turn without tools to say what is done and what remains, and the employee replies "ต่อ" to continue. The same happens early when the AI asks for the same tools three turns in a row, so a stuck task does not spend 40 turns.
- Compaction still runs before every AI call, tool turns included. Task state, the current request and organization rules are never shortened. [docs/desktop-context-memory.md](docs/desktop-context-memory.md) lists the budgets.
- Unit tests cover the budgets, a 70,000-token conversation (sent whole to Claude, compacted for an unknown model), the progress report at the limit and the stop on repeats. Not tried on a live account; the window sizes come from the providers' published limits.

### Work in progress survives switching pages

- Switching from "ตรวจใบเสร็จ AFP" to chat, the Skill hub or Settings closed the page. A reading in progress was thrown away, along with the fields already filled and ticked. The page now stays open in the background once it has been opened, and is only hidden. While it reads, a spinner replaces the "ทดลอง" badge in the sidebar.
- The same check across the rest of the app found two more:
  - A file opened in the Files tab with unsaved edits, a typed advanced command and the folder being browsed were lost when leaving chat or hiding the panel. The panel now stays mounted once shown, and is only hidden. A web page in the Web tab is hidden with it.
  - Leaving Settings while an AI connection was being set up or tested lost its "กำลังเชื่อมต่อ…" state, and the connect button was offered again. Settings now stays mounted, hidden, until that finishes. Profile fields typed in Settings but never saved are still discarded on leaving, as before.
- Draft edits that are not yet saved and text typed in the composer already survived page switches. They are now covered by a test.
- Tests:
  - `test/gemini-api-smoke.mjs` switches to the Skill hub while a slow receipt reading runs, then checks the result, and checks that a ticked field survives Settings.
  - The same test leaves Settings during a slow Gemini connection test and reopens it.
  - The new `test/view-switch-smoke.mjs` covers the draft, the composer and an unsaved file across pages and a hidden panel.
  - The receipt and Settings tests fail on the previous code.

### Web agent: finds tiles on menus that load late, and asks only at the final step in auto mode

- On a coffee menu (seleniumbase.io/coffee) the agent could not find the cups, so the employee had to click them. Three gaps caused this, and all three are fixed:
  - The page was read as soon as it loaded, but the menu arrives from the network afterwards. A read now waits until the page's requests finish and the page stops changing, about 6 seconds at most.
  - A site that handles every click with one listener on the whole page gives the cups no listener of their own.
  - A pointer that appears only on hover (`.cup:hover{cursor:pointer}`) was invisible to the agent. It now reads such rules from the page's style sheets.
- In Full auto (auto mode, when the organization allows `features.autoMode`), the web agent opens sites, clicks and fills fields without asking. It asks only before a final step: a form's submit button, or a control named for sending, paying, ordering, confirming, booking, registering, deleting, transferring, approving, signing, publishing or saving, in Thai or English. In ask mode every open, click and fill still asks, as before. The final-step check reads the button's type and name, so a button with an unusual name that does send something can slip through. [docs/desktop-browser-agent.md](docs/desktop-browser-agent.md) says so.
- `test/browser-agent-smoke.mjs` adds a menu that loads late, with one listener for the whole page and a hover-only pointer. It adds two Americanos, opens checkout and types a name with no approval, then checks that Submit asks. Not tried against seleniumbase.io itself, which this build environment cannot reach.

### Tables, clean Excel and the Thai official layout

- A Markdown table from the model now becomes a real table in the draft, and it can be edited in place. It stays a table in every export: Word (a table with a repeated header row), PDF, Markdown, Excel and PowerPoint. Tables are capped at 500 rows by 30 columns and have no merged cells. Before, tables were flattened into "a · b" lines, and Excel kept the `---` row and the Markdown marks.
- Word and PDF follow the Thai official layout (หนังสือราชการ): TH Sarabun New 16 pt on A4, margins left 3 cm, right 2 cm, top 2.5 cm, bottom 2 cm. Before, they used Leelawadee UI 12 pt with 1.5 cm margins. Word substitutes another font when TH Sarabun New is not installed. The PDF then uses Sarabun, Leelawadee UI or Thonburi, scaled to the same visual size, with their real bold.
- Excel puts each table on its own sheet ("ตาราง 1", "ตาราง 2" …) with a bold header, borders, a filter and a frozen header row. Plain numbers such as `1,500` become numbers, while codes with a leading zero such as `007` and text starting with `=` stay text. The rest of the draft goes on a sheet of clean text. For Google Sheets, upload the file to Google Drive and open it with Google Sheets. STeP does not fill Google Sheets through the browser, because its cells are drawn on a canvas, not form fields.
- A page-by-page check then rendered four synthetic drafts (an official memo, an 8-column table, a 70-row table and awkward cells) to every format and found and fixed:
  - Word lines overlapped. A fixed 12 pt line height was set under 16 pt text; Word now uses single spacing.
  - Word table columns were all the same width. Word and PDF now share one column layout: each column gets room for its longest header word and its figures, and the rest goes to the longer text. A table whose header words still do not fit drops from 16 to 14 or 12 pt.
  - Columns of figures (amounts, percentages) are right-aligned in Word, PDF and PowerPoint.
  - The PDF did not repeat the header row on later pages. It now does, as Word already did.
  - Excel showed `650.50` as `650.5`, and `1,500` would have shown as `1,500.`. Figures now keep their separators and decimal places, and percentages such as `25%` become numbers formatted as percentages.
  - PowerPoint put a heading that sits right above a table alone on its own slide. It now becomes the title of the table's slide, and the slide's columns use the same widths as Word.
- `npm run qa:exports` (`desktop/scripts/export-qa.mjs`) repeats that check: it renders the drafts in `desktop/test/fixtures/export-cases.ts` to PNG pages in `desktop/release/qa/export-visual/img/`. The check here used LibreOffice in place of Office, with Laksaman standing in for TH Sarabun New. The files were not opened in Word, Excel or Google Sheets. Unit tests cover the Word XML, Excel cells and formats, slide tables and PDF HTML. The Electron smoke test edits a table in the editor, saves it and exports it.

### Qwen and MiniMax with the employee's own key

- Staff use several AI services, so the connection page gains two well-known services next to DeepSeek, Groq and the others. Each is fixed to its official OpenAI-compatible endpoint and used with the employee's own key:
  - **Qwen (Alibaba Cloud)**: Alibaba Cloud Model Studio international (Singapore), `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, default model `qwen-plus`.
  - **MiniMax**: international platform, `https://api.minimax.io/v1`, default model `MiniMax-M2`.
- Keys from the China regions (Alibaba Beijing, minimaxi.com) do not work with these presets, and the README says so. The existing preset checks cover both: a fixed destination, policy `providerPresets`, and no proxy. When a service does not list its models, the default model is used.
- Neither was tried with a live account. The endpoints come from the providers' documentation, not from a live call.

### Your plan through Claude Code: off by default, on for the pilot

- Anthropic was asked how its Claude Code terms apply. Its reply restated the terms and pointed to sales, but did not confirm this design. The in-app connection on the employee's own Claude plan is therefore off by default again (`features.claudeSubscription: false`), after 0.5.9 had turned it on. Pilot machines turn it on with `scripts/pilot/enable-claude-code.ps1` (Windows, run as Administrator) or `scripts/pilot/enable-claude-code.sh` (macOS, sudo). These scripts set it in the administrator-owned managed policy, give the folder and file the ownership and permissions STeP Desktop requires, and turn it off with `-Off` / `--off`. The Windows script keeps other policy settings, while the macOS one refuses to overwrite a policy that has other settings. The macOS script was dry-run in a temporary folder. The Windows one was not run here.
- Anthropic's terms do not allow its names as our feature's own name, so the connection is now called "แพ็กเกจของคุณผ่าน Claude Code" ("Your plan through Claude Code"), not "Claude Pro / Max". The handoff option that opens Claude Code is unchanged.
- [docs/claude-subscription.md](docs/claude-subscription.md) records Anthropic's reply point by point, plus the pilot steps. `test/electron-smoke.mjs` again expects the feature off unless `STEP_CLAUDE_SUBSCRIPTION=1`.

### Open source under the MIT License

- The whole repository is now MIT-licensed, as the project's maintainers at STeP decided: the harness, STeP Desktop and the STeP Skills plugin. It was `UNLICENSED` except for the plugin. `LICENSE` is at the repository root, and `package.json` and `desktop/package.json` say `"license": "MIT"`. Third-party fonts and cmaps in `src/vendor/privacy/` keep their own licences, and the README says so.

### Claude Pro / Max in the app, on by default

- The in-app Claude Pro/Max connection is now on by default, as a policy feature: `features.claudeSubscription`, which a managed policy can turn off. It used to be an off-by-default `STEP_CLAUDE_SUBSCRIPTION=1` switch. `STEP_CLAUDE_SUBSCRIPTION=0/1` still forces it in development. It runs the official, unmodified Claude Code, and each employee signs in to their own Claude account through Anthropic's page, so usage counts against their own plan. STeP never reads or stores the password or token. Claude Code's legal terms (checked 2026-10-04) allow a product to run Claude Code this way when the organization accepts Anthropic's Commercial Terms and does not intermediate usage. The project's maintainers at STeP decided to enable it for STeP staff. [docs/claude-subscription.md](docs/claude-subscription.md) records the conditions. It also leaves one point open: the connection still starts a claude.ai sign-in and accepts only that, which may count as restricting a sign-in method.
- The connection note now says this in the app: sign in on Anthropic's page, usage counts against your own plan, and STeP never sees your password or token.
- `test/electron-smoke.mjs` now expects the feature to be on unless `STEP_CLAUDE_SUBSCRIPTION=0`.

### Apps set up before 0.5.8 share their profile too

- STeP Desktop wrote `~/.step-ai/profile.json` only when the profile was saved, so someone who updated without opening settings had none, and Setup-STeP-Skills could not offer their nickname and team. At start, an app that has finished its first-run setup now writes the file if it does not exist. An existing file is left alone, because it may be newer, from Setup. `test/shared-profile-smoke.mjs` covers both cases.

### Uninstalling

- **STeP Desktop (Windows) asks about your data:** the uninstaller has a page after its welcome page with an unticked box, "ลบประวัติงาน การเชื่อมต่อ AI และการตั้งค่าด้วย · Also remove them". The page text is in Thai and English. Ticking the box removes the app data folder in `%APPDATA%` (tasks, AI connections with their encrypted keys, settings, the OCR runtime) the way electron-builder's `deleteAppDataOnUninstall` would. That setting stays false, so the default keeps everything for a reinstall. Updates run the old uninstaller silently, which shows no page, and `customUnInstall` checks `isUpdated` again, so an update never removes data. Work folders (`output/`) and `~/.step-ai/profile.json` are never touched. `build/installer.nsh` is now UTF-8 with BOM, so NSIS reads the Thai text as Unicode. The page code sits inside `customUnWelcomePage` because this file is included before MUI2 and the NSIS plugins are loaded. electron-builder's Linux `makensis` compiled the uninstaller script. Building the full installer needs Windows or wine, which are not available here, so the page was not clicked through. macOS has no uninstaller; the README says where the data folder is.
- **STeP Skills:** `Uninstall-STeP-Skills.bat` / `.command` run `node scripts/install-agent-skills.mjs uninstall [work folder]`. This removes the plugin and marketplace from Claude and Codex through their CLIs. It removes only the managed rules and profile blocks from `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` and `~/.gemini/GEMINI.md`, and deletes a file only if nothing else is left in it. It removes the Antigravity Skills listed in `installed.json`, global or in the given work folder, so the person's own Skills stay. It asks before removing `~/.step-ai/profile.json`, and Enter keeps it. In an empty home folder with Claude Code, Codex 0.158 and a `.gemini` folder, a full setup followed by an uninstall left only the person's own Skill and their original `AGENTS.md`.

### One profile for STeP Desktop and Setup-STeP-Skills

- **Shared profile:** `~/.step-ai/profile.json` holds the profile as `{ version: 1, name, team, assistant, style, tone }`. That is the nickname, team, assistant name and conversation style. `Setup-STeP-Skills` (`scripts/install-agent-skills.mjs`) writes it with the profile answers, and offers it as the defaults next time, so pressing Enter keeps each value. STeP Desktop (`electron/shared-profile.ts`) fills an unfinished first-run wizard from it. Teams are checked against the router's team list. Desktop writes the profile back whenever it is saved. The file is written atomically with mode 0600, and anything unreadable, oversized or of another version is ignored. Development test runs keep their copy in the test home. Desktop does not edit Claude, Codex or Antigravity files; Setup does.
- **Tests:** `test/shared-profile.test.ts` covers the round trip and malformed files, and Setup's tests check the same format. `test/shared-profile-smoke.mjs` (in `npm run test:electron`) opens the real wizard prefilled from a Setup profile, then saves a changed profile in the app and reads it back from the file.

### Gemini via Antigravity: opt the STeP agent out of built-in tools

- The latest Antigravity CLI is 1.2.17. Since 1.2.1, a custom agent can declare `excludeDefaultComponents: true` to drop the built-in tools and prompt sections. The adapter had relied on `tools: [finish]` alone, which did not narrow the `init` catalog on 1.2.14. `step-draft` now declares both.
- The `init` check is unchanged. The message is still withheld unless the runtime declares only `finish`, so nothing is sent if the option does not take effect. The Linux 1.2.17 binary (SHA-512 verified) accepts the agent, but `init` needs a signed-in Google account, so the effect could not be observed here. See [the adapter notes](docs/antigravity-adapter.md) for how to accept it on a signed-in machine.

### STeP Skills for Claude, Codex and Antigravity (harness, not part of the desktop app)

- **One-command install:** this repository is now a Claude plugin marketplace (`.claude-plugin/marketplace.json`). In Claude Code, `/plugin marketplace add iisara555/STeP-AI-Harness` then `/plugin install step@step-ai` installs all 51 STeP Skills as `/step:<name>`. No STeP Desktop and no `step-ai install` are needed.
- **Rules in every session:** a SessionStart hook adds a short brief to the start of every session, with the rules on human approval, personal data, secrets, writing and output folders. Its full rules files ship with the plugin.
- **Built, not copied by hand:** `scripts/build-claude-plugin.mjs` builds `plugins/step/` from `skills/`, `rules/`, `docs/` and `manifest/`. It flattens Skills to the `skills/<name>/` layout Claude Code scans, rewrites every Markdown link and bare repository path relative to the copied file, and copies what they point at. The sources stay where they are, so the CLI, STeP Desktop and the router are unchanged.
- **No Gemini CLI:** an earlier build of this branch also made the folder a Gemini CLI extension. It was removed, because Google stopped serving Gemini CLI to personal accounts and Google AI Pro/Ultra on 18 June 2026. People with a Google account use Antigravity instead.
- **Codex:** Codex 0.158 reads the same `.claude-plugin/marketplace.json` and plugin manifest. `codex plugin marketplace add iisara555/STeP-AI-Harness` then `codex plugin add step@step-ai` installs the 51 Skills as `step:<name>`. Codex does not run plugin hooks (`plugin_hooks` is removed), so `node scripts/install-agent-skills.mjs codex` writes the STeP brief into `~/.codex/AGENTS.md` between markers; running it again replaces only that block. Against a local recording model endpoint, a Codex session sent the model all STeP Skills and the brief.
- **Google Antigravity:** `node scripts/install-agent-skills.mjs antigravity <folder>` writes three things into a work folder. The Skills go to `.agents/skills/`. The short brief goes to `.agents/rules/step.md`, which is always applied. The full rules, documents and manifest go to `.agents/step/`, so they do not become always-on rules, and the links in the copies are rewritten to point there. Re-running updates in place and leaves the employee's own Skills alone. This was not tried in Antigravity itself, which is not available here.
- **Antigravity for every workspace:** `node scripts/install-agent-skills.mjs antigravity` with no folder now installs globally. The Skills go to `~/.gemini/config/skills/` (Antigravity's global Skills folder), and the full files to `~/.gemini/config/step/`. The short brief goes between markers in `~/.gemini/GEMINI.md`, Antigravity's global rules file, and its rule paths are written as `~/...` so the file carries no user name. Re-running replaces only what the script wrote, and the user's own text and Skills are kept. Adding a folder still installs into that one workspace. The global paths come from public reports about Antigravity 2.0, not from a run of Antigravity itself.
- **Profile, in place of USER.md:** `node scripts/install-agent-skills.mjs profile` asks four questions: nickname, team (from `manifest/teams.yaml`), assistant name and conversation style. Every answer can be skipped. The answers go into a "ข้อมูลผู้ใช้ STeP" block between its own markers. It is written to the global instructions file of each tool found on the computer: `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` (or `$CODEX_HOME`) and `~/.gemini/GEMINI.md`. Flags (`--name= --team= --assistant= --style=`) skip the questions. The team sets the output folder (`output/CC/...`, else `SHARED`). Re-running replaces the block and keeps everything else. Long digit runs (ID or phone numbers), line breaks and markup are refused or removed. The session brief now says to use that block, or a workspace's legacy `USER.md` first. A live Claude session greeted the user by nickname, used the assistant name and named `output/CC/` as the save folder.
- **One double-click for everything:** `Setup-STeP-Skills.bat` (Windows) and `Setup-STeP-Skills.command` (macOS) at the repository root run `node scripts/install-agent-skills.mjs setup`. Claude and Codex get the plugin through their own CLIs when those are on PATH. Codex also gets its rules, Antigravity gets the global install when `~/.gemini` exists, and then the profile questions are asked. A tool that is missing is skipped, and the summary says what to do instead. A wrong answer, such as an unknown team or a phone number, asks again. Without Node.js the launcher opens nodejs.org. Running it again updates everything. In an empty home folder with Claude Code, Codex 0.158 and a `.gemini` folder, one run installed 51 Skills in each tool and wrote the profile and rules blocks.
- **Legacy launchers hand over to the new setup:** an employee downloaded the ZIP from GitHub and double-clicked `Install-STeP-AI.bat` instead of `Setup-STeP-Skills.bat`. When `Setup-STeP-Skills` sits next to them, as in a GitHub download, `Install-STeP-AI` and `Update-STeP-AI` (`.bat` and `.command`) now say the folder workflow is retired and run Setup instead. The Pilot bundle (`scripts/build_pilot_bundle.py`) does not include Setup, so Pilot testers' launchers work as before. A first attempt used `export-ignore` in `.gitattributes` to leave the legacy kit out of the download. It was reverted, because the plugin directory refuses a repository whose archive differs from the checkout. A test now keeps `export-ignore` and `export-subst` out of the repository and runs the hand-over in bash.
- **Ready for the plugin directory:** the plugin is now MIT-licensed, with `plugins/step/LICENSE` from `plugin/LICENSE` and `"license": "MIT"` in `plugin.json`. Only the plugin is relicensed; the rest of the repository keeps its own terms. The plugin also gets a listing icon at `.claude-plugin/icon.png`, which is the STeP Desktop app icon (1024 px square PNG). The author and marketplace owner now give the full name "Science and Technology Park, Chiang Mai University (STeP)". The directory's checks had warned about the missing icon, and about a name that may be confused with an existing listing.
- **README:** the README now offers two ways only: STeP Desktop, or the STeP Skills in Claude, Codex or Antigravity (new section 13). The connection section is updated. Gemini sign-in with a personal Google account no longer works, so it points to a Gemini API key, an organization account or Antigravity, and it adds OpenRouter and the other preset services. The ZIP + `step-ai` CLI, Gemini CLI and the LINE gateway are listed as no longer offered to employees. Their code stays, because STeP Desktop shares the router and Skills in `src/`.
- **Checks:** `test/claude-plugin.test.js` (in `npm test`) also checks both installers (links intact, re-runnable, other files kept). It also fails if Gemini extension files come back, and when `plugins/step/` is out of date with its sources, when a Skill is missing or duplicated, or when a relative link in the plugin does not resolve inside it. `claude plugin validate` passes for the plugin and the marketplace. A local install lists 51 Skills and the hook. A live session received the rules and picked `/step:meeting-summary` for a meeting summary.

### The browser agent can click tiles that only a script makes clickable

- **The problem:** on sites built with Vue, Svelte or plain `addEventListener` (for example the coffee menu at seleniumbase.io/coffee), a drink is a `<div>` with a click listener. It has no button, link, role or `onclick` attribute, and its pointer cursor shows only on hover. The page snapshot found clickable elements from markup and the resting cursor, so it never offered the cups. The AI could only see **Total: $0.00** and told the employee to click by hand.
- **The fix:** before each snapshot, the main process asks the DevTools protocol's DOM domain which elements have click, mouse or pointer listeners. This needs no JavaScript in the page; listeners live in the page's own world, which the isolated snapshot cannot see. Those elements get a random attribute that the snapshot reads and removes at once. A framework root that listens for every click is not offered, because a container of real controls is not a target, and only the outermost of nested targets counts. If the protocol is unavailable (DevTools already open on that page), the snapshot works as before.
- **Better names for tiles:** a tile's label comes from its inner `aria-label` or image alt text before its raw text, so the AI sees "Americano" rather than "espresso water". A new `context` field gives the heading of the card or list item, such as "Americano $7.00". The browser rules tell the AI to match by label or context, click once per snapshot when adding several items, and read again before saying something cannot be clicked.
- The browser-agent smoke now has a page built like the coffee menu. Both cups are found with their names and prices, the root is not offered, and two clicks on Americano make the total $14.00. It also checks that no marker attribute remains on the page.

### A gooey waiting motion

- While the AI works, the activity line now shows ink-like drops instead of the turning spinner. A head pulls up out of a body on a neck, two drops leave to the left, and all of them melt back in on a 3.2-second loop.
- It is drawn in SVG: the shapes are blurred, then a colour matrix sharpens the blur's alpha into one edge. No image or library is needed. It takes the text colour, so it fits the light and dark themes.
- When the system asks for reduced motion (Windows animations off), it keeps moving at half speed, as the spinner did, so a wait never looks frozen.

### Sidebar checked end to end

- **New smoke test:** `test/sidebar-smoke.mjs` uses every sidebar control in the real app against a local fake AI:
  - new task (a blank page, nothing saved until the first message)
  - opening tasks, Thai full-text search and the "no results" message
  - the command-palette button and the **มีผลงาน** filter
  - pin and unpin, rename, and delete (cancel and confirm, including the open task)
  - the Skill hub, the receipt check and settings
  - the profile line, and hiding and showing the sidebar
- **Search no longer flashes "ไม่พบงาน":** while the full-text search is still answering, the list filters by title and loaded text instead of going empty on every keystroke.
- **Renaming keeps what you typed:** clicking away from the name box now saves the new name, as in other chat apps. Before, it threw the edit away. Escape still cancels.

### Chat answers that look like Claude, ChatGPT and Cursor

- **Full Markdown in answers:** answers now render GitHub-flavoured Markdown (react-markdown with remark-gfm). This covers headings at every level, nested and task lists, tables, quotes, `inline code`, strikethrough, horizontal rules and links. Before, inline code, quotes and links showed as plain text.
- **Code blocks with colours:** fenced code is highlighted for common languages (Python, JavaScript/TypeScript, JSON, Bash, SQL, HTML/XML, CSS, YAML, Markdown) in light and dark themes, with a copy button.
- **Calmer conversation:** no name label above every turn. Your message is a right-aligned bubble and the answer is plain text on the page, with larger type and spacing. Copy and feedback buttons stay on the newest answer and appear on hover for older ones.
- **While the AI works:** a blinking caret follows the streamed text, and a single line shows what is happening and the elapsed time. The "app is still working" line now appears only when the app stops reporting.
- **Safety unchanged:** raw HTML in an answer is dropped, never rendered. `javascript:` and other non-web links are not clickable, and web links open in the app's browser panel. Images in answers are not loaded; a link is shown instead. `step-tool` requests stay hidden, including while they stream.

### More AI services, and a simpler connection page

- **Pick a service from tiles:** the AI connection page (Settings and the setup wizard) now lists each service as a tile with how it connects (sign in, API key, or on this computer) and one line about it. The chosen tile opens a card with the key field, a link to where the service issues keys, an optional model and who pays, with the connect button inside it. The old sticky button that covered the text below it is gone; choosing a tile scrolls its card into view. The setup wizard shows the main services first, with the rest behind **ดูบริการอื่น**.
- **New services:** OpenRouter, Claude API, OpenAI API, DeepSeek, Groq, Mistral, xAI Grok and Ollama (local) join ChatGPT and Gemini. Each new service is fixed to its official endpoint and uses the employee's own key, stored encrypted like other keys. These services draft text only; images and web search are not supported yet.
- **Sign in with OpenRouter:** OpenRouter can issue a key for the app through its own sign-in page (OAuth PKCE with a one-time loopback callback on this computer), so nobody copies a key by hand; pasting an existing key also works.
- **Models from the service:** API-compatible connections now load the service's model list (`GET /models`) after connecting. When no model was typed, the service's recommended model is used.
- **Tidier connection rows:** a connection shows its own name (OpenRouter, Groq, ...). A working connection offers **ทดสอบอีกครั้ง** as a quiet button. Runtime and sign-out buttons appear only where they apply.
- **Policy:** new feature `providerPresets` (default on) allows the services above. Set it to false to offer only ChatGPT, Claude, Gemini and administrator-approved endpoints. A free-form endpoint still needs `compatibleProviders` and an approved profile, and preset endpoints are refused while `network.proxyUrl` is set.
- Tests: unit tests for the presets, endpoint checks, model lists and OpenRouter PKCE. A new Electron smoke signs in to a fake OpenRouter and connects Groq with a key; no real service is called. The OpenRouter sign-in has not been tried against the live service yet.

### Update card above the profile, as in Claude and Codex

- **Next to the profile:** when a new version is on its way, a card at the bottom of the task list, above the profile, shows the download with its progress, then **รีสตาร์ทเพื่ออัปเดต** once it is ready (Windows). On a Mac build that cannot install updates itself, it shows **ดาวน์โหลดเวอร์ชัน x.y.z**.
- **One place at a time:** the title-bar button now appears only while the task list is hidden.
- The UX smoke checks the downloading, ready and Mac states of the card and the title-bar fallback.

### Gemini: faster tool turns and fewer failed answers

Found while checking a slow, failed answer to "ผอ.วิน คือใคร" on a Gemini API key.

- **Abbreviations find the documents:** the organization knowledge search spells out Thai title abbreviations (ผอ., รอง ผอ., ผช. ผอ., ผจก., จนท., หน. ทีม) beside the original question. "ผอ.วิน คือใคร" previously matched nothing, so the model had to open documents with tool turns; it now matches the executive board document strongly enough to answer from it directly.
- **One Gemini conversation per run:** every tool turn now continues on one Gemini CLI process and ACP session and sends only the new tool results, as Codex already does. Previously each turn started the CLI again and resent the whole prompt (about 25,000 characters of rules, registries and context) every time. A turn that fails on the open conversation is retried once from a fresh start.
- **Clearer tool format:** the tool rules show an exact `step-tool` example and say it is plain text, not a native function call, for models that stalled on the format.
- **Incomplete answers retry:** a reply that ends early or comes back empty (`invalid chunk`, `missing finish reason`, `MALFORMED_FUNCTION_CALL`) is reported as `PROVIDER_EMPTY_RESPONSE` and retried with the usual backoff, instead of the generic "check the connection and quota".
- Tests: abbreviation and search cases, the new error mapping, and the Gemini API smoke checks that the second tool turn continues the same conversation and carries only the tool results.

### Profile pictures for employees

- **36 hand-drawn profile pictures** (black-ink portraits in the app's illustration style) to choose from in Settings → ทั่วไป → รูปโปรไฟล์. The first option keeps the initial in a circle, as before.
- **The chosen picture shows** at the bottom of the task list, next to the employee's name.
- **Drawings, not photos:** the pictures are illustrations of no one in particular, bundled with the app (`desktop/src/assets/avatars/`, 192 px WebP, about 290 KB in all). Nothing loads from the network or the employee's disk, and settings store only the picture's id; any other value is refused (`INVALID_SETTINGS`).
- Tests: the bundled files match the ids, and the UX smoke chooses a picture, saves it, sees it in the sidebar and checks that a path is refused.

### Updates inside the app, as in Claude, Cursor and Codex

- **No reinstalling:** an installed STeP Desktop checks for a newer version 15 seconds after it opens and every 4 hours, and downloads it in the background. A **รีสตาร์ทเพื่ออัปเดต** button then appears in the title bar. A downloaded update also installs when the app quits. Work and settings stay, because they live in the user's app data.
- **Check now:** STeP menu → ช่วยเหลือ → "ตรวจหาอัปเดต · เวอร์ชัน x.y.z" checks immediately and says whether this is the latest version.
- **Where updates come from:** the `desktop-latest` release of this repository, which always holds only the newest desktop build (`electron-updater`, generic provider over HTTPS, each file checked against the SHA-512 in `latest.yml`). The harness's own pilot releases (`v0.7.x`) are never mistaken for a desktop update.
- **Publishing a version:** bump `desktop/package.json`, then either push the tag `desktop-v<version>`, or run the installer workflow by hand with **publish** ticked (it creates the tag on the commit it built). The installer workflow builds the three installers, publishes the `desktop-v<version>` release, and replaces the files in `desktop-latest`. The two Mac builds' update files merge into one (`desktop/scripts/merge-mac-update-info.mjs`). Runs without a tag only keep workflow artifacts, as before.
- **Mac:** macOS installs an update only when both versions carry the organisation's Developer ID signature (the `CSC_*` and `APPLE_*` secrets). Until then a Mac build learns that a new version exists and shows **ดาวน์โหลดเวอร์ชัน x.y.z**, which opens the release page. Windows updates itself either way.
- **Policy:** feature `autoUpdate` (default on) lets IT turn this off where software is rolled out centrally. Development builds never update themselves.
- **One manual install first:** builds made before this change have no updater. Install a build with it once; later versions arrive by themselves.

### Receipt type and what the claim still needs

- **Document type:** the AI classifies the receipt from the image as a full or abbreviated tax invoice, receipt, cash bill, payment voucher, invoice or quotation, or transfer slip. Without the AI, the printed heading decides. The person can change it.
- **Claim category:** the person picks B, BV, emergency or other (or "not sure"). The checklist follows it.
- **Checklist with its source on every item**, ordered missing → to check → to prepare → notes, with complete items folded into one line:
  - **AFP circulars** (`docs/afp-operational-circulars.md`): the category B approval report within 3 working days after the receipt date, with the due date worked out (5 days for emergency; public holidays not counted, so check the calendar); the 10,000-baht caps; the clearing set (FM-AF-002, FM-AF-014, FM-AF-035/036, approval report); photocopying thermal paper; translating foreign-language documents; no inappropriate drinks; emergency pre-approval. A transfer slip, invoice or quotation is flagged as not a proof of payment for clearing.
  - **General payment-document elements**, marked "confirm with AFP": payee, date, what was paid for, amount in figures and words, payee signature.
  - **No source in the app yet**, marked "ask AFP": the buyer name and address to use, and whether a cash bill is accepted. These are never decided by the AI.
- **The AI reports what it sees** (handwritten, thermal paper, foreign language, payee signature, buyer named, items listed, inappropriate drinks); the checklist itself is fixed rules in `desktop/src/receipt-compliance.ts`, with unit tests.
- **Draft and handoff:** the draft JSON records the type, category and checklist under `compliance`; the AI pre-check handoff includes the open items.

### A receipt page that is quicker to check

- **The receipt stays in view:** the image column stays beside the fields while you scroll. A zoom button (or a click on the image) enlarges it for handwriting.
- **Progress at the top:** "ตรวจแล้ว 2/5 ช่อง" with a progress bar and counts of fields where OCR and AI agree, differ, or only one read it. The AI buttons (read the image again, filter the OCR) sit there too.
- **Fields show their state:** a red edge where the readings differ, a yellow fill once ticked. "ตรวจแล้ว" is a pill button.
- **Enter to check:** pressing Enter in a filled field ticks it and moves to the next field.
- **The next step stays reachable:** save, new receipt and "ให้ AI pre-check ต่อ" stay at the bottom of the window, with the checked count beside them.
- **Less jargon:** mapping methods, OCR line types and verdict codes (NEEDS-DOCUMENT-FIX) are kept in the JSON draft but no longer shown. The Tesseract and handwriting add-ons fold into one "ส่วนเสริม OCR" line.

### Receipts read twice: on-device OCR and an AI reading of the image

- **Two readings, compared field by field:** after the local OCR reads a receipt, the connected AI reads the image on its own (the seller, receipt number, date, tax ID and amounts). Each field shows whether the two agree:
  - **Agree:** "OCR และ AI อ่านตรงกัน".
  - **Differ:** the AI's reading is shown beside the OCR value with a **ใช้ค่านี้** button. The OCR value is kept until the person chooses.
  - **Only the AI read it:** the empty field takes the AI's value, unconfirmed and marked for checking against the image.
- **The person still confirms:** nothing is ticked as checked for them; every field still needs "ตรวจแล้ว", and the AI's reading never approves anything.
- **No OCR installed yet:** the page can read a receipt with the AI alone (one reading). Installing the OCR adds the second reading.
- **Rule checks that need no AI**, flagged as advisories beside the existing amounts-add-up rule:
  - the seller's 13-digit tax ID fails its check digit;
  - the seller's tax ID looks like the buyer's: it equals the buyer ID the receipt names, or it is a government-body ID (0994…, such as a university's). Shops sometimes write the customer's ID in their own box, as on a real handwritten cash bill tested for this release;
  - VAT is not 7% of the amount before VAT;
  - the total written in Thai words (แปดร้อยแปดบาทถ้วน) does not match the total in figures.
- **Cash bills:** the OCR treats a นามลูกค้า box as the buyer's section, so a tax ID written there is not taken as the seller's. The AI writes a book and receipt number together ("เล่ม 001 เลขที่ 005").
- **Consent and policy:** the first image sent asks once. The draft JSON records the AI's reading and the per-field match under `vision_check`. Policy feature `receiptVision` (default on, and only with `vision` on) turns it off; with `checks.privacy` on, no receipt image is sent and only the earlier candidate-only AI filter remains.
- **Shared rules and tests:** `desktop/src/receipt-vision.ts` holds the prompt, parsing and comparison, with unit tests. The Gemini API smoke reads a receipt image end to end against a fake Gemini API.

### The app's own title bar, as in Codex and Cursor

- **No Windows menu bar:** the File / Edit / View / Window menu bar is gone. The window has the app's own title bar instead.
  - Left: the **STeP** menu, which groups the commands under งาน, มุมมอง, เครื่องมือ and ช่วยเหลือ, with each command's shortcut and a one-row theme picker. Next to it is a task-list toggle.
  - Middle: a command bar showing the current task. It opens the command palette (Ctrl+K).
  - Right: a side-panel toggle.
  - The bar drags the window.
- **Window buttons:** Windows and Linux keep their minimise, maximise and close buttons, drawn over the bar in the app's colours. They follow light, dark and system themes. macOS keeps its traffic lights in the bar and its standard menu at the top of the screen.
- **Shortcuts:** edit shortcuts still work in text fields. Zoom (Ctrl/⌘ with =, - and 0) moved from the menu bar to the app and the STeP menu.
- **Duplicate buttons removed:** the duplicate task-list buttons in the sidebar and top bar are gone.

### Faster tool runs, clickable cards, questions above the composer

- **Faster runs on an OpenAI (Codex) account:**
  - Every tool turn of a run now continues on one `codex app-server` process and thread, sending only the new tool results (`ProviderSession`).
  - **Before:** each turn started a new process and thread, and resent the whole prompt with every earlier result.
  - The thread is closed when the run step ends. A changed or compacted prompt starts a fresh thread.
  - Usage is counted per turn from the thread total.
  - **Fallback:** if a turn on the open thread fails (the runtime dropped the thread or refused a second turn), the same turn is retried once on a fresh thread with the whole prompt. Keeping the thread is therefore never worse than not keeping it.
- **The assistant's browser sees clickable cards:** product cards and tiles that a page makes clickable with its own script are now click targets, alongside buttons and links.
  - These are elements with a pointer cursor; for nested ones only the outermost counts.
  - ARIA roles such as menuitem, tab and option are targets too.
  - Pages are laid out at 1280×900 before the Web tab reports where to draw them. At 0×0, every block was zero wide and looked invisible, so the coffee cards in the report could not be clicked.
- **A tool request in an unclosed fence runs:** a `step-tool` fence opened mid-sentence and never closed now runs. Before, it showed in the answer as raw JSON.
- **Questions and the plan sit above the composer**, under the newest message, instead of between older messages.
  - The question card answers with one click on an option, or its number key.
  - It takes another answer as free text.
  - It shows "ผู้ช่วยถาม" in the accent colour.
- **Plain status lines:** the status line names what a tool is doing ("รอคำตอบจากคุณ", "กำลังทำงานบนเว็บ") instead of the tool's ID.

### Native workflows: plan, execute, requirements, diagnose

- **Built into the harness:** the composer's mode picker now offers four ways of working under **ขั้นตอนทำงาน**, as Claude Code's plan mode is built in rather than loaded as a Skill:
  - วางแผนก่อนลงมือ (plan)
  - ลงมือทำตามแผน (execute)
  - เขียนเอกสารความต้องการ (requirements)
  - วิเคราะห์ปัญหา (diagnose)
- **Plan:** the assistant clarifies with up to 5 questions and breaks the work into tasks with checkpoints. The employee must approve the plan, in pilot mode too.
- **Execute:** works through the plan task by task with the new `plan_update` tool, and leaves approvals, signatures and submissions to people.
- **Plan card:** shows progress in the chat and has a "ลงมือทำตามแผน" button. Details: [Native workflows](docs/desktop-workflows.md).
- **Requirements:** interviews, then writes testable requirements.
- **Diagnose:** ranks hypotheses, tests them and names a root cause only with evidence.

### Security fixes from the audit, and live text while working

- **Reading a website asks once per site per task:** `web_fetch` reads a site only after the employee allows it, in every mode.
  - **Before:** a page or PDF with hidden instructions could make the AI read workspace files and send them to any address in a URL. No dialog appeared, because `web_fetch` counted as read-only and privacy checks were off.
- **Credentials are always masked:** passwords, tokens, API keys and signed URL parameters are masked even with privacy checks off. This covers messages, attachments, file reads and URLs.
  - A credential that cannot be fully masked is withheld.
  - A URL that carries one is never fetched.
- **The assistant's browser opens public sites only:** localhost, private IPs and names that resolve to them are blocked, both for pages it opens and for anything those pages load.
  - Intranet hosts can be listed in policy `network.privateHosts`.
- **"Send to chat" in the Web tab:** reads the page in an isolated world, so the page cannot fake the text, and gives up after 10 seconds.
- **Live text while working:** in chat, the text from every turn stays on screen while the assistant works, as in Claude, ChatGPT and Cursor. Before, each tool step cleared it.
  - Tool requests (`step-tool` fences and JSON) are hidden from the live text.
  - The AI's thinking shows open until the answer starts.
  - The status line sits under the text.

### Browser inside the main window

- Web pages now open in the **Web tab of the right panel** instead of a pop-up window, as in Claude and Codex. This covers pages the assistant opens with `browser_control` (MIS included) and pages the employee opens.
  - The tab strip marks the assistant's pages with an icon.
  - Back, forward, reload and close are in the bar.
  - A page the employee opens can be sent to the chat or handed to the assistant.
  - When the assistant opens a page, the panel switches to the Web tab.
- Each page is a sandboxed `WebContentsView` with its own session (`electron/browser-dock.ts`), drawn over the space the window reserves for it.
  - A dialog, notification, menu or tour card that overlaps that space hides the page and shows a still picture of it, so the page never covers an approval.
  - A dialog beside the panel leaves the page live, so it can be checked before approving.
- **Sign-in loop fixed:** after the employee signed in to MIS and said "เข้าสู่ระบบแล้ว", the assistant opened a new tab with no sign-in and asked to sign in again. The AI keeps no tab IDs between messages, so:
  - opening a site the task already has open now returns that tab with its sign-in, without asking again (`reused: true`);
  - all tabs of a task share one session.
- The "browser use failed" report on Windows (`INVALID_CONTEXT_PATH` when loading the `browser-form-assistant` Skill) is the path fix below.

### Scanned PDFs, opening documents on Windows, and the knowledge registry

- **Scanned PDFs:** a PDF with no text layer, or with some pages that are only pictures, now goes to the AI as page images when privacy checks are off (the default). Before, it was refused with "ไฟล์นี้ไม่มีตัวอักษรให้อ่าน" unless the local OCR component was installed.
  - pdf.js draws up to 20 pages in a hidden, sandboxed window that can load only pdf.js itself.
  - The chip reads "PDF สแกน · ส่งเป็นภาพ N หน้าให้ AI อ่าน". A longer scan asks to split the file.
  - The connected model must read images.
- **Opening documents and Skills on Windows:** fixed. The installer puts the app under a folder named `STeP Desktop`, the same name the sensitive-path patterns use for the app's own data folder. As a result, every `reference` and `skill` read failed: the AI saw only excerpts and reported that "the full document could not be opened". Those patterns now check only the part of the path inside the harness.
- **STeP knowledge registry:** scanned from the registered document files, like the Skill registry. The AI sees every readable document with:
  - its ID, title and owner;
  - its first line of purpose;
  - its section headings.
  When the matched excerpts do not hold the answer, the AI opens the right document, or one section of it, with `reference(input=ID, args.section=heading)`. It no longer reports the information as missing. `reference` also accepts a document's path or title.
- **Five more registered documents:** the administrator confirmed them as published for every employee (`sensitivity: public`):
  - `step-teams-directory` (`docs/teams.md`)
  - `step-public-profile`
  - `project-code-scheme` (the owner of the table is still unconfirmed)
  - `step-context`
  - `step-ai-employee-guide` (`docs/employee-guide.md`)

  The HR Service Channels title now says "ติดต่อฝ่ายบุคคล", so HR contact questions still find it first.

### Desktop permission modes and answer feedback

- Closer to opencode and Claude Code:
  - **One everyday mode:** Chat is the everyday mode. The work-mode picker offers Chat and Image only. Chat answers can be opened in Output, and the AI can stage file changes. The separate drafting mode stays for tasks already in it and for multi-worker drafting.
  - **Web search:** with tools, the AI decides when to search the web. It calls `web_search` for public facts that change over time, and the results still appear as source links under the answer. The app no longer searches ahead or shows "Web Search อัตโนมัติ" while typing. The host search remains only for runs without tools.
  - **Full auto:** offered by default (`features.autoMode: true`, `auto` in the default modes). The default mode is still "ask before edits". In Full auto, terminal commands still ask unless the administrator turns on `shellByAi`.
- Work like a general AI harness (Claude Code, opencode), keeping STeP's knowledge and Skills:
  - **Skill registry:** the AI sees a registry of STeP Skills, one line each with name and description. It loads only the Skill a request needs with the `skill` tool, instead of the app choosing a Skill or reading them all. The status line names the Skill or document being read.
  - **Images:** images go to vision models by default (`features.vision: true`). With privacy checks off, an image is sent as it is, with no local OCR service needed.
  - **No dialogs at send:** with privacy checks off, the only question when sending is the one-time usage terms. Images, pasted sources and multi-worker runs no longer ask.
- Ask each employee to tick the **usage terms** once, instead of the app checking for them.
  - The terms appear on the last setup step. If setup was skipped, they appear at the first send, where the button reads "รับทราบและส่ง".
  - Starting or sending stays disabled until the box is ticked.
  - The terms cover:
    - data going to the AI provider unscanned;
    - not sending passwords, keys, ID or account numbers, health or salary data, or other people's personal data;
    - approvals and signing staying with people;
    - checking answers before use;
    - history staying on the computer.
  - The accepted version is saved. Changing `TERMS_VERSION` asks everyone again, so people who accepted the earlier text, which promised masking, see the new terms once.
- Turn off the organization checks by default (`checks: { "authority": false, "privacy": false }`).
  - **Authority:** requests about approving, signing on someone's behalf, issuing document numbers or submitting are answered as help instead of blocked. The AI cannot perform these acts.
  - **Privacy:** nothing is scanned or masked, and there is no dialog before data goes to the AI or a web service. This covers text, attachments, memories, tool results and web queries. National ID numbers, names, phone numbers, passwords and API keys are sent as typed.
  - Side-effect tools (file writes, commands, browser actions, MCP) still ask each time.
  - Administrators can turn either check back on in the policy file. See [organization checks](docs/desktop-policy.md#organization-checks-checks).
- Turn off the local Router's Skill selection in STeP Desktop by default (`features.autoRouting: false`).
  - Every message goes straight to the AI with the matching organization documents.
  - The app no longer asks "งานนี้ตรงกับข้อนี้ไหม" and never picks a Skill or Playbook by itself. Employees pick a Skill with `/` when they want one.
  - Authority checks (approving, signing on someone's behalf, issuing document numbers), Skill scope rules and the privacy gate still run on every message.
  - Administrators can turn automatic routing back on. The CLI is unchanged.
- Register the executive board as an organization document (`step-executive-board`, `docs/step-executive-board.md`). It is built from the maintainer-confirmed `executiveOversight` in `manifest/organization.yaml` (checked 2026-09-20). "ผู้อำนวยการ STeP ชื่ออะไร", "ผอ.คือใคร", "รองผู้อำนวยการมีใครบ้าง" and "ทีม HD อยู่ภายใต้การกำกับของใคร" are now answered from it instead of a web search, which had returned a former director. A test keeps the document in step with `organization.yaml`.
- Stop the clarifying question from looping. Answering "ไม่ตรง" to "งานนี้ตรงกับข้อนี้ไหมครับ?" asked the same question again. A declined menu is never offered again. In chat, once the employee has answered a clarifying question without picking an option, the assistant helps from the conversation. Approving, submitting or signing still asks.
- Remove the routing notice under the text box while typing ("ต้องตอบคำถามแยกประเภทงานก่อน · ต้องตรวจ: …"). It looked like an error before anything was sent. The send itself still asks when it must. Only organizations that set prices see the cost estimate there.
- Fix answers that showed a raw tool request (`{"tool": "reference", ...}`) instead of the answer. Some models, such as Gemini Flash-Lite, put the request in a ```json fence instead of ```step-tool. A reply that is only one valid tool request (json fence, unlabelled fence or bare JSON) now runs the tool through the same checks, so the AI reads the document and answers. A JSON example inside a longer answer is never treated as a request.
- Stop asking "ใช้บริบทที่บันทึกไว้กับงานนี้?" on every message in standard consent. Saved preferences (`ASSISTANT.md`, `STEP.md`, `AGENTS.md`, output style) and confirmed memories are sent like custom instructions and memory in Claude and ChatGPT. They still pass the privacy check when loaded. Strict mode (`"pilot": false`) still asks, and now lists the file and memory names instead of raw JSON.

- Mac installer builds now open the `.dmg` and launch the packaged app (`test/packaged-launch-smoke.mjs`). The smoke checks that setup and IPC work and that the organization documents and Skills are bundled.
- Requests to work in **STeP MIS** now open the STeP Browser instead of being answered from memory or the web. The router treats them as general help instead of a clarifying menu. The AI is told to open `https://mis.step.cmu.ac.th/` (from `manifest/services.yaml`) with the browser tool. The employee signs in themselves, and every click or fill still asks. The AI never submits, approves or e-signs. Approving in MIS is still blocked.
- Keep the waiting spinner turning when the OS reduces motion, so a wait never looks frozen.
- Answer from STeP's own documents before the web or general knowledge.
  - **Before:** general questions carried no organization documents, and the AI was never told which document IDs existed. Documents kept as a summary index (HR welfare 2569, career path, HR service channels, facility inventory) could not be read by the `reference` tool, so even `hr-policy-lookup` answered without the welfare data.
  - **Now:** every chat and draft turn includes the best-matching document sections, the "context used" list names them, and the AI is told to cite them or say the documents do not cover the question. Restricted and missing documents are never read. See [organization knowledge first](docs/desktop-context-memory.md#organization-knowledge-first).
- Fix Gemini API key in Settings appearing stuck: "เชื่อมต่อ Gemini" saved the key without testing it, so the connection stayed "not tested" with no progress. It now tests the key right away and ends ready or with a clear error (for example a full quota). A new smoke (`gemini-api-smoke`) runs the bundled Gemini CLI against a local fake API.
- Lay out the Chat tab like Claude Desktop:
  - **Text box:** starts at one line and grows as you type.
  - **Bottom-left:** `+` (attach), then compact work-mode and permission pickers.
  - **Bottom-right:** AI and model pickers, then send.
  - **Under each answer:** icon buttons for copy, open in Output, 👍, 👎 and remember.
  - **Task commands:** duplicate, export, memory and scheduled jobs move into a ⌄ menu next to the task title.
- Offer four modes in the composer, as in Claude Code and ChatGPT:
  - **Ask before edits:** every edit and command asks first.
  - **Accept edits** (new, on by default): AI edits are applied right away, with a snapshot to undo them; commands still ask.
  - **Full auto:** an administrator must enable it.
  - **Plan:** read only.
- Add **Good / Needs fixing / Remember this** under each answer.
  - Ratings stay on this computer.
  - A "needs fixing" note becomes a feedback memory proposal that the person confirms.
  - "Remember this" saves an edited memory after a dialog.
  - Text with personal data or secrets is never remembered.

### Desktop standard consent (formerly pilot mode)

- Make fewer confirmation dialogs the default after the pilot trial; administrators can set `"pilot": false` for strict mode. Standard mode cuts routine dialogs: plain text attachments, sensitive words with no person identifier (now a warning), plan approval, and per-source tool-result consent (one answer per run). The first-send dialog becomes a one-time acknowledgment in the setup wizard.
- Keep the floors in both modes: credentials and sensitive data tied to a person are blocked, national ID numbers are masked, images and multi-worker runs still ask, and file writes, commands and browser actions still ask through ToolGate. See [pilot mode](docs/desktop-policy.md#pilot-mode).
- Follow Claude and ChatGPT for remembered approvals: only a reviewed file write can be remembered, for the same file in the same workspace. Commands, the sandbox and MCP calls ask every time, and older remembered rules for them are ignored. Administrators can turn remembering off with `permission.rememberApprovals: false`.
- Count consent prompts, confirmations and cancellations per task on this computer (counts and tool names only) and show them in Settings → Organization policy.
- Stop a follow-up message when its route check fails instead of sending it without the authority check.

### Desktop English UI, new welcome and team starters

- Add a Thai/English switch on the first setup step and in Settings → Appearance & language. Thai stays the source text; English comes from `desktop/src/locales/en.ts`, and a unit test fails when wrapped Thai text has no English entry. Main-process dialogs, statuses and connection notes follow the same setting; prompts sent to the AI are unchanged. See [desktop i18n](docs/desktop-i18n.md).
- Rewrite the chat welcome around "AI drafts, you decide" with three trust points, and show three first tasks for each of the 21 STeP teams (general ones when no team is set), each checked against the router.
- Offer **Gemini · API key** on the main connection page (setup wizard and Settings) with a link to Google AI Studio, instead of only under admin settings.
- Rename the conversation toolbar's scheduled-jobs button to "งานตามรอบ", polish the workbench tabs, composer and consent labels, and fix Prettier drift that failed desktop CI.

### Experimental Gemini via Antigravity

- Add a separate personal Google connection, native NDJSON adapter, Gemini-only catalog and per-invocation configuration isolation. Preserve existing Gemini API and organization CLI routes.
- Withhold user prompts until native policy/tool preflight passes; validate completion, usage, cancellation and shutdown. Official Windows CLI 1.2.14 still declares broad tools, so generation is blocked before prompt transmission. OAuth acceptance remains open; see [adapter status](docs/antigravity-adapter.md).
- Wait for ChatGPT OAuth cancellation acknowledgement on browser-launch failure and reject late login callbacks; repair the race exposed by Linux CI.

### Desktop ChatGPT and Gemini connection follow-up

- Cancel pending ChatGPT OAuth attempts on synchronous or asynchronous browser failure and preserve a typed browser error. Reject malformed login links, user information, non-default ports and fragments before browser launch.
- Record successful local ChatGPT account refresh and one bounded live generation. Retain Gemini's consumer-account restriction after verifying Google's explicit deprecation notice; protocol initialization is recorded separately from live account acceptance. See [connection evidence](docs/chatgpt-gemini-oauth-followup.md).

### Desktop Claude Code OAuth follow-up

- Open a complete, validated official Claude authorization URL when piped CLI login does not launch the browser; cancel on browser failure and keep URLs/codes out of progress and diagnostics.
- Preserve Golden post-generation error codes and label blocked runs as not graded. Keep the shared output Privacy Gate unchanged.
- Record successful authorized account generation and 5/5 live/local feature groups. Formal Golden acceptance remains 0/3 pending output privacy review; separate offline content checks passed 14/14. See [OAuth follow-up](docs/claude-oauth-followup.md). No in-app subscription enablement, main merge or release is included.

### Desktop OpenHarness adaptation — Phase 6

- Add opt-in, in-memory transmission scopes for clean reads with source/account/model/policy binding, parallel confirmation coalescing, time/volume limits, visible allowance and revoke-and-stop. Preserve full-source privacy scans, separate destination/effect approvals and fresh review for masking or higher risk.
- Add synthetic/live feature-matrix evaluation for memory/follow-ups/attachments, compaction, gated tools/hooks, checkpoint resume and coordinator; label local/hybrid evidence separately. Share explicit live approval and named API/Claude subscription auth with Golden evaluation.
- Resolve native npm Claude Code launchers as well as legacy script entries. Keep the existing runtime/profile version gate and avoid upgrading personal runtimes.
- Document local validation and the user-authorized Claude OAuth attempt that failed generation and subsequently required login. No live acceptance, main merge or release is claimed.

### Desktop OpenHarness adaptation — Phase 5

- Add administrator-approved compatible/Ollama and Anthropic streaming profiles, safeStorage keys and managed Copilot device authorization through the pinned official SDK with native tools/config discovery disabled.
- Share governed draft preflight/runner across CLI, Golden evaluation and LINE; add text/json/stream-json output, explicitly named environment keys, conservative usage reservations and dry-run/composer readiness estimates.
- Consolidate the command palette/keyboard registry, configurable bindings and opt-in composer Vim; add on-demand checksum-verified local voice with temporary microphone approval and transcript privacy review.
- Add inert, validated Skill Pack import/list/enable/export, digest approvals, separately enabled host hooks/agent templates and ordinary source/destination consent.
- Add the organization-server LINE draft gateway with exact signed webhooks, allowlisted employee mapping, private sessions, attachment review, clarification state, outbound routing/privacy and explicit operator delivery approval.
- Validate with synthetic provider/OAuth/voice/LINE fixtures and real local Electron IPC. No paid/live account evaluation, LINE delivery, main merge, installer or release is included.


### Desktop OpenHarness adaptation — Phase 4

- Add bounded coordinator sessions, declared Playbook dependencies, a shared three-run provider limit and reviewed final merge proposals.
- Add app-open cron CRUD, serialized background drafts, context binding, restart recovery, history and status-only notifications.
- Add managed stdio/HTTP MCP with separate destination consent, bounded discovery/search, no uncertain-call retry and host tool governance.
- Add a Docker backend with digest-pinned preinstalled images, no network and explicitly selected privacy-checked read-only snapshots.
- Add read-only GitHub autopilot inspection and gated worktree coding via host-validated JSON proposals, isolated validation profiles, reviewed PR publication and exact-head human-gated merge.
- Cover the local flows with synthetic tests and real Electron UI/IPC; live providers, Docker engines, organization servers, remote autopilot writes and release acceptance remain pending.

### Desktop OpenHarness adaptation — Phase 3

- Add script-aware context estimates, older-source previews, bounded summaries, prompt-overflow retry and compact hooks while retaining host task state.
- Add privacy-checked, user-confirmed scoped memory, evidence-bound local Autodream suggestions and `/memory` editing with output styles.
- Load bounded workspace instructions and assistant preferences under existing routing/governance with explicit context transmission consent.
- Add local SQLite full-text search, independent session forks, resume without replay and scanned Markdown/JSON conversation exports.
- Connect OCR to image/scanned-PDF attachments and gate transient original-image input by managed policy, complete OCR, privacy and explicit review.
- Cover Phase 3 with synthetic unit/real Electron IPC/UI checks; live accounts, OCR accuracy, visual quality, packaged installs and production acceptance remain pending.

### Desktop OpenHarness adaptation — Phase 2

- Add a bounded Chat/Draft host tool loop with parallel reads, hooks, separate result consent and paged output.
- Add routed Skills, registered references, document sections, reviewed XLSX edits, Chat questions, plan approval and exact-byte local backups.
- Guard public retrieval with DNS/IP pinning, redirects and an optional trusted organization proxy.
- Add three-retry exponential backoff with jitter/retry-after, reported token/cost estimates, budget warnings and `/usage`.
- Cover the complete loop through synthetic Electron/preload/IPC; live providers and later phases remain unverified.

### Desktop OpenHarness adaptation — Phase 1

- Add administrator-owned managed policy with safe defaults, strict validation and hot reload.
- Apply credential/path/command/mode checks and metadata-only command, HTTP and prompt hooks to Workbench tools.
- Add a shared approval dialog, exact-workspace remembered grants, revocation and ask/plan/admin-enabled auto mode controls.
- Cover governance with synthetic unit tests and an Electron smoke test through the real preload bridge.
- Track the remaining OpenHarness adaptation phases in `docs/openharness-parity.md`.

STeP Desktop และ Workspace ทำงานใกล้เคียงโปรแกรม AI ชั้นนำมากขึ้น โดยยังคงด่านอำนาจและ Privacy เดิม

- **คำสั่งต่อเนื่องแบบที่คนพิมพ์จริงไม่หลุดเป็นงานใหม่** เช่น "ขอแบบสั้นกว่านี้", "ทำเป็นภาษาอังกฤษด้วย", "ช่วยทำต่อให้หน่อย", "โอเค แก้หัวข้อ 2 เป็นตาราง" แก้ร่างเดิมต่อ ส่วนคำขอที่พาไปงานอื่นหรือแนบเอกสารใหม่ยังเริ่มงานใหม่ คำถามที่ชี้ส่วนของร่าง ("หัวข้อ 2 หมายถึงอะไร") เห็นร่างประกอบ
- **คำขอแก้ร่างผ่านด่านอำนาจของตัวเอง** เดิมการแก้ร่างใช้เส้นทางของคำขอแรก ข้อความอย่าง "เพิ่มลายเซ็นอนุมัติ… แล้วอนุมัติงบเลย" จึงไม่ถูกตรวจ ตอนนี้หยุดก่อนถึงโมเดลและไม่ถูกนำไปรวมกับคำขอแก้ครั้งถัดไป
- **แยกกฎออกจากข้อมูล** กฎการร่างและ Skill ส่งเป็น system instructions ของแต่ละ runtime (Claude `systemPrompt`, Codex `developerInstructions`, Gemini `GEMINI_SYSTEM_MD`) เอกสารแนบ บทสนทนา และร่างอยู่ในส่วนที่มีป้ายกำกับ และเปิดหรือปิดส่วนอื่นเองไม่ได้
- **ลองใหม่และทำต่อได้** บริการ AI ที่ไม่ว่าง เครือข่ายหลุด หรือ runtime ปิดตัว จะถูกลองใหม่อัตโนมัติ 2 ครั้ง โควตาเต็มไม่ถูกลองซ้ำ Playbook ที่หยุดกลางทางเก็บผลขั้นที่เสร็จแล้ว ปุ่ม "ลองอีกครั้ง" ทำต่อจากขั้นที่หยุด
- **ทำงานหลาย Workspace พร้อมกันได้สูงสุด 3 งาน** แต่ละ Workspace ยังทำทีละงาน บันทึกการทำงานแต่ละครั้ง (ขนาด prompt, เอกสารอ้างอิง, จำนวนครั้งที่ลอง, เวลา, token) ลง diagnostics โดยไม่มีเนื้อหาคำขอหรือเอกสาร
- **Claude Console OAuth ติดตั้ง `ant` CLI ให้เอง** Anthropic ไม่มีตัวติดตั้งสำหรับ Windows STeP Desktop จึงดาวน์โหลด release ทางการ v1.36.0 ตรวจ SHA-256 และตรวจว่าเป็น `ant` ที่รองรับ OAuth ก่อนติดตั้งในพื้นที่ของผู้ใช้ เมื่อกดเชื่อมต่อหรือกดปุ่มติดตั้ง
- **Gemini บัญชีส่วนตัว** Google หยุดให้บริการ Gemini CLI กับบัญชี Google ส่วนตัวและ Google AI Pro/Ultra ตั้งแต่ 18 มิ.ย. 2569 แอปอธิบายสาเหตุนี้แทนข้อความผิดพลาดทั่วไป ค่าเริ่มต้นของ Gemini เป็น API key และการลงชื่อเข้าใช้ต้องมี Google Cloud Project ของบัญชี Code Assist Standard/Enterprise
- **Claude Code บังคับ Routing Gate ด้วย hook** ตัวติดตั้งเพิ่ม UserPromptSubmit hook ใน `.claude/settings.json` ที่รัน `step-ai hook user-prompt-submit` บนเครื่องและส่ง routing contract ให้โมเดลทุกคำขอ พร้อม allowlist เฉพาะ `step-ai ask`/`output` โดยคงการตั้งค่าเดิมของผู้ใช้
- **ชุดประเมินคุณภาพคำตอบ** `npm run eval:golden` ใน `desktop/` รันงานสมมติ TOR-SYN-01, MIN-SYN-01 และ QMS-SYN-01 ผ่านโมเดลจริง ตรวจ critical gates ตาม rubric และเก็บร่างไว้ให้คนอ่านใน `desktop/eval-results/`

- เพิ่ม `entrepreneur-annual-goal` (PITI, draft) สำหรับโค้ชผู้ประกอบการตั้งเป้ารายได้ 1 ปีจากฐานจริง ย้อนสินค้า ลูกค้า funnel กำลังผลิต วัตถุดิบ คน และเงินทุนก่อนทำแผนรายเดือน; แยก Actual/Benchmark/Assumption ขอเจ้าของยืนยันก่อนกระจายยอด และไม่แจกยอดติดลบเมื่อทำได้เกินเป้า
- เพิ่มขอบเขต `entrepreneur-commitment` ให้คำสั่งเลือกเป้า อนุมัติลงทุน จ้างคน หรือสั่งซื้อแทนเจ้าของกิจการต้องหยุดที่มนุษย์ โดยไม่อ้างอำนาจอนุมัติงบของ STeP กับกิจการภายนอก; คำถามคำนวณกำลังคนและร่างคำขอช่วยได้เมื่อ AI host ที่เปิดใช้แบบ opt-in จำแนกเป็นงานวิเคราะห์
- คำขอกิจการที่อาจผูกมัดและยังแยกเจตนาไม่ออกจะ `ESCALATE` ให้คนตรวจโดยค่าเริ่มต้น; AI host ที่รับข้อความอยู่แล้วส่งผลจำแนกใน schema กลับมาเพื่อตรวจเส้นทางซ้ำได้โดยไม่เรียก API เพิ่ม ผลจำแนกไม่ใช่การอนุมัติใช้เงินจริง และ Privacy Gate ที่ต้องให้คนยืนยันห้ามส่งต่อให้ตัวจำแนก
- ผลจำแนกปลดได้เฉพาะด่านงบที่ทับกับเรื่องของเจ้าของกิจการ: คำขอที่อ้าง STeP อุทยานฯ โครงการบ่มเพาะหรือผู้มีอำนาจขององค์กรยังหยุดที่คน และ authority อื่นในคำขอเดียวกัน (เช่น ลงนามแทน ผอ.) ยังชนะ; การอนุมัติสตาร์ทอัพหรือผู้ประกอบการเข้ารับทุน/บ่มเพาะยังเป็นของผู้อำนวยการโครงการ; คำสั่งให้ทำแทนเจ้าของ ("จ้างพนักงานเลย", "สั่งซื้อวัตถุดิบให้เลย", "…แทนผม") หยุดให้คนตรวจแม้ไม่ได้พูดถึงเป้ารายปี
- ผลจำแนกปลดด่านงบได้เฉพาะเมื่อคำขอบอกว่าเป็นเงินของกิจการผู้ใช้ ("วงเงินโฆษณาของบริษัทผม"); การเรียก STeP หรือ มช. แบบอ้อม (CMU, ม.เชียงใหม่, `S T e P`, ตัวอักษรเต็มความกว้าง) หรือไม่บอกเจ้าของเงิน ("อนุมัติวงเงินให้ทีมขายเลย") ยังหยุดที่ `afp-finance-head`; คำทั่วไปอย่าง `step by step`, `ทีมช่วย`, `สตาร์ทอัพของผม` ไม่ถูกนับเป็นองค์กรอีก; ถ้าไม่มีผลจำแนกจาก host คำขอเรื่องการจ้าง ลงทุน ซื้อ หรือกู้ต้องรอคนตรวจเสมอ ไม่มีทางลัดที่เดาจากคำว่าเป็นแค่คำถาม; ชื่อองค์กรที่ปลอมด้วยตัวอักษรต่างภาษา สัญลักษณ์คั่น หรือ leet ถือว่าอ้างองค์กร; "ของเรา" หรือเงินที่ "ได้จาก…" ไม่นับเป็นเงินของกิจการ; "อนุมัติ…เลยครับ" ที่มีคำลงท้ายสุภาพยังถูกบล็อก และ "อนุมัติยกเว้น…" ไปที่ `policy-waiver`; คำสั่ง "อนุมัติ…ให้เลย" ที่ไม่ระบุว่าเป็นเรื่องของกิจการผู้ใช้หยุดที่ `project-director`
- ผลจำแนก `ADVISORY` ไม่ปลดด่านงบอีกต่อไป: คำขอที่เข้า `budget-allocation` หยุดที่ `afp-finance-head` เสมอแม้เป็นเงินของบริษัทผู้ใช้; หลัง ADVISORY คำขอที่เอ่ยถึงโครงการ grant ทุน รางวัล ผอ. มช. หรือหน่วยงานรัฐยังต้องให้คนตรวจ; ชื่อที่พรางด้วยตัวคล้าย ช่องว่าง สัญลักษณ์ entity หรือกลับด้านถูกจับด้วย skeleton ส่วน café/อีโมจิ/ZWSP ที่ติดจากการคัดลอกไม่ทำให้ติดด่าน; คำสั่งอนุมัติตรวจจากกรรม/ความเร่งด่วนแทนคำลงท้าย; เพิ่มคำสั่งของเจ้าของ (ชำระ สินเชื่อ เช่า ปิดดีล ขึ้นเงินเดือน, hire/pay/buy for my company)
- ปิดช่องจากการตรวจความปลอดภัยรอบ 5: คำขอรับรองผล/อนุมัติทีมเข้าโครงการที่แทรกหลังแผนรายได้ยังคงหยุดที่ `project-director` แม้ Skill วางเป้ารายปีได้คะแนนสูงกว่าและไม่ต้องรอผลจำแนก host; ชื่อมหาวิทยาลัยรูป `ม.ช.` และ `ม ช` ยังคงส่งตรวจเจ้าของเงินหลังผล `ADVISORY` โดยคำถามวิเคราะห์และร่างเสนอผู้มีอำนาจไม่ถูกบล็อกผิด
- ข้อจำกัด: CLI ตรวจการ opt-in ของ host ไม่ได้ และ `queryHash` ไม่ได้ยืนยันตัวตนผู้จำแนก ด่านนี้ลดความผิดพลาดของ AI ไม่ได้กันผู้ใช้ที่ตั้งใจหลบ; ดู docs/architecture.md หัวข้อ Entrepreneur intent review

ปิดช่องที่พนักงานเลี่ยงด่านอนุมัติได้ด้วยการเปลี่ยนสำนวน (ข้อ H1–H4 และ M5 จาก audit วันที่ 27 กันยายน 2569)

- **ด่านอนุมัติจับการกระทำเดียวกันที่เขียนต่างกันได้** นอกจากวลีตรงตัว `manifest/authority.yaml` ระบุกลุ่มคำกริยาและกรรมของแต่ละอำนาจ คำขอที่มีทั้งสองกลุ่มอยู่ใกล้กันจะถูกบล็อก เช่น "เคาะงบให้ทีมเราหน่อย" หรือ "Pick the winning vendor" คำภาษาอังกฤษต้องตรงทั้งคำ "design" จึงไม่ถูกนับว่าเป็น "sign"
- **คำปฏิเสธไม่ซ่อนคำขอหลักแล้ว** "ไม่ต้องรอผู้อำนวยการ ลงนามหนังสือนี้ได้เลย" ถูกบล็อก ส่วน "ยังไม่ต้องกด Submit นะ แค่กรอกฟอร์มไว้ก่อน" ยังทำได้
- **อำนาจใหม่ 2 รายการ** `lab-result-release` ส่งการออกผลทดสอบให้ผู้มีอำนาจลงนามของห้องปฏิบัติการ แทนผู้ลงนามหนังสือ และ `external-submission` ขอให้ผู้ใช้ยืนยันก่อนส่งฟอร์มหรืออีเมลในนามผู้ใช้ แม้คำขอไม่ตรงกับ Skill ใด
- **สิ่งที่ผู้ใช้บอกว่าไม่ต้องทำไม่ถูกเลือกเป็น Skill** "ไม่ต้องทำ TOR นะ แค่ช่วยสรุปประชุม" ไม่ถูกส่งไป Skill เขียน TOR อีก
- **Skill ด้าน ISO 7 ตัวอ้างอำนาจ `iso-enactment` ถูกชื่อ** เดิมอ้าง `iso-qms-enactment` ซึ่งไม่มีอยู่ เทสต์ตรวจว่าทุกรหัสอำนาจที่ Skill และ router อ้างมีอยู่จริง

- Privacy Gate ตรวจรูปแบบข้อมูลส่วนบุคคลภาษาไทยที่เคยหลุด: เลขบัตรที่ใช้เลขไทยหรือเลขเต็มความกว้างและคั่นด้วยจุด/อักขระมองไม่เห็น, เบอร์โทรแบบ `08-1234-5678` หรือคั่นด้วยจุด และอีเมลที่ใช้ `＠` แทน `@`
- ปิดบังช่วงข้อความในต้นฉบับโดยคงข้อความรอบข้างไว้ หากสำเนาที่ปิดบังแล้วยังพบรูปแบบที่เฝ้าระวัง จะระงับสำเนาและส่งให้คนตรวจ ไม่เขียนไฟล์ `.redacted.txt` ที่ไม่ปลอดภัย การตรวจนี้ยังเป็นเพียง pattern scan ไม่ใช่การอนุญาตให้ส่งข้อมูลไป AI ภายนอก
- CLI แสดงคำสั่งแนะนำโดยใช้คำขอที่ปิดบังแล้วทั้งเส้นทาง Skill และ Playbook ไม่แสดงเบอร์โทรต้นฉบับซ้ำ; ที่อยู่ซึ่งปิดบังแล้วไม่ถูกตรวจพบซ้ำจาก placeholder และเลขทศนิยมธรรมดาไม่ถูกตีความเป็นเลขบัตรแบบคั่นจุด
- เพิ่มเทสต์สำหรับกรณีดังกล่าวและข้อความทั่วไปที่ต้องไม่ถูกบล็อกผิด

กัน manifest ที่ระบบอ่านไม่ครบโดยไม่แจ้ง (ข้อ H5 จาก audit)

- **Manifest ที่เขียนรูปแบบที่ระบบอ่านไม่ได้จะไม่ผ่าน validate (H5):** ตัวอ่าน manifest ของ Harness อ่าน YAML ได้เฉพาะบางรูปแบบ เดิมถ้าใครแก้ `consumers: ["*"]` เป็นรายการแบบหลายบรรทัด Skill นั้นจะหายจาก workspace ของทุกทีมโดยไม่มีข้อความเตือน แต่ validate และ test ยังผ่าน ตอนนี้ `npm run validate` ตรวจแบบ allowlist: ทุกบรรทัดใน `manifest/*.yaml` ต้องเป็นคอมเมนต์ทั้งบรรทัด, `key:`, `key: value`, `- key: value` หรือ `- item` เท่านั้น เยื้องเพิ่มทีละ 2 ช่อง ไม่มี tab และ key ไม่ใส่เครื่องหมายคำพูด ช่องที่ระบบอ่านเป็นรายการ (เช่น `consumers`, `primary`, `triggers`, `actions`, `objects`, `preferredTools`, `consumes`, `produces` และทุกช่องใต้ `signals:`) ต้องเขียน `[a, b]` ในบรรทัดเดียว; ห้ามใช้ tag/anchor/alias (`!`, `&`, `*`) และ `{...}` ยกเว้นรูปแบบที่มีอยู่แล้ว; ใช้ `>-` ได้เฉพาะ `summary` ใน `documents.yaml`; รายการใน `[...]` ห้ามมี `,` ในเครื่องหมายคำพูด; รายการแรกของแต่ละ entry ต้องเป็น `- name:` (router) หรือ `- id:` (teams, roles, playbooks, steps, provenance) ไม่เช่นนั้น entry นั้นถูกทิ้ง ทุกข้อผิดพลาดแจ้งเป็น file:line และมีเทสต์เทียบจำนวน entry ในไฟล์กับที่ตัวอ่าน JS โหลดได้จริง
- ปิดช่องหลุดเพิ่มเติมของ H5: ตรวจ lone `CR` จาก bytes ของ manifest ก่อน Python แปลง newline เพื่อไม่ให้ authority trigger หายจากตัวอ่าน JS; ปฏิเสธ identifier ของ authority ที่ JS อ่านไม่ได้ (เช่นมี `_`) ก่อนนำค่าไปทับ authority ก่อนหน้า; และถอด apostrophe ที่ escape แบบ YAML (`''`) ในค่า single-quoted ให้ trigger และคำอธิบายตรงกับความหมาย YAML ทั้งใน authority และฟิลด์รายการของ router (`intent`, `triggers`, `paths`, `fileTypes`, `primary`)

## v0.7.6

เสริมวิธีทำงานที่คัดจาก [claude-code-templates](https://github.com/davila7/claude-code-templates) ให้ Skill เดิม 4 ตัว ไม่เพิ่ม Skill ใหม่ และไม่ติดตั้งชุดนั้นทั้งหมด ที่มาและ license อยู่ใน [third-party-methods.md](docs/third-party-methods.md)

### Skill ที่ปรับ

- **`tor-review` ตรวจสิ่งที่ TOR ไม่ได้เขียน** (จาก `devil`, MIT) เช่น ส่งงานไม่ผ่านการตรวจรับแล้วแก้ได้กี่รอบ STeP ต้องจัดอะไรให้ผู้รับจ้าง และไฟล์ต้นฉบับเป็นของใคร ทุกข้อเขียนเป็นสถานการณ์ ค้นใน TOR ซ้ำก่อนถามเพื่อไม่ถามสิ่งที่ตอบไว้แล้ว ไม่นับส่วนที่ TOR ตัดออกเป็นช่องว่าง และปิดท้ายด้วยคำถามส่งต่อที่คัดลอกไปส่ง AFP หรือเจ้าของเรื่องได้ทันที
- **`ncr-capa` จัดลำดับสาเหตุด้วย Pareto** (จาก `root-cause-pareto`, MIT) เมื่อมี NC หรือข้อร้องเรียนหลายรายการ เลือกหน่วยนับตามผลกระทบ จัดหมวดก่อนนับ ตรวจว่าอันดับคงที่ข้ามสองช่วง แล้วตั้งตัวเลขที่ต้องขยับและวันวัดซ้ำ
- **`quality-objective-kpi-review` ทำรายงาน KPI ประจำรอบ** (จาก `weekly-ops-report`, MIT) เทียบกับค่าเฉลี่ยหลายรอบ รายงานเฉพาะที่เกินเกณฑ์ไม่เกิน 5 ข้อพร้อมส่วนที่เป็นต้นเหตุ แยกตัวเลขจากความเห็น และมีหมายเหตุคุณภาพข้อมูล
- **`step-writing` ตัดสำนวนที่ฟังออกว่า AI เขียน** (หมวดจาก `avoid-ai-writing`, MIT) รายการภาษาไทยเขียนใหม่ทั้งหมดใน `references/thai-ai-writing-patterns.md` และไม่แตะรูปแบบหนังสือราชการ

### Routing

- "วิเคราะห์ Pareto ของ NC", "จัดลำดับสาเหตุทำ CAPA" ไปถึง `ncr-capa` · "ทำรายงานผล KPI ประจำเดือน" ไปถึง `quality-objective-kpi-review` · "รายงานผลการดำเนินงานโครงการส่งผู้บริหาร" ไปถึง `executive-status-update` · "ประเมินความเสี่ยงของกระบวนการ" ไปถึง `qms-risk-opportunity-review` ก่อนหน้านี้คำขอเหล่านี้ถูกถามกลับหรือตอบแบบงานทั่วไป
- เพิ่มคำบอกเจตนา "วิเคราะห์", "จัดลำดับ" และ "รายงานผล"

### คุณภาพ Skill

- `tor-review`, `ncr-capa` และ `quality-objective-kpi-review` มี eval ครบ 4 มิติและตัวอย่างคำตอบที่ดี รายการหนี้ `legacyWithoutEvals` ลดจาก 43 เหลือ 40

### ใช้ได้ด้วยบัญชี AI ฟรี

- **VS Code + GitHub Copilot** ได้ไฟล์คำสั่ง `.github/copilot-instructions.md` เนื้อหาเดียวกับ `AGENTS.md` ก่อนหน้านี้ต้องพึ่งการอ่าน `AGENTS.md` อย่างเดียว
- **อนุญาตคำสั่ง step-ai ล่วงหน้า** เฉพาะ `step-ai ask` และ `step-ai output` ใน Gemini CLI (`.gemini/settings.json` → `tools.allowed`) และ VS Code (`.vscode/settings.json` → `chat.tools.terminal.autoApprove`) ตามเอกสารของแต่ละโปรแกรม คำสั่งอื่นยังถามเหมือนเดิม ถ้ามีไฟล์ตั้งค่าอยู่แล้ว ตัวติดตั้งเพิ่มเฉพาะรายการนี้ ไม่แก้ค่าที่ผู้ใช้ตั้งเอง และไม่แตะไฟล์ที่มี comment · OpenCode รันคำสั่งได้เองอยู่แล้ว · Cursor และ Antigravity เก็บการอนุญาตไว้นอกโฟลเดอร์ จึงให้กดอนุญาตครั้งแรก
- Gemini CLI / Antigravity และ VS Code + Copilot ถูกจัดเป็นกลุ่มใช้ฟรีได้ ป้าย "Paid" หายจากไฟล์คำสั่ง · `doctor --employee` ตอนไม่พบโปรแกรม AI แสดง 4 ทางเลือกเท่ากัน และตรวจพบ Gemini CLI ได้
- คู่มือใหม่ [ติดตั้งโปรแกรม AI](docs/ai-app-setup.md) ทีละขั้นสำหรับทั้ง 4 โปรแกรม · runbook เพิ่มชุดตรวจบนเครื่องจริงด้วยบัญชีฟรี

### คู่มือ

- คู่มือพนักงานมีหัวข้อ **เลือกโปรแกรม AI (รุ่นฟรีก็ใช้ได้)** องค์กรไม่ได้จัดบัญชี AI ให้ พนักงานใช้บัญชีของตัวเองได้ โปรแกรมรุ่นฟรีที่เปิดโฟลเดอร์ได้ (Cursor, OpenCode, Gemini CLI/Antigravity, VS Code + Copilot) ใช้ขั้นตอนของ STeP AI ได้ครบเท่ารุ่นเสียเงิน แชทบนเว็บใช้ไม่ได้เพราะเปิดโฟลเดอร์ไม่ได้ และระบุข้อมูลที่ห้ามแนบเมื่อใช้บัญชีส่วนตัว

### อัปเกรด

ผู้ทดสอบที่ใช้ v0.7.3 อัปเดตตรงไป v0.7.6 ได้ในครั้งเดียว ขั้นตอนเดียวกับ v0.7.5 ใน [คู่มือรอบ Pilot](docs/pilot-runbook.md)

## v0.7.5

**สถานะ:** มี GitHub Release อัตโนมัติเมื่อ merge ต้องผ่าน Release Gate ก่อนแจ้งผู้ทดสอบ · ผู้ทดสอบที่ใช้ v0.7.3 อัปเดตตรงมาที่รุ่นนี้ได้ ไม่ต้องผ่าน v0.7.4

รุ่นนี้แก้เรื่องที่กระทบความประทับใจครั้งแรก จากการลองคำถามวันแรกแบบภาษาพูด 40 ข้อ (จำลอง ยังไม่ใช่คำถามจริงของพนักงาน) ก่อนแก้ 32 ข้อถูกถามกลับก่อนช่วย และมีแค่ 8 ข้อที่ระบบรู้ทันทีว่าต้องใช้ขั้นตอนไหน หลังแก้ 15 ข้อไปถึงขั้นตอนที่ตรง 23 ข้อได้ความช่วยเหลือทันที และเหลือ 2 ข้อที่ยังต้องถาม คือ "ช่วยหน่อย" ซึ่งไม่บอกงาน และ "อนุมัติให้หน่อย" ซึ่งเป็นเรื่องอำนาจอนุมัติ

| รายการ | v0.7.4 | v0.7.5 |
| --- | ---: | ---: |
| Skills / เส้นทาง Router | 49 / 48 | 50 / 49 |
| Routing regression | 81 เคส | 95 เคส |
| Skill ที่มี eval ครบ 4 มิติ | 0 | 6 |

### AI เรียกตัวเลือกวิธีทำงานได้บนเครื่องพนักงาน

- เพิ่ม `step-ai` (macOS/Linux) และ `step-ai.cmd` (Windows) ในโฟลเดอร์ชุดติดตั้ง ตัวติดตั้งวาง Node.js ไว้ใน `.step-ai/runtime/` และไม่ได้เพิ่มลง PATH คำสั่ง `step-ai` เปล่า ๆ จึงล้มบนเครื่องที่ไม่มี Node.js ติดตั้งไว้เอง ทำให้ทุกงานไม่ผ่านขั้นตอนขององค์กร ตัวเรียกใหม่ใช้ runtime ของชุดนี้ก่อน แล้วจึงลอง Node.js ในเครื่อง
- คำสั่งให้ AI ระบุวิธีเรียกทั้งสามแบบ และถ้ายังเรียกไม่ได้ ให้บอกผู้ใช้ด้วยภาษาคน ไม่ใช้คำว่า Router/Skill/contract
- `step-ai doctor --employee` ตรวจว่ามีตัวเรียกคำสั่งจริง แทนการขึ้น "Ready" ทุกครั้ง

### ช่วยทันทีเมื่อเป็นงานทั่วไป (โหมด GENERAL)

- งานที่บอกมาชัดแต่ไม่มีขั้นตอนเฉพาะของ STeP เช่น แปล เขียนอีเมล ทำ Excel เขียนโค้ด หรือระดมไอเดีย ได้รับความช่วยเหลือทันที ก่อนหน้านี้ "ช่วยแปลเป็นภาษาอังกฤษ" ถูกถามกลับ 3 รอบแล้วขึ้นเมนูที่ไม่เกี่ยวกับงาน
- ในโหมดนี้ยังโหลดกฎ Human Approval และ Data Classification เสมอ และห้ามอ้างว่าเป็นระเบียบหรือแบบฟอร์มของ STeP ถ้าไม่มีเอกสารอ้างอิง
- ยังถามกลับเหมือนเดิมเมื่อคำขอไม่บอกงาน ("ช่วยดูเอกสารนี้หน่อย"), ถามเรื่องเอกสารที่ต้องแนบ, เป็นการอนุมัติหรือส่งแบบฟอร์ม เอ่ยถึงทีม/ระเบียบ/แบบฟอร์ม/ระบบของ STeP หรือถามเรื่องเบิก สวัสดิการ เงินเดือน และสิทธิ์ ซึ่งต้องตอบจากเอกสารขององค์กร และ Authority BLOCK ยังมาก่อนทุกกรณี

### ร่างหนังสือที่มีผู้ลงนามไม่ถูกห้ามอีก

- ก่อนหน้านี้คำขออย่าง "ร่างหนังสือ… ผู้ลงนามยังรอยืนยัน", "เว้นช่องลงนามไว้" หรือ "ร่างบันทึกเสนอผู้อำนวยการลงนาม" ถูก BLOCK เพราะการตรวจอำนาจจับทุกคำขอที่มีคำว่า "ลงนาม" ทั้งที่ผู้ใช้ขอแค่ร่าง ตอนนี้แยกการ**พูดถึง**ผู้ลงนามออกจากการ**ขอให้ลงนาม** ตามคำอธิบายของกฎ official-signing ที่ห้าม "การลงนามหรือออกเลขหนังสือจริง"
- ตำแหน่งผู้ลงนามพิมพ์ได้ทั้งชื่อเต็มและชื่อย่อ เช่น ผู้อำนวยการ / ผอ. / รอง ผอ. / ผช.ผอ. / ผู้จัดการ / ผจก. / หัวหน้าทีม / หน.ทีม / ประธานกรรมการ และชื่อตำแหน่งที่มีส่วนต่อท้าย เช่น "ผู้อำนวยการอุทยานวิทยาศาสตร์ฯ"
- ใช้**ชื่อจริงของผู้บริหาร**ได้ทั้งชื่อเต็มและชื่อสั้น พร้อมคำนำหน้า เช่น "รศ.ดร.ปิติวัฒน์ วัฒนชัย", "อาจารย์ปิติวัฒน์", "คุณเมลิน" รายชื่อดึงจาก `manifest/organization.yaml` (ข้อมูลสาธารณะที่ผู้ดูแลยืนยันแล้ว) ผังผู้บริหารเปลี่ยนเมื่อไร การตรวจก็ตามทันที
- `thai-official-documents` เติมชื่อเต็มและตำแหน่งผู้ลงนามจากผังผู้บริหารเมื่อผู้ใช้ระบุตำแหน่งหรือชื่อ พร้อมบอกวันที่ตรวจผัง ถ้าตำแหน่งมีหลายคนจะเลือกจากทีมที่กำกับ ถ้าผู้ใช้ไม่ได้ระบุจะเขียน `รอยืนยัน` เพราะการเลือกผู้ลงนามเป็นการตัดสินของเจ้าของเรื่อง
- "ร่างบันทึกข้อความขออนุมัติ…" ไปงานหนังสือราชการได้ทันที ก่อนหน้านี้คำว่า "ขออนุมัติ" ทำให้ระบบตีความเป็นการอนุมัติแล้วถามกลับ ส่วน "…แล้วอนุมัติให้เลย" ยัง BLOCK
- trigger "ข้อความ" ของ `step-writing` ไม่แย่งงาน "บันทึกข้อความ" อีก
- การลงนามแทน เซ็นแทน และการออกเลขหนังสือยัง BLOCK และ "ออกเลขหนังสือ", "ลงนามแทน", "เซ็นแทน" ถูกเพิ่มเป็น trigger ระดับองค์กรของ official-signing ให้ตรงกับคำอธิบายของกฎ
- คำขอที่ต้องให้คนทำเท่านั้น (ลงนาม ออกเลข โอนเงิน อนุมัติ กดส่งฟอร์ม) ไม่เข้าโหมด GENERAL
- มี test ทั้งสองฝั่ง: เคสร่าง 6 แบบต้องผ่าน และเคสลงนามหรือออกเลขจริง 7 แบบต้องยัง BLOCK

### ถามน้อยลงเมื่อต้องถาม

- เมื่อมีงานที่เป็นไปได้จริง ระบบถามด้วยเมนูตั้งแต่คำถามแรกหรือที่สอง แทนคำถามปลายเปิดสามรอบ ถ้ามีตัวเลือกเดียวจะถามยืนยันครั้งเดียว
- เมนูแสดงเฉพาะตัวเลือกที่มีหลักฐานว่าเกี่ยวกับคำขอ

### คำพูดวันแรกไปถึงงานที่ตรง

- "ตรวจคำผิด" → ตรวจภาษา, "ทำ timeline โครงการ" → วางแผนโครงการ, "เตรียมตัวสัมภาษณ์ตรวจ ISO" → ซ้อมตอบผู้ตรวจ, "ทำ brief ให้ดีไซเนอร์" → Creative Brief, "ทำ TOR ซื้อ…" → ร่าง TOR, "ทำ prompt รูป…" → prompt ภาพ, "ลาป่วยต้องมีใบรับรองแพทย์ไหม" → สิทธิ์ HR
- "เตรียมตัวสัมภาษณ์งาน" ไม่ถูกดึงไปเป็นการซ้อมตอบผู้ตรวจ ISO

### คุณภาพ Skill

- **eval รายตัวครบ 4 มิติ** (positive, anti-trigger, collision, missing-source) ใน `evals/skills/` สำหรับ `meeting-summary`, `step-writing`, `thai-official-documents`, `hr-policy-lookup`, `document-review` และ `stakeholder-questionnaire` CI รันส่วน routing ทุกเคส
- **ตัวอย่างคำตอบที่ดีพร้อมเหตุผล** ใน `examples/` ของทั้ง 6 Skill ใช้ข้อมูลสังเคราะห์
- **กลไกบังคับ:** Skill ใหม่ต้องมีทั้ง eval และตัวอย่างก่อน merge ส่วน 43 Skill เดิมบันทึกเป็นรายการหนี้ `legacyWithoutEvals` ที่ลดได้อย่างเดียว
- eval จับปัญหาได้สองจุดระหว่างเขียน: "ค่ารักษาพยาบาลเบิกได้ปีละเท่าไหร่" หลุดไปโหมด GENERAL และ "ร่างหนังสือแจ้งมติที่ประชุมถึงหน่วยงานภายนอก" ถูกถามกลับ แก้ทั้งสองแล้ว
- มาตรฐานการเขียน Skill ระบุเกณฑ์ของแต่ละ lifecycle stage ชัดเจน และแก้ข้อความใน `manifest/skills.yaml` ที่ขัดกับมาตรฐาน
- workspace ของทีมได้รับ `docs/facility-equipment-index.md` ที่ `expert-resource-matching` ใช้ และ `docs/skill-authoring-standard.md` ที่ `step-skill-authoring` อ้าง ก่อนหน้านี้ลิงก์ทั้งสองใช้ได้ใน repo แต่เปิดไม่ได้บนเครื่องพนักงาน และมี test ตรวจว่าเอกสารที่ Skill อ้างถูกแจกไปครบ

### เอกสารที่ QS และ AFP ไม่ได้ส่งให้

- **QS แจ้งว่าไม่มีหรือไม่ให้ Quality Manual และ Master Document List** จึงเพิ่มเอกสารฉบับทำงานสองไฟล์ที่รวบรวมจาก QP 8 ฉบับที่ QS ส่งมาและหนังสือเวียน ISO ของ CC: [Master List ฉบับทำงาน](docs/qms-working-master-list.md) บอก Rev และวันที่ของ QP ส่วน [แผนที่ ISO 9001:2015 → เอกสาร STeP](docs/qms-working-reference.md) ใช้แทน QM ทั้งสองไฟล์ระบุชัดว่าไม่ใช่เอกสารควบคุม ต้องตรวจ Rev ล่าสุดใน STeP MIS และขอบเขต QMS (ข้อ 4.3) ยังต้องถาม QS
- ทะเบียนบันทึก QM และ Master List เป็น `not-provided` (QS ไม่ให้ 25 ก.ย. 2569) Skill ด้าน QMS อ้างฉบับทำงานแทน ส่วน QP ที่ Harness ยังไม่มีเนื้อความยังแสดงสถานะว่ามีช่องว่างของแหล่งอ้างอิงเหมือนเดิม
- **AFP ไม่ได้ส่งนโยบายจัดซื้อจัดจ้างและแนวปฏิบัติเบิกจ่ายของ STeP** จึงเพิ่ม [ลำดับชั้นระเบียบงานการเงินและพัสดุ](docs/afp-regulation-hierarchy.md) ที่บอกว่าเรื่องไหนน่าจะอยู่ใต้ระเบียบระดับใด คือแนวปฏิบัติ AFP, ประกาศอุทยานฯ, ข้อบังคับ มช. และระเบียบระดับชาติ ไฟล์นี้มีแต่ชื่อฉบับ ไม่มีเนื้อความ AI จึงห้ามอ้างเลขข้อ วงเงิน หรืออัตราจากความจำ ข้อสรุปว่าเบิกได้ไหมหรือ TOR ถูกระเบียบไหมยังเป็นร่างที่รอแหล่งอ้างอิงเหมือนเดิม

### วิธีการจากชุมชน

ดัดแปลงแล้วเขียนใหม่ให้เข้ากับโครง Standard v2 ไม่คัดลอกทั้งไฟล์ ที่มาและ license อยู่ใน [third-party-methods.md](docs/third-party-methods.md)

- **Skill ใหม่ `stakeholder-questionnaire`** (จาก `to-questionnaire`, MIT): ร่างชุดคำถามส่งให้คนที่มีคำตอบ เมื่องานติดที่ข้อมูลหรือเอกสารที่ยัง `รอยืนยัน` เช่น ถาม AFP หรือ QS แทนการรอเฉย ๆ เริ่มที่ lifecycle `draft`
- **ชวนตรวจก่อนนำไปใช้** (จาก `discernment-nudge`, Apache 2.0): หลังคำตอบที่ผู้ใช้จะนำไปตัดสินใจ AI ต่อท้ายคำถามชวนตรวจ 2–3 ข้อที่ชี้สิ่งเฉพาะในคำตอบ ครั้งเดียวต่อบทสนทนา และข้ามเมื่อผู้ใช้ให้ข้อมูลมาเองหรือขอให้ตรวจอยู่แล้ว
- **`document-review` มีขั้นทดสอบจากมุมผู้อ่าน** (จาก `doc-coauthoring`, Apache 2.0): คาดคำถามที่ผู้รับจะถาม แล้วตรวจว่าเอกสารตอบได้หรือยัง
- **`step-skill-authoring`** (จาก `skill-creator`, `writing-skills`, `writing-for-agents`): เริ่มจากเคสที่ AI พลาดเมื่อไม่มี Skill, เทียบแบบมี Skill กับไม่มี Skill, assertion ที่แยกคุณค่าของ Skill ได้ และการเขียนให้ AI ทำตามได้สม่ำเสมอ

### Release

- หน้า GitHub Release ใช้ลิงก์เต็มไปยังไฟล์ของรุ่นนั้น ลิงก์เอกสารในหน้า release จึงเปิดได้
- README และเอกสาร Pilot ไม่ระบุว่า "รุ่นล่าสุดคือ" แล้ว เพราะ release ออกอัตโนมัติเมื่อ merge และข้อความแบบนั้นจะผิดทันทีที่รุ่นใหม่ออก

### อัปเกรดจาก v0.7.3 หรือ v0.7.4

เปิดตัวอัปเดตได้เลย ไม่ต้องติดตั้งใหม่ ตัวอัปเดตเพิ่ม `step-ai` / `step-ai.cmd` และรักษา `USER.md`, `MEMORY.md`, `.env`, `output/` เหมือนเดิม ผู้ดูแลต้องซ้อมบนเครื่องจริงตาม [คู่มือ Pilot](docs/pilot-runbook.md) ก่อนแจ้งผู้ทดสอบ รวมถึงตรวจว่า AI เรียกตัวเลือกวิธีทำงานได้จริงในโปรแกรม AI ที่ใช้

## v0.7.4

**เผยแพร่:** GitHub Release 25 กันยายน 2569 · ไม่แจกให้ผู้ทดสอบ ให้ใช้ v0.7.5 แทน เพราะรุ่นนี้ยังไม่มีตัวเรียกคำสั่งสำหรับเครื่องที่ไม่มี Node.js บน PATH

| รายการ | v0.7.3 | v0.7.4 |
| --- | ---: | ---: |
| Skills | 46 | 49 |
| เส้นทาง Router (ไม่นับ `step-router`) | 45 | 48 |
| Playbooks | 4 | 5 |
| Actions | 3 | 4 |
| ทีม / กลุ่ม routing | 22 / 5 | 22 / 5 |

### งานใหม่ที่พนักงานถามได้

- **`hr-policy-lookup`** ตอบสิทธิ์และสวัสดิการจากประกาศ HR ฉบับ 2569 เช่น วันลา ค่าเดินทาง และค่าที่พัก พร้อมอ้างเลขข้อ ส่วนยอดคงเหลือของแต่ละคนให้ถาม HD และไม่รับหรือเก็บเลขบัตรประชาชน
- **`afp-operations-lookup`** ตอบระยะเวลาดำเนินการของ AFP (การเงินและจัดซื้อ) หมวดค่าใช้จ่าย B/BV/B9.2 การจ้างรถตู้ และค่าวิทยากร โดยบอกเงื่อนไขทุกครั้งว่านับเวลาเมื่อเอกสารครบ และถ้าแก้เอกสารจะเริ่มนับใหม่
- **`event-run-of-show`** พร้อม Action `spreadsheet-run-of-show` และ Playbook `brief-to-run-of-show` ช่วยทำหรือตรวจรันคิวเวทีด้วย checklist 14 ข้อ

### ปรับ Skill เดิม

- `event-concept` มีขั้นออกแบบ Signature Moment เป็นทางเลือก และต้องให้เจ้าของพิธีตัดสินเรื่องที่เกี่ยวกับศาสนา สถาบัน หรือประเพณีท้องถิ่น
- Skill ฝั่ง Creative อ้างแบบฟอร์ม CC ที่ใช้อยู่ตอนนี้ เพราะ FM-CC-001/003/008 ถูกยกเลิก และยืนยันแล้วว่า FM-CC-010 รวมทั้งสามฉบับ
- First Run กลับมาถามชื่อเล่น ชื่อผู้ช่วย และสไตล์การคุยสำหรับผู้ใช้ใหม่ในข้อความเดียว ข้ามได้ ส่วนผู้ใช้เดิมไม่ถูกบังคับให้ทำซ้ำ

### ความปลอดภัยและ routing

- ตรวจ privacy ของคำขอก่อนเลือกเส้นทาง และใช้ข้อความที่ปิดบังแล้วตลอดทาง เลขประจำตัวที่วางมาจึงไม่ไปถึง Skill, routing contract หรือหน้าจอ terminal
- ระบุให้ AI ทุกตัวต้องเรียก Router ในเครื่องก่อนตอบงานจริง และถ้า CLI ใช้ไม่ได้ต้องทำตามทางสำรองที่กำหนด ไม่ข้ามไปตอบจากความรู้ของโมเดลเอง
- ประมาณ token ภาษาไทยตามจริง (ประมาณ 1 token ต่ออักษร) ไม่ใช้อัตราเดียวกับภาษาอังกฤษ

### ข้อมูลส่วนตัวและไฟล์งาน

- สร้าง `.gitignore` ให้ workspace ที่ยังไม่มี เพื่อไม่ให้ `USER.md` / `MEMORY.md` ติดไปกับ Git ภายหลัง
- จองชื่อไฟล์ output แบบ exclusive เมื่อสั่งงานสองครั้งในวินาทีเดียวกัน ไฟล์แรกจะไม่ถูกเขียนทับ
- `step-ai update` คัดลอกเอกสาร HR, CC และ AFP ที่ Skill อ้างถึงไปที่ workspace ด้วย ก่อนหน้านี้ Skill ติดตั้งแล้วแต่หาเอกสารอ้างอิงไม่เจอ

### แหล่งอ้างอิงที่เพิ่ม

- ดัชนีประกาศ HR ฉบับ 2569 พร้อมอัตราที่ประกาศ แนวปฏิบัติ HR ที่มีเฉพาะในหนังสือเวียน และ [ช่องทางยื่นเรื่อง HR](docs/hr-service-channels.md)
- [ระยะเวลาและหมวดค่าใช้จ่าย AFP](docs/afp-operational-circulars.md)
- [ทะเบียนเอกสาร ISO ของ CC](docs/cc-iso-document-register.md)

### การติดตั้งและดูแลระบบ

- คู่มือ macOS ใช้ขั้นตอน System Settings > Privacy & Security > Open Anyway เพราะ Apple ถอดวิธีคลิกขวา > Open ออกตั้งแต่ macOS 15 (Sequoia)
- คืน executable bit ให้ `bin/step-ai.js` คำสั่ง `step-ai` จาก clone ใหม่จึงไม่ขึ้น Permission denied
- ตรึง `src/vendor/privacy/` เป็น `-text` การ clone บน Windows จึงไม่ทำให้ integrity check ของ runtime ล้มเหลว (ไม่กระทบ ZIP ที่แจก)
- workflow ออก release ตรวจชุดเดียวกับ CI ครบ (Node runtime pin และ syntax ของสคริปต์ privacy/PowerShell ทุกไฟล์) และใช้หัวข้อรุ่นในไฟล์นี้เป็น release notes

### ไม่ได้รวมในชุดติดตั้ง

- `experiments/local-thai-ocr` เป็นการทดลองแยก ไม่อยู่ใน ZIP หรือ npm package

### อัปเกรดจาก v0.7.3

ผู้ที่ติดตั้ง v0.7.3 แล้วเปิดตัวอัปเดตได้เลย ไม่ต้องติดตั้งใหม่ ตัวอัปเดตตรวจ checksum ก่อนติดตั้ง สร้าง snapshot สำหรับ rollback รักษา `USER.md`, `MEMORY.md`, `.env`, `output/` และไม่เขียนทับไฟล์ระบบที่ผู้ใช้แก้เองในเครื่อง ผู้ดูแลซ้อมอัปเกรดและ rollback ได้ตาม [คู่มือ Pilot](docs/pilot-runbook.md)

## v0.7.3

**เผยแพร่:** GitHub Release 21 กันยายน 2569 · ใช้ใน Pilot รอบแรก 22 กันยายน 2569

46 Skills / 45 เส้นทาง Router / 4 Playbooks / 3 Actions / 22 ทีม / 5 กลุ่ม routing รุ่นก่อนหน้านี้ดูรายละเอียดได้จาก GitHub Releases และประวัติ commit
