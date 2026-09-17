# Mirabel — Agent Instructions

Voice assistant, Tsundere persona, emotional RAG memory. Monorepo:
`/backend` (Django 6 + DRF + Channels, Python 3.13+) and `/frontend` (React 19 + Vite 6).
Full detail lives in `CLAUDE.md` — this file is the condensed version for quick reference.

## ⚠️ CRITICAL NON-NEGOTIABLE PRODUCTION RULES (ALL AGENTS)

> **LIVE PRODUCTION SYSTEM WITH 20+ MONTHS OF IRREPLACEABLE DATA**  
> This application is running live in production with sensitive, mission-critical data gathered over 20 months of work. Any data loss or downtime is catastrophic. Every AI agent MUST strictly follow these 6 rules:

1. **Zero Data Loss & Data Integrity (20 Months of Production Data)**:
   - Under NO circumstances may any change alter, corrupt, truncate, drop, or delete existing production data.
   - Database migrations must be purely additive, non-destructive, and backward-compatible (e.g. nullable fields, sensible defaults, new tables only).
   - NEVER drop tables, drop columns, or run destructive raw SQL / flush commands (`flush`, `reset_db`).
   - ChromaDB collections (`mirabel_memories`) and stored vector embeddings must NEVER be wiped, re-initialized, or bulk deleted without explicit instruction.

2. **Production Reliability & Mandatory Comprehensive Testing**:
   - The application is live in production; no modification may break the running system.
   - Test every change thoroughly before marking it complete: run backend/frontend tests, verify type checks and linting, and perform real runtime verification (check server logs in `backend/logs/mirabel.log`, test API endpoints, check WebSockets, inspect DB values after writes). Never assume code works simply because it compiles.

3. **Strict Backward Compatibility (Protect Existing Features)**:
   - New features must NEVER break, regress, or silently degrade existing features or contracts.
   - Retain existing API response contracts, WebSocket payload schemas, and fallback behaviors (e.g. REST fallback for chat, graceful degradation when services are unavailable).

4. **Pragmatic Engineering — Strictly NO Over-Engineering**:
   - Keep all implementations simple, clean, direct, and maintainable.
   - Do NOT add unnecessary abstraction layers, superfluous wrappers, speculative generalization, or redundant dependencies. Adhere to YAGNI ("You Aren't Gonna Need It"). Solve the exact requirement with the minimal blast radius.

5. **Clarify Requirements & Proactively Recommend Better Solutions**:
   - NEVER assume requirements when details are ambiguous or underspecified. Ask clarifying questions until requirements and constraints are 100% clear.
   - If you see a more optimal, standard, secure, or cost-effective architecture or solution, proactively suggest and recommend it before proceeding.

6. **Mandatory Post-Change Self-Audit Checklist**:
   After designing, implementing, or modifying any code, you MUST ask yourself and verify:
   i. *Is this the most efficient way to do it?* (Cheapest correct path, no N+1 queries, no wasted compute/retries).
   ii. *Is this the most secure way?* (Secrets protected, input validated, auth/origin checked, no leaks).
   iii. *Did it break any previous feature?* (Backward compatibility, existing tests, no regression in data flow).
   iv. *Is this the most optimized way? Did we overengineer anything?* (Clean, minimal, readable, maintainable).

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
