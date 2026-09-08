import logging
from typing import Any

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from core.services.providers.model_select import fast_model_for
from memory.services.retrieval import format_memories_for_prompt, retrieve_relevant_memories
from threads.models import ThreadsCredential
from threads.prompts import post_system_prompt, reply_system_prompt

logger = logging.getLogger("threads")


def _generate(*, system: str, user_content: str, call_site: str, system_suffix: str = "") -> dict[str, Any]:
    """Never-crash contract, matching core/services/llm.py::generate_reply."""
    pref = ModelPreference.current()
    try:
        provider = get_provider(pref.provider)
        text = provider.generate_text(
            model=fast_model_for(pref),
            system=system,
            system_suffix=system_suffix,
            history=[{"role": "user", "content": user_content}],
            max_tokens=pref.max_tokens,
            temperature=pref.temperature,
            call_site=call_site,
        )
        # Threads limit: 500 characters max
        text = text.strip()
        if len(text) > 500:
            text = text[:497] + "..."
        return {"text": text, "error": False, "reason": None}
    except ProviderError as exc:
        logger.error("threads.generation: %s provider call failed: %s", pref.provider, exc)
        return {"text": "", "error": True, "reason": "provider"}
    except Exception as exc:
        logger.error("threads.generation failed: %s", exc)
        return {"text": "", "error": True, "reason": "unknown"}


def generate_post(*, prompt: str, tone: str = "casual", length: str = "medium") -> dict[str, Any]:
    """AI-generates a Threads post body from a free-form prompt.

    Uses RAG retrieval from Mirabel's memories (in system_suffix to preserve prompt caching)
    and tailors to the connected user's handle/name.
    """
    memories = retrieve_relevant_memories(query_text=prompt)
    memory_block = format_memories_for_prompt(memories)
    cred = ThreadsCredential.current()
    author_name = cred.name or cred.username

    system = post_system_prompt(tone=tone, length=length, author_name=author_name)
    return _generate(
        system=system,
        system_suffix=memory_block,
        user_content=prompt,
        call_site="threads.generate_post",
    )


def generate_reply(*, post_context: str, instructions: str = "") -> dict[str, Any]:
    """AI-generates a reply comment to an existing Threads post."""
    user_content = (
        f"The post you're replying to:\n{post_context}\n\n"
        f"{'Instructions for the reply: ' + instructions if instructions else 'Write an engaging, insightful reply.'}"
    )
    return _generate(
        system=reply_system_prompt(),
        user_content=user_content,
        call_site="threads.generate_reply",
    )
