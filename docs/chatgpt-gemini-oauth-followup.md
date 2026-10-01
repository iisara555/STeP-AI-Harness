# ChatGPT and Gemini connection follow-up

Date: 2026-10-01. Review branch: `codex/chatgpt-gemini-oauth`, based on `codex/claude-oauth-followup` (`0a3cb8c`).

The user requested the same account-connection checks for ChatGPT and Gemini after the Claude OAuth follow-up. This check distinguishes local sign-in, protocol compatibility, actual generation and a saved STeP connection.

## Observed results

| Provider | Authentication / transport | Live generation | STeP connection |
| --- | --- | --- | --- |
| ChatGPT | Installed Codex **0.159.2** reported ChatGPT sign-in for the default personal profile. Bundled Codex **0.158.0** refreshed both that profile and the existing STeP connection profile successfully. | Two bounded **gpt-6-astra** requests passed: personal profile `EVAL_READY` (**14,154 reported tokens**) and saved STeP profile `OK` (**11,930 reported tokens**). | One subscription connection was found with stored `ready: true`. Its runtime profile refreshed and generated successfully; no connection record was added or changed. |
| Gemini | Bundled Gemini CLI **0.61.0** passed ACP initialization in an empty temporary profile. The user selected a personal / Google AI Pro or Ultra account. | Not attempted: Google has discontinued the consumer-account OAuth route used by Gemini CLI. No personal-account login or inference was initiated. | No saved Gemini connection was found. The existing consumer-account gate remains enforced. |

The bundled transport check also passed Codex initialization without authentication. Protocol initialization alone does not prove account access or inference. Reported token counts are usage evidence, not a billing estimate.

Each ChatGPT probe used the existing native runtime's managed account flow: `account/read` with `refreshToken: true`, `model/list`, an ephemeral `thread/start`, then one `turn/start`. Each awaited `turn/completed` with status `completed` and checked the exact response marker. The model catalog alone was not treated as an entitlement check. Total reported usage was **26,084 tokens**: personal profile 14,147 input + 7 output, STeP profile 11,925 input + 5 output. No raw credential file, account email, OAuth URL or token was printed or copied.

The probes ran in temporary workspaces with a 60-second budget each. Process-only settings disabled shell, plugins, apps and web search, and set project-context bytes to zero. The personal profile's effective configuration still contained two enabled MCP entries after an empty-map override; that preflight stopped before authentication or inference. A subsequent configuration attempt also stopped before inference. The final personal-profile probe explicitly disabled the discovered entries in memory. The first STeP-profile preflight also stopped before inference because the older saved managed configuration did not explicitly disable every feature; process-only overrides resolved that condition without rewriting the profile. Both successful probes verified **zero enabled MCP servers** and observed zero host tool requests. No configuration file in either account profile was changed. This is not an adversarial provider-native tool-denial test.

The database was opened read-only and queried using the source-verified record kind `connection`. An initial query incorrectly used `connections`; its empty result was superseded by the corrected query before final reporting. Safe local evidence is ignored under `desktop/release/qa/chatgpt-account-probe.json`, `step-chatgpt-connection-probe.json` and `runtime-probe.json`. Temporary diagnostic helpers and account material are excluded from the commit.

## Gemini eligibility and conflicting documentation

Google's [consumer-account deprecation notice](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals), updated September 2, 2026, explicitly says Gemini CLI stopped serving Gemini Code Assist for individuals, Google AI Pro and Google AI Ultra accounts on **June 18, 2026**, including Login with Google. Code Assist Standard/Enterprise access is unchanged. The [Google Cloud release notes](https://docs.cloud.google.com/gemini/docs/release-notes) repeat this restriction.

The [Gemini CLI authentication guide](https://geminicli.com/docs/get-started/authentication/) still recommends personal Google sign-in and lists those consumer tiers. That general setup page conflicts with the explicit deprecation notice. This check follows the provider's account-specific deprecation notice and does not remove STeP's `GEMINI_PERSONAL_DISCONTINUED` gate based on the general guide.

This restriction concerns the **Gemini CLI consumer backend**, not signing into the Gemini website. Google directs affected users to Antigravity CLI. Antigravity is not implemented by this STeP adapter, and migration was not performed. Gemini API credentials or an eligible Code Assist Standard/Enterprise account with an authorized Google Cloud project are separate connection options; neither was supplied or tested in this follow-up. No project, subscription or billing change was made.

## ChatGPT browser failure repair

Two local regressions reproduced gaps in `desktop/electron/connect.ts` before the fix:

- A synchronous `openExternal` failure escaped as a raw browser exception and did not take the normal login-cancellation path. Both synchronous and asynchronous failures now cancel the pending attempt, return the existing `LOGIN_BROWSER_FAILED` code and skip the generation test.
- Malformed URLs escaped as a URL parser error; official-looking links with user information, non-default ports or fragments were accepted. Invalid links now return only `INVALID_LOGIN_URL` before browser launch. HTTPS and the existing exact official-host allowlist remain required.

The flow also checks an already-aborted signal before opening the browser. Matching `loginId`, account refresh after completion and reuse of a valid saved account remain covered by the existing tests. It adds no confirmation to successful saved-account reuse.

The [official authentication documentation](https://learn.chatgpt.com/docs/auth) documents native login status and automatic token refresh. The [app-server account surface](https://learn.chatgpt.com/docs/app-server) documents managed ChatGPT OAuth and `account/read`. This follow-up tests that existing managed flow; it does not implement or inspect a separate token-sharing client.

## Verification and remaining acceptance

- **222 Desktop unit tests passed**, zero failures/skips. The seven OAuth tests include the two new regressions, covering both browser failure forms and six invalid URL variants.
- Formatting, TypeScript/production build and both repository validators passed (**51 Skills**). The existing approximately 859 KB renderer bundle warning remains. The first build was blocked by sandbox access to ancestor directories; the same build passed with the required filesystem permission.
- [Claude follow-up PR #85](https://github.com/iisara555/STeP-AI-Harness/pull/85) passed `validate`, `desktop` and `windows-tests` for commit `0a3cb8c` in [run 36819571321](https://github.com/iisara555/STeP-AI-Harness/actions/runs/36819571321). This historical CI result is separate from the new branch's checks.
- Full Harness and Electron smoke suites were not rerun locally for this scoped connection repair. No installer, release or main merge was performed.

The actual ChatGPT checks used the existing local CLI account and the saved STeP runtime account through bounded app-server probes. They did not drive the renderer or exercise `signInAndTest` against a real account. Fresh browser login, UI restart/reuse, expiry/logout, quota recovery and packaged/macOS behavior remain unverified. Gemini consumer OAuth cannot be accepted through the current CLI route; an eligible alternative must be selected before a live Gemini test. Claude's formal Golden output review remains open as described in the [Claude follow-up](claude-oauth-followup.md).
