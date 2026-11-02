# REA developer Skill

The repository-local `reverse-engineer-anything` Skill helps developers investigate
packaged applications, Electron/JavaScript artifacts, binaries, or behavior that
is not established by available source. Use ordinary repository tools for normal
source-code questions. This is a developer Skill; it is not registered as an
employee-facing STeP Skill or bundled in STeP Desktop.

The Skill and its reference files are copied without changes from
[`morluto/rea` 6.8.0](https://github.com/morluto/rea/tree/160d821ac9a0310afcb8d1fc427862dd6508add5/.agents/skills/reverse-engineer-anything)
at commit `160d821ac9a0310afcb8d1fc427862dd6508add5`. The upstream MIT license
is included beside `SKILL.md`. Update the Skill, reference files and REA runtime
together so the instructions match the available tools.

## Local setup

Installing the Skill alone does not start or register REA. To reproduce the
local setup, first use a Node.js version accepted by REA 6.8.0:
`^22.23.4 || ^24.22.1 || >=26.12.1`. For example, Node.js 25 does not satisfy
that range. From this repository, with a compatible `node` and `npm` on `PATH`:

```sh
npm install --prefix node_modules/rea-dev-runtime --no-save --package-lock=false --omit=optional --ignore-scripts --no-audit --no-fund rea-agents@6.8.0
```

The runtime is local and ignored by Git. Add a project-scoped `.codex/config.toml`
with absolute paths appropriate for the developer's machine. On Windows, TOML
literal strings avoid escaping backslashes:

```toml
[mcp_servers.rea]
command = 'C:\absolute\path\to\node.exe'
args = ['C:\absolute\path\to\step-ai-harness\node_modules\rea-dev-runtime\node_modules\rea-agents\scripts\rea.mjs', 'mcp']
startup_timeout_sec = 30
```

This configuration is local and Git-ignored because paths and other settings can
be machine-specific or sensitive. Codex loads project configuration only for a
trusted project. Reopen the Codex session or restart the client after adding an
MCP server, and verify with `codex mcp get rea --json`. The existing session's
tool list does not prove that a newly registered server has connected.

REA 6.8.0's `doctor --client codex --json` inspects its setup-managed global
Codex registration. It can report `config_drift` there even when Codex reads
the project-scoped registration. Check the active project configuration and
connection separately; a global warning alone does not call for changing the
user's global configuration.

The local installation omits optional dependencies and install scripts. The
synthetic JavaScript analysis and MCP connection were exercised on Windows with
Node.js 24.22.1; a listed tool is not proof that its provider is installed.
Native decompilation and other specialist workflows have their own platform and
provider requirements. No native provider is installed by this procedure.
Follow the user's permitted target and the host's existing privacy and approval
rules, and distinguish observed evidence from inference and unknowns.
