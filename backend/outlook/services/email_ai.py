import logging
from typing import Any

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from outlook.models import OutlookCredential
from outlook.prompts import compose_system_prompt, reply_system_prompt

logger = logging.getLogger("outlook.services.email_ai")


def _generate(*, system: str, user_content: str) -> dict[str, Any]:
    """Never-crash contract, matching core/services/llm.py::generate_reply."""
    pref = ModelPreference.current()
    try:
        provider = get_provider(pref.provider)
        draft = provider.generate_text(
            model=pref.model,
            system=system,
            history=[{"role": "user", "content": user_content}],
            max_tokens=pref.max_tokens,
            temperature=pref.temperature,
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
    user_content = (
        f"Original email from: {original_sender}\n"
        f"Subject: {original_subject}\n\n"
        f"{original_body_text}\n\n"
        f"---\n"
        f"{'Instructions for the reply: ' + instructions if instructions else 'Write an appropriate reply.'}"
    )
    return _generate(system=reply_system_prompt(signature), user_content=user_content)


def generate_compose_draft(*, prompt: str) -> dict[str, Any]:
    signature = OutlookCredential.current().signature
    return _generate(system=compose_system_prompt(signature), user_content=prompt)
