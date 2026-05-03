# Mirabel — Tsundere Voice Assistant

A voice assistant with a Tsundere persona, dynamic 2D sprite reactions,
emotional long-term memory (RAG), and agentic tool use via MCP.

## Monorepo layout
- `/backend` — Django 6 + DRF, Python 3.13+
- `/frontend` — React 19 + Vite 6

## Quick start (Phase 1)
```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # fill in your secrets
python manage.py migrate
python manage.py runserver

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```
