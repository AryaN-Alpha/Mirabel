import logging
import time
from django.conf import settings
from django.utils import timezone

from threads.models import ThreadsCredential, ThreadsDraft, ThreadsRateLimitSnapshot
from threads.services import client, oauth
from threads.services.oauth import ThreadsError

logger = logging.getLogger("threads")

MAX_POST_LENGTH = 500
MAX_POLL_ATTEMPTS = 5
POLL_INTERVAL_SECONDS = 2


def _check_rate_limit(cred: ThreadsCredential, is_reply: bool = False) -> None:
    """Pre-flight check against cached rate-limit snapshot to prevent hitting Meta's hard wall."""
    snapshot = ThreadsRateLimitSnapshot.latest()
    now = timezone.now()

    # If no snapshot or older than 5 minutes, try refreshing
    if not snapshot or (now - snapshot.fetched_at).total_seconds() > 300:
        try:
            token = oauth.get_active_access_token()
            data = client.get_publishing_limit(token, cred.threads_user_id)
            usage = data.get("data", [{}])[0] if isinstance(data.get("data"), list) and data["data"] else data
            snapshot = ThreadsRateLimitSnapshot.objects.create(
                quota_usage=usage.get("quota_usage", 0),
                quota_total=usage.get("config", {}).get("quota_total", 250),
                reply_quota_usage=usage.get("reply_quota_usage"),
                reply_quota_total=usage.get("reply_config", {}).get("quota_total"),
                raw_response=data,
            )
        except Exception as exc:
            logger.warning("threads.publishing: failed to refresh rate limit snapshot: %s", exc)

    if snapshot:
        if is_reply and snapshot.reply_quota_total and snapshot.reply_quota_usage is not None:
            if snapshot.reply_quota_usage >= snapshot.reply_quota_total:
                raise ThreadsError(
                    f"Daily Threads reply limit reached ({snapshot.reply_quota_usage}/{snapshot.reply_quota_total}). "
                    "Limit resets every 24 hours.",
                    reason="rate_limited",
                )
        elif snapshot.quota_total and snapshot.quota_usage >= snapshot.quota_total:
            raise ThreadsError(
                f"Daily Threads publishing limit reached ({snapshot.quota_usage}/{snapshot.quota_total}). "
                "Limit resets every 24 hours.",
                reason="rate_limited",
            )


def _resolve_image_url(draft: ThreadsDraft) -> str | None:
    if not draft.image:
        return None
    url = draft.image.url
    if url.startswith("http://") or url.startswith("https://"):
        return url
    base_url = getattr(settings, "BASE_URL", "http://localhost:8000")
    return f"{base_url.rstrip('/')}{url}"


def publish_draft(draft: ThreadsDraft) -> dict:
    """Publishes a ThreadsDraft to Meta Threads using the 2-step container workflow."""
    if not draft.body.strip() and not draft.image:
        raise ThreadsError("Cannot publish an empty Threads draft.", reason="post_rejected")

    if len(draft.body) > MAX_POST_LENGTH:
        raise ThreadsError(
            f"Draft exceeds Meta Threads maximum length of {MAX_POST_LENGTH} characters "
            f"(current: {len(draft.body)}).",
            reason="post_rejected",
        )

    # Idempotency guard: don't double-publish
    if draft.threads_post_id and draft.status == ThreadsDraft.Status.PUBLISHED:
        return {
            "published": True,
            "post_id": draft.threads_post_id,
            "permalink": draft.permalink,
            "already_published": True,
        }

    cred = ThreadsCredential.current()
    token = oauth.get_active_access_token()
    if not cred.threads_user_id:
        raise ThreadsError("Threads user ID is not available. Please reconnect.", reason="not_connected")

    # Rate limit pre-flight
    _check_rate_limit(cred, is_reply=bool(draft.parent_thread_id))

    image_url = _resolve_image_url(draft)
    media_type = "IMAGE" if image_url else "TEXT"

    # Step 1: Create Container
    container_id = client.create_media_container(
        token,
        cred.threads_user_id,
        text=draft.body,
        media_type=media_type,
        image_url=image_url,
        reply_to_id=draft.parent_thread_id or None,
        reply_control=draft.reply_control,
        link_attachment=draft.link_url or None,
    )
    draft.container_id = container_id
    draft.container_status = "IN_PROGRESS"
    draft.container_expires_at = timezone.now() + timezone.timedelta(hours=24)
    draft.save(update_fields=["container_id", "container_status", "container_expires_at"])

    # Step 2: Defensive readiness check / polling
    # For text, Meta containers are typically instant. For images, a brief wait is recommended.
    time.sleep(1)
    status_data = {}
    for attempt in range(MAX_POLL_ATTEMPTS):
        try:
            status_data = client.get_container_status(token, container_id)
            c_status = status_data.get("status", "").upper()
            if c_status == "FINISHED":
                draft.container_status = "FINISHED"
                break
            elif c_status == "ERROR":
                err_msg = status_data.get("error_message") or "Meta container processing failed."
                draft.container_status = "ERROR"
                draft.save(update_fields=["container_status"])
                raise ThreadsError(f"Threads container error: {err_msg}", reason="post_rejected")
            elif c_status == "EXPIRED":
                draft.container_status = "EXPIRED"
                draft.save(update_fields=["container_status"])
                raise ThreadsError("Threads container expired before publication.", reason="post_rejected")
        except ThreadsError as err:
            if err.reason == "post_rejected":
                raise
            # Continue to retry if transient
            pass

        if attempt < MAX_POLL_ATTEMPTS - 1:
            time.sleep(POLL_INTERVAL_SECONDS)

    # Step 3: Publish Container
    try:
        post_id = client.publish_container(token, cred.threads_user_id, container_id)
    except ThreadsError as exc:
        # If Meta reports container still processing, do one extra retry
        if "not ready" in str(exc).lower():
            time.sleep(3)
            post_id = client.publish_container(token, cred.threads_user_id, container_id)
        else:
            draft.container_status = "ERROR"
            draft.save(update_fields=["container_status"])
            raise

    # Step 4: Finalize Draft record
    handle = cred.username or cred.threads_user_id
    permalink = f"https://www.threads.net/@{handle}/post/{post_id}"

    draft.status = ThreadsDraft.Status.PUBLISHED
    draft.threads_post_id = post_id
    draft.permalink = permalink
    draft.container_status = "FINISHED"
    draft.save(update_fields=["status", "threads_post_id", "permalink", "container_status", "updated_at"])

    logger.info("threads.publishing: successfully published draft %s as post %s", draft.id, post_id)
    return {
        "published": True,
        "post_id": post_id,
        "permalink": permalink,
    }


def publish_reply(parent_thread_id: str, message: str) -> dict:
    """Directly publishes a reply to an existing Threads post."""
    if not message.strip():
        raise ThreadsError("Reply text cannot be empty.", reason="post_rejected")
    if len(message) > MAX_POST_LENGTH:
        raise ThreadsError(
            f"Reply exceeds maximum {MAX_POST_LENGTH} characters.", reason="post_rejected"
        )

    cred = ThreadsCredential.current()
    token = oauth.get_active_access_token()
    if not cred.threads_user_id:
        raise ThreadsError("Threads user ID is not available. Please reconnect.", reason="not_connected")

    _check_rate_limit(cred, is_reply=True)

    container_id = client.create_media_container(
        token,
        cred.threads_user_id,
        text=message,
        media_type="TEXT",
        reply_to_id=parent_thread_id,
    )
    time.sleep(1)
    post_id = client.publish_container(token, cred.threads_user_id, container_id)

    handle = cred.username or cred.threads_user_id
    permalink = f"https://www.threads.net/@{handle}/post/{post_id}"

    logger.info("threads.publishing: posted reply %s to parent thread %s", post_id, parent_thread_id)
    return {
        "posted": True,
        "post_id": post_id,
        "permalink": permalink,
    }
