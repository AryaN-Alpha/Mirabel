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
We are currently on: Phase 1 (Text-Only MVP).
Do not implement Phase 2+ features (Celery, Chroma, voice, MCP) until explicitly told.

## Coding conventions
- Backend: ruff for lint/format. Type hints on every new function. Services live
  in core/services/, never in views.py.
- Frontend: function components only, hooks for state, no class components.
  Tailwind for styling; no global CSS files except index.css for resets.
- Commits: conventional commits (feat:, fix:, chore:, refactor:).
