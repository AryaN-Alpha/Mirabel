# Mirabel — Project Guide for Claude Code

## What this project is
Mirabel is a voice assistant with a Tsundere persona, a live voice-reactive frequency
visualizer, and emotional long-term memory (RAG).

## Monorepo layout
- /backend  — Django 6 + DRF, Python 3.13+
- /frontend — React 19 + Vite 6
Each side has its own .gitignore, its own dependency manifest, its own venv/node_modules.
Never cross the boundary in imports.

## Hard rules (do not violate)
1. NEVER remove imports from existing files, even if they look unused in the snippet
   you're editing. Other modules import through them. (Exception: an import you can
   *prove* is dead in that exact file — e.g. a logger nothing calls — may go, but say so.)
2. Pin backend deps to exact versions in requirements.txt (`==`); frontend deps use
   caret ranges (`^`) per npm convention, locked via package-lock.json. If you bump a
   dep, bump it in the manifest too — never silently.
3. JSON contract from the LLM is sacred: {"text": str, "mood": str}. Any code that
   parses Mirabel's output must validate against the allowed mood tag list in
   core/prompts/persona.py. On parse failure, fall back to mood="neutral" and log.
4. No auth/multi-user system yet — single hardcoded user (ModelPreference is a global
   singleton, pk=1). This is a deliberate, tracked gap, not an oversight — see
   "Known gaps" below. Do not bolt on partial auth; do it properly, as its own task.
5. Secrets only via .env (loaded by python-dotenv on backend, import.meta.env on
   frontend). .env is gitignored; .env.example is committed and exhaustive.
   Required backend env vars (app refuses to start without them, by design —
   see "Security conventions"): DJANGO_SECRET_KEY, DB_PASSWORD, CREDENTIAL_ENCRYPTION_KEY.
   Never add a hardcoded fallback value for a secret (e.g. `os.getenv("DB_PASSWORD", "...")`)
   — that was a real bug fixed in this repo's history. Fail fast with `os.environ[...]`
   instead so a missing secret is loud, not a silent weak default.

## Coding conventions
- Backend: ruff for lint/format. Type hints on every new function. Services live
  in core/services/, never in views.py.
- Frontend: function components only, hooks for state, no class components
  (ErrorBoundary is the sole justified exception — React requires a class for
  componentDidCatch). Tailwind for styling; no global CSS files except index.css.
- Commits: conventional commits (feat:, fix:, chore:, refactor:).

## Error handling conventions
Every user-facing failure must say *what* went wrong, not just that something did.
- **Backend**: `core/exceptions.py` has a DRF `EXCEPTION_HANDLER` wired in settings.py
  that normalizes every error response to `{"error": "<message>"}` JSON and logs
  uncaught exceptions with `exc_info=True`. Don't add per-view try/except for generic
  "something broke" cases — the global handler already covers that. Do add local
  try/except only when you can produce a *more specific* message or need a fallback
  value (e.g. `generate_reply()` catching provider failures to keep the chat endpoint
  at HTTP 200 with an `error`/`reason` flag instead of hard-failing the request).
- **Frontend**: use `frontend/src/utils/errors.js` (`getErrorMessage`,
  `chatDegradedMessage`, `micErrorMessage`) at every catch site instead of ad hoc
  `err.response?.data?.error || "..."` — it correctly distinguishes a backend-provided
  message, a network/unreachable-server error, and an unexpected error.
- **LLM/provider failures never crash the request.** `generate_reply()` always
  returns a dict; on failure it sets `error: True` and a coarse `reason` ("provider"
  or "unknown") instead of raising. Never pass the raw provider exception string to
  the client — log it server-side only; expose just the coarse reason.
- **Voice/WebSocket**: `voice/consumers.py` catches per-turn/per-utterance, logs via
  `logger.exception`, and sends `{"type": "error", "message": "..."}" to the client.
  `useVoiceSession.js` turns that into a `wsError` string the UI renders — don't let
  a new error path go to `console.error` only.

## Provider / retry conventions
- Every provider (`core/services/providers/*_provider.py`) separates the retried
  network call from the try/except that converts SDK errors to `ProviderError`.
  **Never let `@retry` wrap a function that already converts exceptions to
  `ProviderError`** — tenacity's default behavior on exhausted retries raises
  `tenacity.RetryError`, not the original exception, which silently breaks any
  `except ProviderError` / `except SpecificSDKError` branch downstream (this was a
  real, verified bug: retrying a "no API key configured" failure 3 times with
  exponential backoff, then losing the original error type entirely). The pattern:
  ```python
  @retry(stop=..., wait=..., retry=retry_if_exception_type(_RETRYABLE), reraise=True)
  def _call(self, client, **kwargs): return client.some_method(**kwargs)

  def generate_text(self, ...):
      if not api_key: raise ProviderError(...)   # never retried — fails instantly
      try:
          response = self._call(client, ...)
      except sdk.APIError as exc:
          raise ProviderError(str(exc)) from exc
  ```
- `_RETRYABLE` must only include genuinely transient exception types (connection
  errors, timeouts, rate limits, 5xx/internal-server-errors) — never auth/bad-request/
  not-found errors, which will never succeed on retry and just add latency.
- `get_api_key(provider)` (core/services/providers/credentials.py) is the *only*
  correct way to obtain a provider API key — it checks the DB-stored credential
  first, then falls back to the env var. Never instantiate an SDK client with no
  `api_key=` argument (relying on the SDK's own env lookup) — that silently ignores
  any key the user configured through the Settings UI. This was a real bug in both
  `voice/consumers.py` and `memory/services/summary.py`; both now call `get_api_key`.
  `get_api_key` does a sync DB query — from async code (Channels consumers), call it
  via `asyncio.to_thread`, never directly.

## Security conventions
- `ProviderCredential.api_key` is encrypted at rest with Fernet
  (`CREDENTIAL_ENCRYPTION_KEY` env var). Write through `cred.set_api_key(raw)`,
  read through `cred.get_api_key()` — never touch `.api_key` directly except in
  migrations. `get_api_key()` gracefully falls back to treating an undecryptable
  value as legacy plaintext (rows written before encryption was added keep working
  until next re-saved through the Settings UI, which re-encrypts them). Do not
  "clean this up" into a hard failure — the fallback is intentional.
- The WebSocket route (`mirabel/asgi.py`) is wrapped in `AllowedHostsOriginValidator`.
  Do not remove it — without it, any external website can open a connection to
  `/ws/chat/` and trigger billed LLM/TTS calls (browsers don't enforce CORS for
  WebSocket). If a legitimate client ever gets a 403 on connect, the fix is adding
  its origin to `ALLOWED_HOSTS`, not removing the validator.
- `chat` view enforces `MAX_MESSAGE_LENGTH` (4000 chars) — a cheap guard against
  runaway per-request LLM cost. Keep validation guards like this cheap and in the
  view, not in a shared "security" abstraction layer.
- Never hardcode a machine-specific path (a dev's username, a personal install
  path) into a settings file — it was done once for FFMPEG_DIR and is now an
  optional env var instead. Anything environment- or machine-specific belongs in
  .env, not committed code.

## Testing & review standards
Apply this checklist to any non-trivial change, not just when explicitly asked:
1. **Efficiency** — is there a cheaper way to do this (fewer queries, no wasted
   retries/roundtrips, no re-computation of something already available)?
2. **Dead code** — did this change leave behind an unused import, an unreachable
   except branch, a variable nothing reads? (Tenacity's RetryError swallowing the
   `except ProviderError` branch was exactly this kind of bug — verify branches are
   actually reachable, don't just assume from reading the code.)
3. **Is there a better way** — would a small restructure (e.g. separating a retried
   call from its error-conversion wrapper) fix a whole class of bug instead of one
   symptom?
4. **Security** — secrets at rest, secrets in logs/error messages sent to the
   client, injection surfaces, auth/origin checks on any new network-reachable
   endpoint, cost/DoS surface (unbounded input, unbounded retries).
5. **Optimization** — for anything hit on every request/message (salience scoring,
   sentence segmentation, retrieval re-ranking), confirm it isn't doing needless
   work per call — see the `_SENTENCE_END_HINT` guard in `sentence_buffer.py` for
   the existing pattern (skip the expensive pass until a cheap check says it's worth it).

Prefer testing for real over reasoning about code in the abstract: hit the running
endpoints (curl/websockets client), check `backend/logs/mirabel.log` for what
actually happened, read the DB value back after a write. A log line that reads
`RetryError[<Future ... raised ProviderError>]` is worth more than any amount of
static reading — it's how the retry/reraise bug above was actually found.

## Voice pipeline provider selection
Both `/api/chat/` (REST, text) and `/ws/chat/` (WebSocket, voice) read
`ModelPreference.current()` and call `get_provider(pref.provider)` — the voice
consumer no longer hardcodes Anthropic. Each `Provider` implements both
`generate_text` (sync, one-shot — used by REST) and `stream_text` (async generator
— used by voice). Key differences from the sync path:
- `stream_text` fetches its API key via `asyncio.to_thread(get_api_key, ...)`
  since it runs on the async Channels event loop; `generate_text` calls
  `get_api_key` directly since its callers are sync.
- `stream_text` is **never retried** — unlike `generate_text`'s tenacity retry on
  transient errors, retrying mid-stream after partial text has already been sent
  to the client and partially spoken via TTS would replay/duplicate audio. A
  streaming failure just surfaces as `{"type": "error", "message": "generation error"}`.
- The exact per-SDK streaming call shape differs (Anthropic:
  `client.messages.stream(...)` / `stream.text_stream`; OpenAI:
  `client.responses.stream(...)`, filtering `response.output_text.delta` events;
  Gemini: `await client.aio.models.generate_content_stream(...)`, then
  `chunk.text` per chunk). If you add a fourth provider, verify its actual SDK
  streaming contract live before implementing — don't guess the event/chunk shape
  from docs alone (this is how the other three were verified).
- The `<<<META>>>` sentinel protocol (`voice/services/protocol.py`) is plain-text
  instruction-following, not a provider-native structured-output feature, so its
  reliability may vary by model/provider — Anthropic and Gemini have been
  live-verified to follow it; OpenAI's behavior here hasn't been (no key was
  configured at time of writing).

## Known gaps (tracked, not oversights)
- **No auth.** Single implicit user. Planned for a future phase — don't add partial
  auth as a side effect of an unrelated feature.
- **Legacy plaintext credentials**: any `ProviderCredential` row saved before
  encryption was added stays plaintext until the user re-saves it through Settings.
  This is intentional lazy migration, not a bug.
- **Dev environment hygiene**: this repo has previously accumulated orphaned
  `manage.py runserver` / `vite` processes across sessions (found 4 stacked backend
  instances and a stray frontend instance during one review). Check
  `Test-NetConnection` / `Get-NetTCPConnection` before assuming a port is free, and
  don't blindly layer another dev server on top of an existing one.

## Phase tracking
Phase 1 (text chat scaffold), Phase 2 (ChromaDB + Celery emotional memory), and
Phase 3 (Channels WebSocket voice pipeline, Groq STT, edge-tts) are all implemented.
Do not implement Phase 4+ features (auth, MCP/tool use, multi-provider streaming
voice) until explicitly told.

### Phase 2 rules (memory)
- Embedding writes ALWAYS go through Celery. Never call ChromaDB writes from a
  Django view — it kills latency and makes the request non-idempotent on retry.
- Retrieval reads happen inline in the view, wrapped in try/except that falls back
  to empty context on any failure. Never let a memory-layer error break the chat
  endpoint (`retrieve_relevant_memories` already does this — keep the pattern).
- Salience is computed ONCE at write time, stored as Chroma metadata. Never
  recompute on read.
- One ChromaDB collection (`mirabel_memories`) — this app has exactly one user.
- The weekly summary task is the ONLY task allowed to write a "summary"-type
  memory back into the collection (role="summary", salience pinned to 0.9).

### Phase 3 rules (voice)
- REST `/api/chat/` STAYS — it's the fallback for non-WebSocket clients and the
  test contract. The voice path is additive, not a replacement.
- NEVER block the WebSocket consumer's event loop with sync I/O. Groq/Anthropic/
  edge-tts calls go through async clients OR `asyncio.to_thread` /
  `channels.db.database_sync_to_async`.
- Streaming contract: plain text first, then the `<<<META>>>` sentinel, then a JSON
  envelope (see `voice/services/protocol.py`). Parse the envelope only after stream end.
- TTS chunks are emitted in order, never in parallel — one `asyncio.Queue` per turn.
- Barge-in: a new audio frame while the assistant is speaking cancels the in-flight
  LLM + TTS tasks immediately. Handle `asyncio.CancelledError` cleanly.
- Do not store raw audio. Transcripts only.

## Extending the system (new tools, RAG features, LLM call sites)
Full rules, reusable patterns, and a definition-of-done checklist live in
`docs/EXTENDING.md` — read it before adding an agent tool
(`agent/tools/*_tools.py`), a new Chroma write/read pipeline
(`memory/services/*`), or any new call site that hits an LLM provider. It is
the detailed companion to this file's Provider/Security/Testing sections
above, written specifically so new work reuses the existing tool registry,
domain-routed tool binding, salience/gating/dedup/supersession pipeline, and
provider-caching conventions instead of re-deriving (or accidentally
undoing) them. Don't duplicate its content here — keep this file the
"hard rules" reference and that one the "how do I add X" reference.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
