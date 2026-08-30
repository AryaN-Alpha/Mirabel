import logging
from typing import Any

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from linkedin.models import LinkedInCredential
from linkedin.prompts import comment_system_prompt, post_system_prompt
from memory.services.retrieval import format_memories_for_prompt, retrieve_relevant_memories

logger = logging.getLogger("linkedin.services.generation")


def _generate(*, system: str, user_content: str, call_site: str, system_suffix: str = "") -> dict[str, Any]:
    """Never-crash contract, matching core/services/llm.py::generate_reply and
    outlook/services/email_ai.py::_generate."""
    pref = ModelPreference.current()
    try:
        provider = get_provider(pref.provider)
        text = provider.generate_text(
            model=pref.model,
            system=system,
            system_suffix=system_suffix,
            history=[{"role": "user", "content": user_content}],
            max_tokens=pref.max_tokens,
            temperature=pref.temperature,
            call_site=call_site,
        )
        return {"text": text.strip(), "error": False, "reason": None}
    except ProviderError as exc:
        logger.error("%s provider call failed: %s", pref.provider, exc)
        return {"text": "", "error": True, "reason": "provider"}
    except Exception as exc:
        logger.error("LinkedIn generation failed: %s", exc)
        return {"text": "", "error": True, "reason": "unknown"}


def generate_post(*, prompt: str, tone: str = "", length: str = "medium") -> dict[str, Any]:
    """AI-generates a LinkedIn post body from a free-form prompt.

    Pulls relevant context from the same RAG memory system chat uses
    (memory.services.retrieval — already fails safe to [] on any error) so the
    post can draw on things Mirabel actually knows about, plus the connected
    LinkedIn profile's name for light personalization. There's no saved
    "signature" for LinkedIn the way there is for Outlook — the free-text
    prompt is the primary personalization input, per direct instruction.
    """
    memories = retrieve_relevant_memories(query_text=prompt)
    memory_block = format_memories_for_prompt(memories)
    name = LinkedInCredential.current().name

    system = post_system_prompt(tone=tone, length=length, author_name=name)
    return _generate(system=system, system_suffix=memory_block, user_content=prompt, call_site="linkedin.generate_post")


def generate_comment_reply(*, post_context: str, instructions: str = "") -> dict[str, Any]:
    """AI-generates a reply to a LinkedIn post.

    LinkedIn's standard API scope doesn't allow reading an arbitrary post's
    content, so the caller has to paste in the post's text/context themselves.
    """
    user_content = (
        f"The post you're replying to:\n{post_context}\n\n"
        f"{'Instructions for the reply: ' + instructions if instructions else 'Write an appropriate, engaging reply.'}"
    )
    return _generate(system=comment_system_prompt(), user_content=user_content, call_site="linkedin.generate_comment")
