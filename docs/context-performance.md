# Context and provider performance

This implementation follows the architecture audit of `origin/main` at
`45e7c1373d7cb392260e5f4b50d934dc9eaa3e35` (Harness 0.7.6 / Desktop 0.5.32).
It uses the existing router, manifests, in-memory knowledge retrieval and local
usage ledger. It adds no runtime dependency, model router, database or service.

## Prompt scope and prefix

Routing, authority, readiness and privacy checks run before choosing context.
A new, self-contained translation, spelling/grammar correction or supplied-text
summary can use the text scope. Conservative Thai/English grammar accepts a
colon, newline or inline supplied text, such as `แปลเป็นอังกฤษ: วันนี้อากาศดี`,
`ช่วยแปลเป็นภาษาอังกฤษ วันนี้อากาศดี` or `Summarize this text: ...`. A bare
language request can ask for missing source text or target language.
This scope keeps standing governance, the routing contract and any routed Skill
and mandatory references. It omits registry discovery, organization retrieval,
tool instructions and empty source/history sections.

Other selected Skills, organization questions, workflows, approved plans, files,
images, history, revisions and uncertain or mixed instructions use full context.
The optimization therefore applies to some ordinary language tasks that route
to a Skill as well as GENERAL. GENERAL alone does not imply text scope.

System content starts with behavior and standing governance, then host tool
rules and compact registries. Preferences, workflow and selected instructions
follow. Conversation, task state, sources, tool results and the current request
remain in the user prompt. Browser guidance is in the system tool block, so it
does not interrupt the growing user-prompt prefix at every tool turn.

Skill and document discovery use one line per entry: `ID | title | short summary`.
Titles and summaries are bounded. Existing router and retrieval rankings select
up to three discovery candidates when evidence is available. Mandatory Skill and
source IDs remain included, so they can exceed three. Uncertain discovery keeps
the complete compact index. Neither selection nor catalog discovery activates a
Skill, changes routing or grants authority.

The governed `skill` and `reference` tools accept empty input with
`args.action: "catalog"` to discover omitted IDs without loading bodies. Reference
catalogs filter restricted documents. Full reads still use the existing gates.
Section headings remain in local retrieval,
and the governed `reference` tool supports `args.action: "outline"` for up to
100 headings before a section/body read. Restrictions, authority, path checks
and outgoing consent apply to these reads. Document content/metadata changes
invalidate the in-memory knowledge cache. Skill discovery caches metadata and
invalidates it when manifests, package metadata or Skill files change.

## Provider transport and caching

Codex and Gemini retain their existing RPC process/thread across a step's tool
turns. Claude retains its streaming SDK query; Copilot retains its SDK client
and session. Each sends only the suffix when the next prompt extends the prior
prompt. Reuse binds to the account, credentials, runtime, model, work directory,
effort and system instructions. Compaction or a changed binding creates a fresh
conversation. Search/image paths keep their separate transport behavior.
Native file/shell/MCP tools remain disabled. Cancellation and step completion
close retained conversations; sessions do not persist across completed steps.

Codex/Gemini recover an invalid or dropped retained session once with the full
prompt. Usage reported before the failure is retained alongside recovery usage.
Authentication and quota failures do not trigger that fallback. Compatible API
errors are normalized at the Desktop adapter boundary so existing transient
retry rules also work for 429, 5xx and network failures. Structured quota codes
stop retries. Error-body parsing is bounded and does not expose raw messages.

Stable prefix ordering supports providers that cache compatible prefixes; it
does not establish a cache hit. Explicit `anthropic-ephemeral` caching is opt-in
for the Anthropic-compatible API transport. Gemini API-key text calls can opt into
`gemini-explicit`; the host creates a `cachedContents` resource containing the
assembled system instructions, then references it from subsequent calls with the
same account/key/model/prefix. Resources expire after five minutes; host memory
keeps at most eight opaque bindings/resource names. A small prefix, unsupported
cache or expired resource falls back to ordinary generation with system
instructions intact. Authentication and quota failures stop rather than
generating another paid request. Server cache storage charges are outside the
token-cost ledger.

Gemini explicit caching requires an explicitly selected Gemini model and the
bundled API-key text path. Subscription, custom runtime, search and image calls
keep Gemini CLI; its prompt caching remains runtime/server-managed. Native Gemini
HTTP sends the complete dynamic user prompt, while reusing the cached system
resource; it is not a persistent RPC conversation. Claude SDK caching remains
SDK-managed. OpenAI-style
endpoints keep their server-side cache behavior. Thresholds, TTLs and supported
models depend on the actual endpoint/upstream, including OpenRouter routing.

## Managed configuration and cost

Optional `modelLimits` use the selected model key, then `provider:*` as fallback.
For example, an administrator can merge this into the existing Desktop policy:

```json
{
  "modelLimits": {
    "local-small-model": {
      "contextWindow": 16384,
      "maxOutputTokens": 1024
    },
    "anthropic-compatible-model": {
      "contextWindow": 200000,
      "maxOutputTokens": 8192,
      "promptCaching": "anthropic-ephemeral"
    },
    "gemini-2.5-flash": {
      "contextWindow": 1000000,
      "maxOutputTokens": 8192,
      "promptCaching": "gemini-explicit"
    }
  },
  "prices": {
    "anthropic-compatible-model": {
      "input": 1,
      "output": 2,
      "cachedInput": 0.1,
      "cacheWriteInput": 1.25
    }
  }
}
```

The model names and prices above are examples, not vendor rates. Choose an
approved compatible endpoint with the Anthropic protocol for `anthropic-ephemeral`.
Choose an available model on the Gemini API-key connection for `gemini-explicit`.
Compatible endpoints reject the Gemini-native option. `off` disables explicit caching;
it does not disable automatic server caching. Context windows accept 16,384 through
2,000,000 tokens: standing governance alone is about 3k estimated tokens and a
chat turn with tools about 9k, so a smaller window would refuse every message.
Output limits accept 1 through 65,536 and must be below half of an explicit
context window. A policy with an invalid entry is reported and not applied. Explicit windows allow budgets below the old 48k floor.
The host reserves output and estimation headroom, with its existing 160k cap.
Output limits affect compatible/Gemini API requests and host budgeting; native SDK/CLI
output generation remains controlled by those runtimes. Existing heuristics
remain the fallback when no override is configured.

Reported `input` includes cache reads/writes; `cachedInput` and `cacheWriteInput`
are subsets. Anthropic input totals include its three separate input counters;
OpenAI/DeepSeek/Gemini cache hits are already included in reported prompt tokens.
Gemini output includes reported candidate and thinking tokens.
The ledger prices ordinary input, cache reads and cache writes separately without
adding tokens twice. Missing cache counters remain unknown. Missing cache rates
use the ordinary input price and the Usage UI labels the approximation. Prices
are USD per million tokens; historical entries retain their recorded estimate.

## Diagnostics and reproducible benchmark

Run/step `providerCalls` record answer, summary and native-search attempts. On run
completion they also produce `provider-call` records in the existing
`logs/diagnostics.jsonl`, linked by run and step, with:

- Host text bytes and estimated input tokens, broken into governance, registry,
  selected instructions, tool rules, history, sources, task state and request.
- A hash of the system prefix, elapsed time, first emitted text time (`ttftMs`),
  completion/error code and actual usage when the provider supplies it.
- Full/delta transport, sent characters, runtime startup time, reset reason and
  Gemini cache creation/reuse/bypass status
  where the adapter exposes them. Step `toolMs` records local tool execution.
- Discovery scope and candidate counts on the step trace.

These diagnostics store measurements, not raw prompt text or credentials.
Component counts use `script-aware-estimate-v2`; independent block estimates may
not add exactly to the whole estimate. Host bytes exclude wire encoding, runtime
base instructions and images. TTFT is the first emitted answer text; a reasoning
event is not counted as answer text. RPC recovery is one host attempt containing
two physical calls, with combined usage and a `session-invalid` transport reset.

Run the local benchmark from the repository root:

```sh
npm --prefix desktop run eval:context
```

It uses real routing, manifests, privacy checks and prompt assembly with an
in-memory store and a mock adapter. It makes no provider requests. The command
fails if translation or spelling fixtures do not reduce input by more than 60%.

| Fixture | Main baseline | Implemented estimate | Reduction |
| --- | ---: | ---: | ---: |
| Thai-to-English supplied text | 14,529 | 3,489 | 76.0% |
| Thai spelling correction | 12,228 | 4,861 | 60.2% |
| Supplied-text summary | — | 3,446 | — |
| Organization HR question | 16,568 | 8,706 | 47.5% |

The HR fixture keeps registered-source retrieval and full tool context, with
ranked discovery candidates and a governed catalog fallback.
The baseline numbers are from the audit commit, using the same estimator.

Core and Desktop regression tests cover retries, cache accounting, invalidation,
scope exclusions, authority/privacy, session deltas, reset, dropped-session
recovery, native Gemini cache isolation/fallback and cancellation. Fake CLI
processes, HTTP servers and SDK fixtures verify lifecycle;
they do not establish live provider entitlement or model answer quality.
Live cold/warm TTFT, completion latency, cache-hit rate and billed savings still
require account-specific evaluation. The proposed 1–2 second latency target is
a measurement goal, not a result from this local benchmark.
