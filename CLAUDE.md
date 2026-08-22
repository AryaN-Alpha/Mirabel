# Mirabel — Project Guide for Claude Code

## What this project is
Mirabel is a voice assistant with a Tsundere persona, dynamic 2D sprite reactions,
emotional long-term memory (RAG), and agentic tool use via MCP.

## Monorepo layout
- /backend  — Django 6 + DRF, Python 3.13+
- /frontend — React 19 + Vite 6
Each side has its own .gitignore, its own dependency manifest, its own venv/node_modules.
Never cross the boundary in imports.

## Hard rules (do not violate)
1. NEVER remove imports from existing files, even if they look unused in the snippet
   you're editing. Other modules import through them.
2. Pin to the latest stable versions specified in requirements.txt and package.json.
   If you bump a dep, bump it in the manifest too — never silently.
3. JSON contract from the LLM is sacred: {"text": str, "mood": str}. Any code that
   parses Mirabel's output must validate against the allowed mood tag list in
   core/prompts/persona.py. On parse failure, fall back to mood="neutral" and log.
4. No auth/security theater in Phase 1. Single hardcoded user. Add real auth in Phase 4.
5. Secrets only via .env (loaded by python-dotenv on backend, import.meta.env on frontend).
   .env files are gitignored; .env.example files are committed and exhaustive.

## Phase tracking
We are currently on: Phase 3 (The Voice).
Do not implement Phase 4+ features (MCP, tool use) until explicitly told.

## Phase 2 additions

We now have:
- Redis (broker + result backend + retrieval cache)
- Celery worker + Celery beat
- ChromaDB running as an HTTP service (NOT embedded mode)
- A new Django app: `memory`

Hard rules for Phase 2:
6. Embedding writes ALWAYS go through Celery. Never call ChromaDB writes from a
   Django view — it kills latency and makes the request non-idempotent on retry.
7. Retrieval reads happen inline in the view, but wrapped in a try/except that
   falls back to empty context on any failure. Never let a memory-layer error
   break the chat endpoint.
8. The salience score is computed ONCE at write time and stored as Chroma
   metadata. Do not recompute on read — the whole point is fast retrieval.
9. ChromaDB collection naming: `mirabel_user_{user_id}`. One collection per user.
   Never share a collection across users.
10. The weekly summary task is the ONLY task allowed to write a "summary"-type
    memory back into the collection. These are tagged with role="summary" and
    have salience pinned to 0.9.

## Coding conventions
- Backend: ruff for lint/format. Type hints on every new function. Services live
  in core/services/, never in views.py.
- Frontend: function components only, hooks for state, no class components.
  Tailwind for styling; no global CSS files except index.css for resets.
- Commits: conventional commits (feat:, fix:, chore:, refactor:).

## Phase 3 additions

We now have:
- Django Channels (ASGI) replacing pure WSGI for real-time
- WebSocket endpoint /ws/chat/ alongside the existing REST /api/chat/
- Groq Whisper API for STT (fastest hosted Whisper available)
- edge-tts for TTS (free, fast, multiple voices)
- A new Django app: `voice`

REST /api/chat/ STAYS. It's the fallback for clients that can't do WebSocket
and the contract for tests. The voice path is additive, not a replacement.

Hard rules for Phase 3:
11. NEVER block the WebSocket consumer's event loop with sync I/O. All Groq,
    Anthropic, and edge-tts calls go through their async clients OR through
    asyncio.to_thread / channels.db.database_sync_to_async.
12. The streaming JSON contract: deltas are plain text (NOT partial JSON).
    The model is instructed to emit text first, then a sentinel, then the
    JSON envelope. The consumer parses the envelope only after stream end.
13. TTS chunks are emitted in order, never in parallel. Out-of-order audio
    is worse than slow audio. Use a single asyncio.Queue per turn.
14. Barge-in: if the client sends a new audio frame while the assistant is
    still speaking, the consumer cancels the in-flight LLM + TTS tasks
    immediately. asyncio.CancelledError must be handled cleanly — close
    HTTP connections, drain queues, do not leak workers.
15. Do not store raw audio. Store transcripts only. The recorded audio
    blob never touches disk; it lives in memory for the duration of one
    transcription call and is then dropped.
