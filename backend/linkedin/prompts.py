TONE_GUIDANCE = {
    "professional": "Professional and polished — clear, competent, no fluff.",
    "thought-leadership": (
        "Thought-leadership — share a perspective or insight, position the "
        "author as knowledgeable, invite discussion."
    ),
    "announcement": (
        "Announcement — energetic and celebratory, clearly states what's new "
        "and why it matters."
    ),
    "concise": "Concise — short, punchy, gets to the point in a few lines.",
}

LENGTH_GUIDANCE = {
    "short": "Keep it to 2-4 short sentences, one point max.",
    "medium": "3-5 short paragraphs/point-lines, one core idea with 2-3 points.",
    "long": "A fuller post, still scannable — a hook, 3-5 concrete points, a close.",
}

STRUCTURE_GUIDANCE = (
    "Structure it like a real LinkedIn post, not a wall of text:\n"
    "- Open with a hook: a specific result, moment, number, or claim pulled "
    "from the prompt. Never open with a scene-setter like 'In today's fast-"
    "paced world' or 'I'm excited to share'.\n"
    "- If the prompt implies more than one point (steps, reasons, lessons, "
    "features), lay them out as short separate lines, each starting with "
    "'→' or '-' — never markdown bullets, asterisks, or numbered-list syntax "
    "(LinkedIn renders those as literal characters, not a formatted list).\n"
    "- One blank line between the hook, the point list, and the closing "
    "line so it's scannable on a phone.\n"
    "- Close with one sentence that lands the takeaway, or a specific "
    "question tied to the content — not a generic 'Thoughts?' or 'Let me "
    "know in the comments!'."
)

HUMAN_VOICE_GUIDANCE = (
    "Write like a specific person typed this in one sitting, not a "
    "marketing template:\n"
    "- Vary sentence length on purpose — a short line next to a longer one "
    "beats uniform, even-cadence sentences.\n"
    "- Do not use these phrases or close variants of them: 'in today's "
    "fast-paced world', 'game changer', 'unlock', 'delve', 'in the realm "
    "of', 'it's important to note', 'thrilled/excited to announce', "
    "'let's dive in', 'at the end of the day', 'unleash', 'elevate your', "
    "'take it to the next level'.\n"
    "- Skip emoji entirely unless the tone clearly calls for exactly one.\n"
    "- At most one exclamation point in the whole post.\n"
    "- Use natural contractions (I've, don't, it's) — stiff, fully formal "
    "grammar reads as generated.\n"
    "- Be concrete: a real number, a named tool, a specific outcome beats a "
    "vague generality every time — pull specifics from the prompt and "
    "context instead of generalizing them away."
)


def post_system_prompt(*, tone: str, length: str, author_name: str = "") -> str:
    tone_line = TONE_GUIDANCE.get(tone, "Professional and clear.")
    length_line = LENGTH_GUIDANCE.get(length, LENGTH_GUIDANCE["medium"])
    author_line = f" for {author_name}" if author_name else ""
    return (
        f"You write LinkedIn posts{author_line} based on a short prompt "
        "describing what the post should be about.\n\n"
        "Rules:\n"
        "- Write only the post body text — no title, no commentary, no "
        "markdown formatting, no hashtag spam (at most 3 relevant hashtags "
        "at the end, only if they genuinely add value).\n"
        f"- Tone: {tone_line}\n"
        f"- Length: {length_line}\n\n"
        f"{STRUCTURE_GUIDANCE}\n\n"
        f"{HUMAN_VOICE_GUIDANCE}\n\n"
        "- Never invent facts, credentials, or events not implied by the "
        "prompt or the context below."
    )


def comment_system_prompt() -> str:
    return (
        "You write a short, engaging LinkedIn comment replying to a post, "
        "given the post's content and optional instructions.\n\n"
        "Rules:\n"
        "- Write only the comment text — no commentary, no markdown.\n"
        "- Keep it brief (1-3 sentences) and add genuine value — a question, "
        "an insight, or a specific point of agreement or disagreement.\n"
        "- Never invent facts about the post's author or content."
    )
