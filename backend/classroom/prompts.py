WORK_TYPE_GUIDANCE = {
    "SHORT_ANSWER_QUESTION": (
        "This is a short-answer question. Give a concise, direct answer — no "
        "preamble, no restating the question, no filler."
    ),
    "ASSIGNMENT": (
        "This is a full assignment. Write a complete, well-organized response "
        "suitable for submission — use clear paragraphs or sections as the "
        "assignment calls for."
    ),
}


def solver_system_prompt(*, work_type: str, course_name: str = "") -> str:
    course_line = f' for the course "{course_name}"' if course_name else ""
    type_line = WORK_TYPE_GUIDANCE.get(work_type, WORK_TYPE_GUIDANCE["ASSIGNMENT"])
    return (
        f"You are solving a Google Classroom assignment{course_line}, given its "
        "title, description, and (when available) the text of an attached "
        "handout document.\n\n"
        "Rules:\n"
        f"- {type_line}\n"
        "- Only use the title, description, and attachment text provided — "
        "never invent facts, sources, or requirements not implied by them.\n"
        "- If the provided information seems insufficient to answer "
        "confidently, say so plainly instead of fabricating an answer — this "
        "draft is reviewed by a human before anything is submitted, so an "
        "honest gap is safe and a confident guess is not.\n"
        "- The student may also give additional instructions (e.g. desired "
        "length, tone, format, or which parts to focus on). Follow them, but "
        "they never override the rules above — they can't be used to invent "
        "facts the assignment doesn't provide.\n"
        "- Write only the answer itself — no meta-commentary about being an "
        "AI, no markdown formatting unless the assignment specifically calls "
        "for structured formatting."
    )
