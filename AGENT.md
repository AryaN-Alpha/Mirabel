# Mirabel — Agent Instructions

Voice assistant, Tsundere persona, emotional RAG memory. Monorepo:
`/backend` (Django 6 + DRF + Channels, Python 3.13+) and `/frontend` (React 19 + Vite 6).
Full detail lives in `CLAUDE.md` — this file is the condensed version for quick reference.

## Before writing any code
- Read `CLAUDE.md` for the full rules; this is a summary, not a replacement.
- Backend services live in `core/services/`, never in `views.py`.
- Frontend: function components + hooks only (no classes, except `ErrorBoundary`).
- Never remove an import you didn't add unless you can prove it's dead *in that file*.
- Never hardcode a secret, a machine-specific path, or a fallback default for a
  secret env var. Required env vars fail fast (`os.environ[...]`, no `.get(default)`).

## Every change must survive this checklist
1. **Efficiency** — cheapest correct way (no wasted retries, no N+1, no
   recomputation of something already available)?
2. **Dead code** — any unreachable branch, unused import, or exception handler that
   can never actually trigger? (Verify by tracing what the caller actually raises,
   not by reading the handler in isolation.)
3. **Better way** — does a small restructure fix a whole class of bug instead of
   patching one symptom?
4. **Security** — secrets at rest/in logs, injection surfaces, origin/auth checks on
   new network-reachable endpoints, unbounded-input/cost DoS surface.
5. **Optimization** — anything on the hot path (per-message/per-request) doing
   needless work?

Prefer live testing over reasoning in the abstract: curl the endpoint, open a
websocket, read `backend/logs/mirabel.log`, read the DB value back after a write.

## Error handling
- Backend: never let an endpoint return anything but `{"error": "..."}` JSON on
  failure — the global DRF handler in `core/exceptions.py` already guarantees this
  for uncaught exceptions; add local handling only to produce a *more specific*
  message or a graceful degraded response (HTTP 200 + `error`/`reason` flag), not to
  catch generic failures.
- Frontend: always route errors through `frontend/src/utils/errors.js`
  (`getErrorMessage`, `chatDegradedMessage`, `micErrorMessage`) instead of ad hoc
  `err.response?.data?.error || "..."`.
- Never swallow an error into total silence (bare `console.error` with no UI state
  change). Every failure path needs a user-visible, specific-as-possible message.

## Providers (`core/services/providers/*_provider.py`)
- `get_api_key(provider)` is the only correct way to get a key (DB override, then
  env var). Never construct an SDK client with no `api_key=` and let it read its own
  env var — that ignores keys set through the Settings UI. From async code, call
  `get_api_key` via `asyncio.to_thread`.
- Never `@retry` a function that also converts SDK exceptions to `ProviderError` —
  tenacity's `RetryError` on exhaustion swallows the original exception type and
  breaks downstream `except` branches. Separate the retried call from the
  conversion, use `retry_if_exception_type(_RETRYABLE)` with only genuinely
  transient errors, and pass `reraise=True`.

## Voice pipeline
`/ws/chat/` (voice) and `/api/chat/` (text) both read `ModelPreference` and use
`get_provider(pref.provider)`. Every `Provider` has `generate_text` (sync,
REST) and `stream_text` (async generator, voice). `stream_text` fetches its key
via `asyncio.to_thread(get_api_key, ...)` and is **never retried** — a mid-stream
retry would replay audio already spoken via TTS. Adding a 4th provider: verify
its SDK's actual streaming event/chunk shape live before implementing, don't
guess from docs.

## Known, intentional gaps — do not "fix" these as a side effect
- No auth (single implicit user) — planned for a later phase.
- Legacy `ProviderCredential` rows may still be plaintext until next re-saved
  (lazy migration to Fernet encryption is intentional).

## Phase status
Phases 1–3 (text chat, ChromaDB/Celery memory, Channels voice pipeline) are done.
Do not build Phase 4+ (auth, MCP/tool use, multi-provider streaming voice) unless
explicitly asked.
