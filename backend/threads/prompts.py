"""Prompt templates and style guidance for AI Threads generation.

Threads enforces a hard limit of 500 characters per post.
The tone on Threads is distinct from LinkedIn: conversational, candid,
punchy, authentic, and discussion-provoking rather than formal corporate.
"""

TONE_GUIDANCE = {
    "casual": (
        "Casual, candid, and conversational — sounds like a real person sharing a quick thought or observation."
    ),
    "insightful": (
        "Insightful — share an interesting take, observation, or lesson learned in a clear, compelling way."
    ),
    "announcement": (
        "Announcement — punchy and exciting, immediately conveys what's new and why it matters."
    ),
    "question": (
        "Discussion-starter — shares a brief perspective and asks a genuine question to invite replies."
    ),
    "professional": (
        "Smart and direct — professional and articulate, but without corporate jargon or stiffness."
    ),
}

LENGTH_GUIDANCE = {
    "short": "Keep it to 1-2 punchy sentences, strictly under 180 characters.",
    "medium": "2-3 short sentences or concise thoughts, around 250-380 characters.",
    "long": "A fuller micro-thread post: hook, 2-3 brief lines, and close. Must be strictly under 480 characters.",
}

STRUCTURE_GUIDANCE = (
    "Structure it like a real Threads post:\n"
    "- Open with a strong hook: an intriguing question, a bold statement, or a direct insight.\n"
    "- Use single line breaks between thoughts for scannability.\n"
    "- Keep lines concise and punchy.\n"
    "- Never use markdown formatting like **bold** or asterisks (Threads renders them as plain literal characters).\n"
    "- End with an open question or takeaway that encourages comments/replies.\n"
    "- ABSOLUTE MAXIMUM LENGTH IS 500 CHARACTERS. Keep safely under 480 characters."
)

HUMAN_VOICE_GUIDANCE = (
    "Write naturally, like an individual sharing on social media:\n"
    "- Use natural contractions (I'm, don't, it's, we've).\n"
    "- Avoid cheesy marketing phrases: 'in today's world', 'game changer', 'let's dive in', "
    "'thrilled to announce', 'unlock your potential', 'take it to the next level'.\n"
    "- Use emojis sparingly (at most 1 or 2 relevant emojis total).\n"
    "- At most one exclamation point in the whole post.\n"
    "- Be authentic, grounded, and specific."
)


def post_system_prompt(*, tone: str, length: str, author_name: str = "") -> str:
    tone_line = TONE_GUIDANCE.get(tone, "Casual and engaging.")
    length_line = LENGTH_GUIDANCE.get(length, LENGTH_GUIDANCE["medium"])
    author_line = f" for {author_name}" if author_name else ""
    return (
        f"You write Threads posts{author_line} based on a short prompt "
        "describing what the post should be about.\n\n"
        "Rules:\n"
        "- Write only the post body text — no title, no metadata, no quotes, no markdown syntax.\n"
        "- CRITICAL: Output must NEVER exceed 500 characters under any circumstances.\n"
        f"- Tone: {tone_line}\n"
        f"- Length: {length_line}\n\n"
        f"{STRUCTURE_GUIDANCE}\n\n"
        f"{HUMAN_VOICE_GUIDANCE}\n\n"
        "- Never invent facts not implied by the prompt or context."
    )


def reply_system_prompt() -> str:
    return (
        "You write a short, engaging reply to a Threads post, "
        "given the post's content and optional instructions.\n\n"
        "Rules:\n"
        "- Write only the reply text — no quotes, no metadata, no markdown formatting.\n"
        "- Keep it brief (1-2 sentences, strictly under 300 characters).\n"
        "- Add genuine value: an insightful comment, shared experience, or thoughtful question.\n"
        "- Keep the voice conversational and warm."
    )
