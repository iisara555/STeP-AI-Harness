# Harness parity pilot

Controlled, public/synthetic three-task pack for Claude subscription, ChatGPT through Codex, and Gemini through Antigravity. This is an evaluation CLI, not a change to Desktop's production tool permissions.

From `desktop/`, using Node 24+ and installed dependencies:

```powershell
npm run eval:harness-parity -- --self-test
npm run eval:harness-parity -- --probe
npm run eval:harness-parity -- --protocol-test
npm run eval:harness-parity -- --live
```

`--live` uses the three ready subscription connections from the Desktop database and their existing OAuth profiles. It authorizes transmission of this built-in public/synthetic fixture and reversible writes only in isolated trial folders. It never changes the real Desktop database, policies, workspaces, or chat history. Don't send requests in Desktop against the same account during a measured run. Ambient API keys are omitted. Antigravity uses the existing adapter's temporary sign-in home, removed after shutdown.

Default output: `output/CC/2026/10/harness-parity/`. `--output <folder>` selects another destination. **Do not change output folders to restart the allowance for the same authorized experiment.** The allowance is 300,000 combined tokens; all input, output, reasoning and reported cache observations count. Gemini's ambiguous cache counters are charged conservatively above its normalized total. Usage counters are observations, not billing statements or a provider-enforced hard limit.

The durable ledger reserves before each call. Missing or zero usage on failed requests stays charged at the full reservation and stops the run. Interrupted calls require inspection; finished trials are not repeated. `--continue-accounted` is an explicit bounded continuation after inspecting the failure: it retains unknown charges, records the reason, acknowledges only existing failures, and cannot increase/reset the allowance. A new uncertain result stops again. Source changes require that flag and preserve old fingerprints; changes to the prompt, Skills, fixtures or host gates reject continuation. Prefer one frozen revision for a comparison.

The pack checks a source-backed Markdown brief, XLSX identifiers/formula/readback, and patch recovery after a transient read error and a real stale-hash conflict. Native Claude uses an in-process SDK MCP tool, Codex uses experimental dynamic tools, and Antigravity has an experimental stdio MCP bridge. All share `DesktopTools`, host validation, privacy review, transmission consent, workspace/path permissions and the reversible write gate. The fixture policy is `defaultPolicy()`; this does not certify parity with every managed policy or organization hook. Only the six fixture tools are exposed; no shell, native filesystem, browser, external MCP, publication or approval tools.

This first pilot uses a **single generic `step_host` function** with JSON-encoded host arguments. It tests transport and recovery, not the benefit of a fully typed native schema for each individual tool. Baseline uses the existing provider adapter and `ToolLoop` under a fixed scoped prompt, not the complete UI/Skill-routing path. Both arms receive the same selected Skills and facts; caching remains the provider default. One repetition, fixed arm order and warm-cache differences cannot establish a quality or speed ranking.

`--protocol-test` starts Codex and registers the schema without `turn/start`; Antigravity stops before sending a user prompt. These are zero-inference compatibility checks, not completed-task evidence. Non-Claude native live runs are single-call capability probes under the pilot's remaining budget and are explicitly marked as such.

Outputs include fingerprints, source metadata, requests/results, model usage, budget reservations and file checks. A file counts only after reading the actual artifact. Formula recalculation, comprehensive semantic review and visual review remain separate. Read the [measured findings and limitations](../../../docs/harness-parity-eval.md) before interpreting results.
