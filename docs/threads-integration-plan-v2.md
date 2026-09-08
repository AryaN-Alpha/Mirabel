# Meta Threads Integration — Revised Implementation Plan (v2)

This revises the original plan against Meta's current Threads API documentation. The overall architecture (mirror LinkedIn's app structure) is sound — the changes below are corrections, compliance gaps, and reliability hardening that will save you from production surprises. Nothing here throws away your structure; it's additive.

---

## 1. Facts to correct or verify before coding

A few details in the original plan are slightly off or need to be pinned down against Meta's live docs (this API has changed shape more than once in 2025–2026):

| Item | Original plan said | Current reality |
|---|---|---|
| OAuth authorize domain | `https://threads.net/oauth/authorize` | Meta has been consolidating on **`https://www.threads.com/oauth/authorize`** for the authorization dialog, while API calls still go to `graph.threads.net` (or the newer `graph.threads.com`, which is now interchangeable). **Confirm the exact authorize URL in your app's dashboard at implementation time** — don't hardcode from memory. |
| Scopes | Not itemized | Threads uses five granular permissions, not one blanket scope: `threads_basic` (required for every call), `threads_content_publish` (publishing), `threads_manage_replies` (POST replies), `threads_read_replies` (GET replies), `threads_manage_insights` (insights). A `threads_delete` scope also exists if you ever add post deletion. Request only what each feature needs. |
| App Review gating | Not mentioned | `threads_content_publish`, `threads_manage_replies`, and `threads_manage_insights` only work for **testers** until each permission clears Meta App Review (2–6 weeks is typical) and the app is published. Build and demo against tester accounts first; budget the review cycle into your timeline — it's the actual critical path, not the code. |
| Token refresh window | "Refreshes tokens" | A long-lived token can only be refreshed once it's **at least 24 hours old and not yet expired** — refreshing earlier silently returns the same token with the same expiry. Refresh jobs need to account for this, not just "refresh before expiry." |
| Permission grant vs. token expiry | Not distinguished | These are two different clocks: the **token** lasts 60 days and is refreshable. The **permission grant** behind it lasts 90 days for public profiles (and is extended automatically when you refresh the token) but **cannot be extended for private profiles** — those users must re-authorize from scratch. Your credential model and reconnect UX need to know which case they're in. |
| Rate limits | Not mentioned at all | Threads enforces **250 published posts / 24h**, plus separate rolling caps for replies (documented at 1,000/24h) and other write actions. Meta has changed these numbers without notice before, so **don't hardcode them** — query `GET /{threads-user-id}/threads_publishing_limit` and cache the result briefly. |
| Media containers | Described as a flat 2-step create-then-publish | For **video and carousel** containers, you must poll `GET /{creation_id}?fields=status` until it reports `FINISHED` before calling `threads_publish` — publishing too early fails. Unpublished containers also **expire after 24 hours**. Text/single-image containers are usually fast but the plan should still check status defensively rather than assuming instant readiness. |
| Media hosting | Not mentioned | Threads fetches image/video files from a **publicly reachable URL** at the moment it processes the container — it cannot pull from an authenticated internal storage endpoint. Any image the user attaches needs to be served from a public (or short-lived signed public) URL, not from behind Mirabel's normal auth-gated media routes. |
| Meta compliance callbacks | Not mentioned | The Threads use case in the Meta App Dashboard requires a **Deauthorize Callback URL** and a **Data Deletion Requests URL** to pass review. These need real backend endpoints, not placeholders — see §3. |

None of this changes your architecture; it changes what `oauth.py`, `publishing.py`, and the automation scheduler need to actually do.

---

## 2. Updated open questions

Keep your original five, plus these:

6. **Multi-account / agency use** — `ThreadsCredential` is proposed as a global singleton (`pk=1`), matching LinkedIn. Is Mirabel single-tenant per deployment (one Threads account per install), or will an agency user need to connect **multiple** client Threads accounts from one Mirabel instance? If the latter, the singleton pattern needs to become a per-user/per-workspace foreign key now rather than retrofitted later.
7. **Post deletion** — Now that `threads_delete` is a real scope, do you want a `delete_threads_post` capability (agent tool + UI action) in this phase, or explicitly out of scope?
8. **Tester-only launch** — Given App Review takes weeks, are you OK shipping to internal/tester Threads accounts first and enabling it for all users once `threads_content_publish` clears review?
9. **Private vs. public profile handling** — Should the UI proactively warn a user with a private Threads profile that their connection will need manual re-auth every 90 days (since it can't be silently refreshed), or should we treat that as a background failure surfaced only when it actually happens?

---

## 3. Architecture additions

### 3.1 Compliance endpoints (new, not optional)

```
backend/threads/
├── views.py   [ADD]  deauthorize_callback(request)      -> POST, Meta pings on disconnect
│                     data_deletion_callback(request)     -> POST, Meta pings on deletion request
```

- `deauthorize_callback`: parse Meta's signed request, locate the credential by `threads_user_id`, revoke/delete it, log the event.
- `data_deletion_callback`: parse the signed request (HMAC-SHA256 verify against `THREADS_APP_SECRET`), purge `ThreadsCredential`, `ThreadsDraft`, and profile snapshot rows tied to that user, then respond with the required `{ "url": "...", "confirmation_code": "..." }` JSON pointing to a status page.
- Register both URLs in the Meta App Dashboard under the Threads use case Settings page (`Deauthorize callback URL`, `Data Deletion Requests URL`) — App Review will not pass without them.

### 3.2 Model additions

```python
# ThreadsCredential — add fields
is_private_profile = models.BooleanField(default=False)   # governs 90-day re-auth behavior
permission_expires_at = models.DateTimeField(null=True)   # separate from token_expires_at
needs_reauth = models.BooleanField(default=False)         # surfaced in Settings tab

# New: track dynamic rate limits instead of hardcoding
class ThreadsRateLimitSnapshot(models.Model):
    fetched_at = models.DateTimeField(auto_now_add=True)
    quota_usage = models.IntegerField()
    quota_total = models.IntegerField()
    reply_quota_usage = models.IntegerField(null=True)
    delete_quota_usage = models.IntegerField(null=True)
    raw_response = models.JSONField()

# ThreadsDraft — add fields
container_id = models.CharField(max_length=64, blank=True)     # creation_id from step 1
container_status = models.CharField(max_length=32, blank=True) # IN_PROGRESS/FINISHED/ERROR/EXPIRED
container_expires_at = models.DateTimeField(null=True)
idempotency_key = models.UUIDField(default=uuid4, unique=True) # guards double-publish from retries/double-clicks
parent_thread_id = models.CharField(max_length=64, blank=True) # for replies, tracks conversation
```

### 3.3 Service layer changes

**`oauth.py`**
- Verify the `state` param against a server-stored value on callback (CSRF protection) — not explicit in the original plan.
- Refresh job logic must check `token_age >= 24h AND not expired` before calling refresh; skip (not error) tokens younger than 24h.
- On refresh success, update `permission_expires_at` (+90 days) only if `is_private_profile` is False; otherwise leave it and flag `needs_reauth` once it's within a few days of expiring.

**`publishing.py`**
- After creating a container, branch on media type:
  - Text/image: attempt publish, but retry once on a transient "not ready" error before failing.
  - Video/carousel: poll status (start at ~5s, back off to ~15–30s) until `FINISHED`, `ERROR`, or `EXPIRED`; surface `ERROR`/`EXPIRED` back to the draft with a clear user-facing message rather than a generic failure.
- Before every publish/reply/delete call, check a cached `ThreadsRateLimitSnapshot` (refresh if stale >5 min); block the action client-side with a clear "daily limit reached, resets in Xh" message instead of letting Meta reject it.
- Use `idempotency_key` to make retried publish attempts (e.g., from a flaky network or a Celery task retry) safe — check for an existing successful `threads_post_id` on the draft before re-attempting.
- Serve attached images from a public URL (e.g., a short-lived signed CDN/S3 URL rather than an authenticated Django media route) so Meta's fetch step can actually reach the file.

**`client.py`**
- Centralize error handling for Meta's specific error/subcode structure (`error.code`, `error.error_subcode`) so rate-limit (code 4/17/32/613-style) and permission errors are distinguishable from generic failures, since your Celery tasks and agent tools need to react differently to each (retry vs. surface-to-user vs. flag-for-reauth).

### 3.4 Celery automation additions

- `refresh_threads_tokens` (daily): iterate credentials where token age ≥ 24h and < 55 days (buffer before the 60-day cliff), refresh, update `needs_reauth` on failure.
- `sync_threads_rate_limit` (hourly or before automations run): pull `threads_publishing_limit`, write a `ThreadsRateLimitSnapshot`, so the UI/automations/agent always read a recent cached value instead of hitting the endpoint on every action.
- Alert (log/Sentry/whatever Mirabel already uses for Celery failures) on repeated refresh failures — a silently expired connection is the most common Threads-integration failure mode in the wild.

### 3.5 Agent tools additions

- `check_threads_rate_limit` — lets the agent check quota before attempting a write, so it can tell the user "you're at 240/250 posts today" instead of failing opaquely.
- `delete_threads_post` (if in scope per open question 7) — irreversible, gate with `require_confirmation` like `publish_threads_draft`.

---

## 4. Frontend adjustments

- **Character counter**: match Meta's counting behavior for emoji/multi-byte characters — use `Intl.Segmenter` (grapheme clusters) rather than raw JS `.length`, or your live counter will disagree with the server's 500-char validation on emoji-heavy posts.
- **Live quota display**: surface `quota_usage / quota_total` from the cached `ThreadsRateLimitSnapshot` in the composer and Overview tab, not just after a failed publish.
- **Reconnect banner**: in Settings, distinguish "token expiring soon, will auto-refresh" from "this account is private and needs you to manually reconnect" — these are different user actions per §1's permission-grant note.
- **Container-processing state**: if you add video/carousel later, the composer needs a visible "processing…" state between submit and publish, since that step can take real seconds rather than being instant like LinkedIn's flow.

---

## 5. Testing additions

- Keep the mocked-HTTP-client approach for unit tests (good, matches LinkedIn's pattern).
- Add a small set of **fixture/contract tests** built from real (sanitized) Meta API response shapes for: container creation, container status polling (`IN_PROGRESS`/`FINISHED`/`ERROR`/`EXPIRED`), `threads_publishing_limit`, and error responses. Pure hand-written mocks tend to encode what you *assume* the API returns rather than what it actually returns, and this API's shape has shifted before.
- Add a test for the OAuth `state` CSRF check, the data-deletion callback signature verification, and the "refresh attempted before 24h old" no-op case — these are exactly the edge cases that don't show up until production.

---

## 6. Revised verification plan

Same automated/manual verification as the original, plus:

- Confirm the Threads use case in the Meta App Dashboard has `Deauthorize Callback URL` and `Data Deletion Requests URL` configured and reachable before submitting for App Review.
- Do a full OAuth → publish → reply → refresh cycle against a **tester** account before requesting App Review, since `threads_content_publish` / `threads_manage_replies` / `threads_manage_insights` won't work for non-tester users until then.
- Manually force a token to be < 24h old and confirm the refresh job correctly no-ops instead of erroring.
- Manually exhaust (or mock exhaustion of) the daily post quota and confirm the composer blocks with a clear message rather than surfacing Meta's raw error.

---

## Sources

- [Threads API overview & rate limiting](https://developers.facebook.com/docs/threads/overview/)
- [Threads API get started / permissions](https://developers.facebook.com/documentation/threads/get-started)
- [Threads long-lived tokens](https://developers.facebook.com/docs/threads/get-started/long-lived-tokens/)
- [Threads reply management & rate limits](https://developers.facebook.com/docs/threads/retrieve-and-manage-replies)
- [Threads delete posts](https://developers.facebook.com/docs/threads/posts/delete-posts)
- [Threads use case dashboard settings (deauthorize / data deletion URLs)](https://developers.facebook.com/documentation/development/create-an-app/threads-use-case)
- [Meta data deletion request callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/)
