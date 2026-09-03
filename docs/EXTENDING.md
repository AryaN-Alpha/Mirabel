# Extending Mirabel — Tools, RAG, and Token-Cost Rules

This is the canonical playbook for adding **agent tools**, **RAG/memory
pipelines**, and **any new LLM call site** to Mirabel. It exists because a
multi-pass cost-optimization effort (see `backend/core/services/telemetry.py`,
`backend/agent/tools/routing.py`, `backend/memory/services/gating.py`, and
the rest of the pattern catalog below) already solved most of the hard
problems in this codebase — a new feature that doesn't reuse them
re-introduces the exact waste that was just removed.

Read this before touching `agent/tools/`, `memory/services/`,
`core/services/providers/`, or `core/services/llm.py`. It assumes you've
already read the root `CLAUDE.md` — this doc is the detailed "how do I add
X" companion to CLAUDE.md's "what are the hard rules" reference. Where the
two overlap (provider retry/reraise, security conventions, error handling),
CLAUDE.md is authoritative; don't duplicate it here, follow it.

---

## 1. Architecture map (read this first)

```
Request (REST /api/chat/, WS /ws/chat/, or agent task)
  │
  ├─ core/services/llm.py::generate_reply()            ── text chat, one-shot
  │    ├─ memory/services/gating.py::needs_memory()     ── cheap pre-filter
  │    ├─ memory/services/retrieval.py                  ── cached, re-ranked RAG read
  │    └─ core/services/providers/get_provider(...)     ── multi-provider dispatch
  │
  ├─ voice/consumers.py                                 ── same shape, async/streaming
  │
  └─ agent/tasks.py::run_agent_task()                   ── LangGraph agent loop
       ├─ agent/tools/routing.py::select_tools()         ── domain-routed tool binding
       ├─ agent/graph.py::build_agent()                  ── react agent + pre_model_hook trim
       └─ agent/tools/<domain>_tools.py                  ── the actual tools

Celery (never inline in a request):
  memory/tasks.py::embed_and_store          ── salience-gated, dedup-gated Chroma write
  memory/tasks.py::extract_and_supersede_facts ── LLM fact extraction + supersession
  memory/tasks.py::run_weekly_summary       ── pinned salience=0.9 rollup
  memory/tasks.py::run_memory_lifecycle     ── age+salience pruning

Cross-cutting:
  core/services/providers/*_provider.py     ── one Provider per LLM vendor
  core/services/telemetry.py                ── log_llm_call / log_truncation
  core/services/text_utils.py               ── truncate_chars / select_relevant_sentences /
                                                encode_compact_list / normalize_utterance
  core/evals/ + <app>/evals/                ── regression harness, `manage.py run_evals`
```

Every rule below is either "reuse this piece" or "extend this piece the same
way its existing instances were extended."

---

## 2. Adding a new agent tool

Tools are what the LangGraph agent (`agent/graph.py`) can call. They live in
`backend/agent/tools/<domain>_tools.py`.

### 2.1 Where it goes
- **Existing domain** (kanban, cv, linkedin, outlook, classroom, memory,
  conversation): add the function to that domain's module.
- **New domain**: create `agent/tools/<domain>_tools.py` following the shape
  of `outlook_tools.py` (module docstring explaining what's safe vs.
  sensitive, a `_MAX_*_CHARS` constant block if the domain touches
  unbounded external content, functions, then a `TOOLS = [...]` list at the
  bottom).

### 2.2 Registering it
1. Add the function to its module's `TOOLS` list.
2. If it's a new module, import it in `agent/tools/registry.py` and add it
   to `ALL_TOOLS`. This step is **mandatory** — `ALL_TOOLS` is the fail-open
   fallback every ambiguous/cross-domain instruction resolves to, so a tool
   missing from it is simply never callable, silently.
3. Wiring into `agent/tools/routing.py` (`_DOMAIN_KEYWORDS` /
   `_DOMAIN_TOOLS`) is **optional**, not required. An unrouted domain always
   falls open to `ALL_TOOLS`, same as before routing existed — correctness
   never depends on this step. Do it when the domain has a small, clean set
   of trigger keywords and you want the per-turn tool-schema token savings;
   skip it for a domain that's inherently cross-cutting or rarely used.

### 2.3 Writing the tool function
- Decorate with `@tool` from `langchain_core.tools`. The **docstring is the
  schema the model sees on every call that binds this tool** — write it like
  a public API doc: one clear sentence of purpose, an `Args:` block per
  parameter, and — critically — call out anything the model needs to know
  before calling it (irreversibility, prerequisites, what "empty" means).
  See `check_outlook_connection`'s docstring for the "call this first if
  unsure" pattern.
- Return a plain `dict` (or a small JSON-serializable structure). **Never
  raise inside a tool body** — an uncaught exception kills the whole agent
  turn instead of giving the model something to react to. Catch the
  domain-specific error type and return `{"error": str(exc)}`, matching
  every existing tool (see `outlook_tools.py`'s `OutlookError` handling).
- If the tool reads external content with no size contract (an API
  response body, a file, a scraped page), **you must bound it** before it
  reaches the LLM or the tool-result JSON — see §4.3.

### 2.4 Sensitive / irreversible actions
Anything that sends, publishes, turns in, deletes, or otherwise cannot be
undone must pause for human approval via
`agent/tools/_common.py::require_confirmation`:

```python
from agent.tools._common import rejected_message, require_confirmation

@tool
def send_something_now(...) -> dict:
    """... IRREVERSIBLE — calling this pauses the run to ask the human for
    approval first. If they reject it, nothing happens; say so plainly,
    don't retry."""
    summary = f'Do the irreversible thing: "{...}"'
    args = {...}
    decision = require_confirmation(tool="send_something_now", summary=summary, args=args)
    if not decision["approved"]:
        return {"sent": False, "message": rejected_message(summary)}
    final_args = decision.get("args") or args   # human may have edited args
    ... # the actual side effect, using final_args
```

Hard constraint: **everything before the `require_confirmation` call must be
safe to re-run from the top.** LangGraph's `interrupt()` re-executes the
whole tool function on resume (see `_common.py`'s docstring) — only
read-only lookups may happen before the confirmation call; no writes, no
sends, nothing with a side effect.

Scheduled/cancellable actions (an email queued for later, a draft the user
can still edit) do **not** need confirmation — see `schedule_outlook_email`
for the precedent. Only things that are irrevocable *the moment the tool
returns* need the gate.

If the tool has a real destination page the user would want to check
afterward, add an entry to `agent/tools/links.py::_RESOLVERS` too — it's how
a finished `AgentTask` shows a "go check it" link/preview in
`AgentTaskPanel.jsx` instead of just a text confirmation. It's a small,
tool-name-keyed resolver over the tool's own JSON result (never the LLM's
own text — see that module's docstring), so it's a few-line addition, not a
new subsystem. Optional, but skipping it for a new write-tool means that
tool's completions silently don't get one.

### 2.5 Ambiguous instructions
If a tool needs information the instruction didn't provide and you can't
reasonably default it, don't guess — call
`agent/tools/conversation_tools.py::ask_clarifying_question` from inside
your tool, or let the model call it directly (it's in `_ALWAYS_ON`, bound on
every task regardless of domain).

### 2.6 Tests
- Unit-test the tool function directly in `agent/tests.py` (or a
  domain-appropriate test module) the way existing domain tools are tested —
  call it, assert the returned dict shape, assert error paths return
  `{"error": ...}` rather than raising.
- If you touched `routing.py`'s keyword tables, add/update cases in
  `agent/evals/cases.py` and confirm `agent/evals/routing_eval.py` still
  passes (`python manage.py run_evals --suite routing`, free/zero-cost).

---

## 3. Adding a new RAG / memory-writing pipeline

"RAG agent" in this codebase means: something that writes into the single
Chroma collection (`mirabel_memories`, via
`memory/services/chroma_client.py`) and/or reads from it through
`memory/services/retrieval.py`. There is **one collection, one user** — see
CLAUDE.md's Phase 2 rules. Do not create a second collection for a new
feature; add a new `kind` (or `fact_type`) metadata value instead, the same
way `kind="fact"` was added alongside the original `kind="turn"`/`"summary"`.

### 3.1 The write path (non-negotiable shape)
Every write pipeline in this app follows the same skeleton
(`memory/tasks.py::embed_and_store` and `::extract_and_supersede_facts` are
the two reference implementations):

1. **Celery only.** Never call `chroma_client.add_memory` (or any Chroma
   write) from a Django view or from inside an agent tool's synchronous
   body. Views/tools kick off a task; the task does the write. This is what
   keeps request latency flat and writes idempotent-on-retry.
2. **Gate before any spend, in cheapest-first order:**
   - A **free, deterministic** pre-filter first (salience floor, a keyword
     heuristic like `facts.py::has_extractable_signal`, a dedup check).
   - Only if that passes, an **LLM call** (fact extraction, supersession
     judgment) — and even then, route it through
     `core.services.providers.get_provider(ModelPreference.current().provider)`,
     never a hand-rolled SDK client. (A hand-rolled Anthropic client in an
     earlier version of `facts.py` silently broke fact extraction for every
     user on a different provider with no Anthropic key — found in review,
     now the standing reason for this rule.)
   - Every gate **fails open toward the existing/simpler behavior**, never
     toward silently dropping something that might matter — see
     `dedup.is_near_duplicate` and `supersession.find_superseded_fact` both
     returning "proceed normally" on any error.
3. **Compute expensive scores once, at write time**, store them as Chroma
   metadata (`salience`, `fact_type`, `status`). Never recompute a score on
   the read path — `retrieval.py` only ever reads `meta.get("salience", ...)`.
4. **Idempotency**: use a deterministic Chroma id when the source is
   naturally unique (`f"msg_{msg.id}"`) so a Celery retry safely re-upserts.
   When the id must be freshly minted (e.g. a new fact gets its own uuid),
   guard against double-spend on retry by checking a DB idempotency marker
   **before** any LLM call, not after — see
   `extract_and_supersede_facts`'s `MemoryFact.objects.filter(...).exists()`
   check at the very top, with the reasoning for why it's ordered that way
   in its docstring.

### 3.2 The read path (non-negotiable shape)
- All reads go through `memory/services/retrieval.py::retrieve_relevant_memories`
  (or a new function that follows its exact shape) — never call
  `chroma_client.query_memories` directly from a view/tool/task. This is
  what gives you, for free: the short-TTL cache, the relevance-threshold
  floor, the recency/salience re-ranking, and the fail-open-to-`[]` contract.
- **Never let a memory-layer error break the caller.** Wrap the whole thing
  in try/except returning `[]` (or, if you're adding a new read function,
  copy `retrieve_relevant_memories`'s try/except shape exactly).
- If your new `kind` needs its own rendering in the assembled prompt block,
  add a branch to `format_memories_for_prompt`'s `if kind == ...` chain —
  don't build a second prompt-formatting function. Stay inside
  `settings.MEMORY_BLOCK_MAX_CHARS`; the existing budget loop already caps
  total size, it just needs your new branch to produce a reasonably short
  line.
- If the new memory kind should be searchable by the agent, expose it
  through `agent/tools/memory_tools.py` (it's a thin, read-only wrapper over
  `retrieve_relevant_memories` — extend it, don't build a parallel path).

### 3.3 New "kinds" and lifecycle
- Pick a `status` (`"active"` / `"superseded"` / anything you add) and
  default missing values sensibly on read — `retrieval.py` defaults missing
  `status` to `"active"` specifically so old rows that predate the field
  keep working (Chroma equality filters never match a missing key). Follow
  that same default-safe pattern for any new metadata field you introduce.
- If the new kind should ever be pruned, extend
  `memory/services/lifecycle.py::prune_stale_memories`'s exclusions
  deliberately — the default is **never delete** unless you've decided your
  new kind is genuinely low-value once stale. `kind="summary"` and any
  `fact`-derived row (pinned salience ≥ 0.75) are permanently exempt by
  design; don't change that.

### 3.4 Building a wholly new RAG *agent* (not just a memory feature)
If "RAG agent" means something bigger — a new retrieval-augmented
generation flow outside chat/voice (e.g. a CV-tailoring or classroom-solving
assistant that needs its own retrieval) — reuse the layering, don't reuse
the collection:
- Reuse `core.services.providers.get_provider()` / `get_api_key()` for the
  model call — same retry/caching/telemetry benefits as everywhere else.
- Reuse `core/services/text_utils.py` for any context-window budgeting
  (`select_relevant_sentences` for "lossy is fine" content like a job
  posting; `truncate_chars` for anything else).
- If it needs its own vector store (a genuinely different domain of
  documents, not user memories — e.g. `cv/services/*` already does
  retrieval-free structuring/tailoring against DB rows, not Chroma), do
  **not** put it in the `mirabel_memories` collection. A second Chroma
  collection is fine when the data is a different kind of thing (documents
  vs. episodic memories) — the "one collection" rule in CLAUDE.md is
  specifically about the memory/RAG system, not a blanket ban on all vector
  search. If you do add one, give it its own `chroma_client`-style thin
  wrapper module — don't scatter raw `chromadb` SDK calls across the
  feature.
- Still gate any LLM call behind the cheapest-sufficient check before
  spending, and still log every call site via `telemetry.log_llm_call`
  (automatic if you go through `get_provider()`).

---

## 4. Token-cost checklist — apply to any new LLM-touching feature

This is the reusable pattern catalog this codebase's optimization passes
already established. Check each one when adding anything that calls an LLM,
touches Chroma, or returns a large payload toward the model.

1. **Gate before spend.** A free, deterministic, explainable heuristic runs
   first; the LLM/embedding call only fires if it passes. Every gate fails
   **open** toward doing the expensive-but-correct thing when the signal is
   ambiguous — never fails closed and silently skips something that might
   matter. (`gating.needs_memory`, `routing.select_tools`,
   `dedup.is_near_duplicate`, `facts.has_extractable_signal`.)
2. **Cache repeatable reads.** A short-TTL cache on a query that can
   plausibly repeat within seconds (agent calling `search_memories` twice,
   back-to-back voice turns) avoids a duplicate round-trip for near-zero
   staleness risk. (`retrieval.py`'s `cache.get`/`cache.set`,
   `settings.MEMORY_RETRIEVAL_CACHE_TTL_SECONDS`.)
3. **Keep `system` byte-stable; put per-request content in
   `system_suffix`.** Every `Provider.generate_text`/`stream_text` call
   must never concatenate dynamic content (RAG memory, per-request context)
   into the `system` argument — that defeats every provider's prompt
   caching (explicit for Anthropic, automatic for OpenAI/Gemini/DeepSeek).
   See `core/services/providers/base.py`'s docstring and CLAUDE.md's Pass-4
   note on the real bug this rule fixes.
4. **Bound unbounded external content before it reaches a prompt.** Any
   API response body, pasted text, or scraped content with no size
   contract goes through `truncate_chars` (hard cut, visible
   `...[truncated, N chars omitted]` marker — never a silent cut) or, when
   some content is genuinely more relevant than the rest,
   `select_relevant_sentences` (extractive, query-scored, original order
   preserved). Never write a third bespoke truncation helper — extend
   `core/services/text_utils.py` if the existing two don't fit.
5. **Compact-encode large uniform lists.** A list of ≥5 same-shaped dicts
   returned toward the model should go through `encode_compact_list`
   (CSV-style, cuts repeated-key JSON overhead) — it already no-ops below
   the size where the format-explanation overhead wouldn't pay for itself.
   Don't hand-roll a second compact format.
6. **Bound agent message history per iteration**, if you're building a new
   agentic loop (not just a tool). Reuse `agent/graph.py`'s
   `_trim_agent_messages` pattern — group-aware trimming so an
   `AIMessage(tool_calls=...)` is never separated from its `ToolMessage`s.
7. **Route tool binding by domain** for any new large tool surface —
   binding every schema on every turn is pure overhead once the tool count
   grows. Extend `agent/tools/routing.py`'s tables (optional, see §2.2)
   rather than inventing a second routing mechanism.
8. **Telemetry on every new LLM call site.** Going through `get_provider()`
   gives you `log_llm_call` for free — just pass a descriptive, unique
   `call_site` string (e.g. `"classroom.solver.hint"`) so
   `manage.py llm_cost_report` can attribute spend to it. If you add a new
   truncation point via `text_utils.py`'s helpers, `log_truncation` fires
   automatically — no action needed beyond passing `label`/`call_site`.
9. **Never duplicate a classifier/heuristic.** Exact-match text
   normalization → `text_utils.normalize_utterance`. Disclosure/entity
   signal → `salience.DISCLOSURE_MARKERS` / `salience.PROPER_NOUN_RX`. A
   near-duplicate check → `dedup.is_near_duplicate`. If your feature needs
   something close to one of these, extend it or call it — don't
   reimplement a second, slightly different version that will drift.
10. **Fail-open, never fail-closed, on any optimization layer.** A cache
    miss, a gating heuristic, a dedup check, an eval suite that can't run —
    all of these must degrade to "behave as if the optimization didn't
    exist," never to "break the primary request." This is the same
    "optimization failures don't break normal operation" convention
    `telemetry.py` states explicitly; hold every new gate/cache/heuristic
    to it.

---

## 5. Provider integration — the short version

Full rules live in CLAUDE.md's "Provider / retry conventions" and "Voice
pipeline provider selection" sections — this is the checklist for a new
call site, not a restatement:

- Get the client via `core.services.providers.get_provider(pref.provider)`,
  never `anthropic.Anthropic(...)`/`openai.OpenAI(...)`/etc. directly. Get
  the key via `get_api_key(provider)`, never `os.environ["..._API_KEY"]`
  directly and never rely on an SDK's own env lookup.
- From async code (Channels, an async tool), call `get_api_key` via
  `await asyncio.to_thread(get_api_key, provider)`.
- If you add a **fifth** provider: implement `generate_text`, `stream_text`,
  and `list_models` against `core/services/providers/base.py`'s `Provider`
  interface; verify its actual streaming/caching contract live (call the
  real SDK, inspect a real response) before implementing — every existing
  provider's streaming shape and cache token field names were live-verified,
  not guessed from docs, and DeepSeek's `prompt_cache_hit_tokens` field name
  in particular would have been wrong if guessed.
- Never wrap `@retry(...)` around a function that already converts SDK
  exceptions to `ProviderError` — see CLAUDE.md's provider/retry section for
  the exact bug this causes (`tenacity.RetryError` swallowing the original
  exception type). Split the retried network call from the
  exception-conversion wrapper, same as every existing `_provider.py`.

---

## 6. Eval harness — add coverage for anything you add

`backend/core/evals/` + `backend/<app>/evals/` is the regression harness for
every deterministic gate and cost-relevant heuristic in this codebase. Run
it with `python manage.py run_evals` (see
`core/management/commands/run_evals.py`).

- **Suite shape**: `<app>/evals/cases.py` holds static test cases (plain
  tuples/dicts, no I/O); `<app>/evals/<name>_eval.py` exposes `run() ->
  EvalResult` (`core/evals/base.py`).
- **Free suite** (`core.evals.runner.FREE_SUITE_NAMES`): zero I/O,
  deterministic, must always be runnable with no external dependency
  (Chroma, API key). This is where a new gating/routing/compression
  heuristic's test cases belong — see `memory/evals/gating_eval.py` and
  `core/evals/compression_eval.py` for the shape.
- **Cost suite** (`core.evals.runner.COST_SUITE_NAMES`): needs live Chroma
  and/or a real API key (retrieval quality, supersession judgment quality).
  Must (a) check the dependency is actually available and set
  `result.skipped_reason` — never fail the suite — if it isn't, (b) seed any
  test data under a clearly-prefixed id (`eval_rag_...`) so it can never be
  mistaken for real memory, and (c) clean up in a `finally` block so a
  mid-run exception never leaves eval pollution behind — see
  `memory/evals/rag_eval.py`.
- Register the new suite's name in `core/evals/runner.py`'s
  `run_suites()` dispatcher and the appropriate `*_SUITE_NAMES` tuple.
- A new heuristic/gate with no eval-suite cases is not done — add at least
  the free-suite cases before considering the feature complete.

---

## 7. Definition of done for a new tool / RAG feature

Apply CLAUDE.md's "Testing & review standards" 5-point checklist
(efficiency, dead code, better-way check, security, optimization) plus:

- [ ] New tool registered in `agent/tools/registry.py::ALL_TOOLS`.
- [ ] Sensitive/irreversible actions gated by `require_confirmation`, with
      everything before that call proven safe to re-run.
- [ ] Any unbounded external content bounded via `text_utils.py` before it
      reaches a prompt or a tool-result payload.
- [ ] Any new Chroma write goes through Celery, is gated cheaply before any
      LLM spend, and computes its score once at write time.
- [ ] Any new Chroma read goes through (or matches the shape of)
      `retrieve_relevant_memories` — cached, re-ranked, fail-open to `[]`.
- [ ] Any new LLM call goes through `get_provider()`/`get_api_key()`, uses
      `system`/`system_suffix` correctly, and passes a descriptive
      `call_site` to telemetry.
- [ ] Free-suite eval cases added for any new deterministic gate/heuristic;
      cost-suite cases added if it touches live Chroma/LLM quality.
- [ ] Full backend test suite passes:
      `python manage.py test agent voice memory core cv classroom outlook linkedin`
      (baseline is 117 tests with exactly one pre-existing unrelated
      failure in `agent.tests.ExtractStepsTests` — don't mistake that one
      for a regression, don't let it hide a new one).
- [ ] `python manage.py run_evals` (free suites at minimum) still passes.
- [ ] `graphify update .` run after the change, per CLAUDE.md's graphify
      section, so the knowledge graph stays current.
