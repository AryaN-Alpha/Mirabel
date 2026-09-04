import logging
from typing import Any

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from core.services.providers.model_select import fast_model_for
from core.services.text_utils import truncate_chars
from outlook.models import OutlookCredential
from outlook.prompts import compose_system_prompt, reply_system_prompt

logger = logging.getLogger("outlook.services.email_ai")

# outlook/views.py::generate_reply (the REST endpoint) passes the raw Graph
# message body straight through with no cap of its own — this is the one
# place both that path and agent/tools/outlook_tools.py's
# generate_outlook_reply (which already truncates before calling in) are
# guaranteed to go through, so it's the right place to enforce the cap once
# rather than relying on every caller to remember. A long HTML/multi-quote
# thread has no size contract from the Graph API otherwise.
_MAX_ORIGINAL_BODY_CHARS = 3000


def _generate(*, system: str, user_content: str, call_site: str) -> dict[str, Any]:
    """Never-crash contract, matching core/services/llm.py::generate_reply."""
    pref = ModelPreference.current()
    try:
        provider = get_provider(pref.provider)
        draft = provider.generate_text(
            # fast_model_for(pref) — see core/services/providers/model_select.py.
            # Drafting an email reply/compose is short-form and deterministic;
            # no need for a reasoning-tier model's hidden chain-of-thought.
            model=fast_model_for(pref),
            system=system,
            history=[{"role": "user", "content": user_content}],
            max_tokens=pref.max_tokens,
            temperature=pref.temperature,
            call_site=call_site,
        )
        return {"draft": draft.strip(), "error": False, "reason": None}
    except ProviderError as exc:
        logger.error("%s provider call failed: %s", pref.provider, exc)
        return {"draft": "", "error": True, "reason": "provider"}
    except Exception as exc:
        logger.error("Email draft generation failed: %s", exc)
        return {"draft": "", "error": True, "reason": "unknown"}


def generate_reply_draft(
    *, original_subject: str, original_sender: str, original_body_text: str, instructions: str = ""
) -> dict[str, Any]:
    signature = OutlookCredential.current().signature
    original_body_text = truncate_chars(
        original_body_text, _MAX_ORIGINAL_BODY_CHARS, label="email body", call_site="outlook.reply_draft"
    )
    user_content = (
        f"Original email from: {original_sender}\n"
        f"Subject: {original_subject}\n\n"
        f"{original_body_text}\n\n"
        f"---\n"
        f"{'Instructions for the reply: ' + instructions if instructions else 'Write an appropriate reply.'}"
    )
    return _generate(system=reply_system_prompt(signature), user_content=user_content, call_site="outlook.reply_draft")


def generate_compose_draft(*, prompt: str) -> dict[str, Any]:
    signature = OutlookCredential.current().signature
    return _generate(system=compose_system_prompt(signature), user_content=prompt, call_site="outlook.compose_draft")
