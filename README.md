# Mirabel — Tsundere Voice Assistant

A voice assistant with a Tsundere persona, a live voice-reactive frequency
visualizer, and emotional long-term memory (RAG).

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

## LinkedIn integration

1. Go to https://www.linkedin.com/developers/apps and create an app (you'll
   need an associated LinkedIn Page — LinkedIn requires one even for a
   personal-use app).
2. Under the app's **Products** tab, request:
   - **Sign In with LinkedIn using OpenID Connect** — grants the
     `openid profile email` scopes (auto-approved).
   - **Share on LinkedIn** — grants `w_member_social`, needed to publish
     posts and comments (auto-approved).
3. Under **Auth**, add an **Authorized redirect URL** that exactly matches
   `LINKEDIN_REDIRECT_URI` below (`http://localhost:8000/api/linkedin/auth/callback/`
   for local dev).
4. Copy the app's **Client ID** and **Client Secret** (Auth tab) into
   `backend/.env`:
   ```
   LINKEDIN_CLIENT_ID=...
   LINKEDIN_CLIENT_SECRET=...
   LINKEDIN_REDIRECT_URI=http://localhost:8000/api/linkedin/auth/callback/
   LINKEDIN_SCOPES=openid profile email w_member_social
   LINKEDIN_API_VERSION=202401
   LINKEDIN_ENABLE_REFRESH_TOKEN=False
   ```
5. Restart the backend, open the **LinkedIn** tab in the sidebar, and click
   **Connect with LinkedIn**.

**Known limits of a standard (non-partner) LinkedIn app**, so nothing here
silently fails:
- **No headline/title.** The OpenID Connect scopes above return name, email,
  and picture — not headline. That requires a separate, partner-approved
  Profile product.
- **No refresh tokens.** Access tokens last ~60 days; standard apps don't get
  a refresh token to renew them silently. `LINKEDIN_ENABLE_REFRESH_TOKEN`
  stays `False` unless LinkedIn has granted your app that (partner-only) — when
  a token expires, use the "Reconnect LinkedIn" button instead.
- **No reading other people's posts.** Replying to a post requires pasting in
  what it says yourself — there's no standard-tier read access to arbitrary
  post content, feeds, connections, or notifications.
