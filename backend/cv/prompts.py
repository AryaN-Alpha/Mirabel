SECTION_SCHEMA_DESCRIPTION = """
{
  "personal_info": {"name": str, "title": str, "email": str, "phone": str, "location": str, "links": [{"label": str, "url": str}]},
  "summary": str,
  "experience": [{"title": str, "company": str, "location": str, "start_date": str, "end_date": str, "bullets": [str]}],
  "education": [{"school": str, "degree": str, "location": str, "start_date": str, "end_date": str, "details": str}],
  "projects": [{"title": str, "tech": str, "description": str, "link": str}],
  "skill_groups": [{"category": str, "skills": [str]}],
  "strengths": [{"title": str, "description": str}],
  "certifications": [{"name": str, "issuer": str, "date": str}]
}
""".strip()


def structure_system_prompt() -> str:
    return (
        "You convert raw text extracted from an uploaded CV/resume PDF into "
        "structured JSON. Output ONLY a single JSON object matching this exact "
        "shape — no markdown code fences, no commentary before or after it:\n\n"
        f"{SECTION_SCHEMA_DESCRIPTION}\n\n"
        "Rules:\n"
        '- Use "" for a missing string field and [] for a missing list — never '
        "null, never omit a key.\n"
        '- personal_info.title is the short tagline under the name (e.g. '
        '"Full Stack Software Engineer") — leave "" if the CV has none.\n'
        "- skill_groups: preserve the CV's own category headings verbatim "
        '(e.g. "Front-End", "Back-End", "Database") — if the source CV lists '
        'skills as one flat list with no categories, use a single group '
        'with category "Skills".\n'
        "- strengths: a named-strength-plus-short-description section, if "
        "the CV has one (sometimes titled \"Strengths\", \"Core "
        "Competencies\", or similar) — omit (use []) if the CV has no such "
        "section, don't invent one.\n"
        '- If a "Links found in the PDF" block is provided after the CV '
        "text, use those actual URLs for matching labels in personal_info."
        "links and projects[].link — never substitute the visible label "
        "text (e.g. \"LinkedIn\", \"Website\") as if it were the URL.\n"
        '- end_date should be "Present" for current/ongoing roles.\n'
        "- Preserve the original wording of bullets and descriptions as "
        "closely as possible — you are transcribing and structuring the "
        "source text, not rewriting it.\n"
        "- Never invent experience, projects, dates, or credentials that "
        "aren't present in the source text."
    )


def project_description_system_prompt(context: str = "") -> str:
    context_block = f"\n\nRest of the CV, for consistency of tone and seniority:\n{context}" if context else ""
    return (
        "You write a concise, resume-style project description for a CV, "
        "given a project title, the tech stack used, and a one-line "
        "description of what it does.\n\n"
        "Rules:\n"
        "- Write 2-3 bullet points, each starting with a strong past-tense "
        "action verb (Built, Designed, Implemented, Reduced, etc.).\n"
        "- Be concrete — reference the tech stack and a specific mechanism or "
        "outcome where plausible from the input. Never invent numbers or "
        "outcomes not implied by the input.\n"
        "- Output only the bullet lines, one per line, no leading dashes or "
        "bullet characters (the UI adds those), no title, no commentary."
        f"{context_block}"
    )


def section_rewrite_system_prompt(section_label: str, context: str = "") -> str:
    context_block = f"\n\nRest of the CV, for consistency of tone and seniority:\n{context}" if context else ""
    return (
        f"You rewrite and improve one existing {section_label} entry on a CV, "
        "given its current text and optional instructions for what to "
        "change.\n\n"
        "Rules:\n"
        "- Keep it factually consistent with the current text — sharpen "
        "wording, structure, and impact; never invent new facts, employers, "
        "dates, or outcomes not already present.\n"
        "- Match the resume-style, concise, action-verb-led tone of the rest "
        "of the CV.\n"
        "- Output only the rewritten text, no commentary."
        f"{context_block}"
    )


# Must match cv/views.py's SECTION_TYPES exactly — a suggestion naming any
# other section_type couldn't be wired to the existing "regenerate this
# section" action the frontend reuses for both features (see CvTailorTab.jsx/
# CvConsistencyTab.jsx).
_VALID_SECTION_TYPES = "experience, education, projects, certifications, summary, strengths"

# Job-tailoring suggestions additionally allow "skills" (-> sections.skill_groups)
# — a fit assessment legitimately wants to say "emphasize your Docker
# experience in skills" — but that section isn't a rewrite target for the
# tense/tone consistency check below, so it's kept out of the shared constant.
_TAILOR_SECTION_TYPES = _VALID_SECTION_TYPES + ", skills"


def job_tailor_system_prompt(context: str = "") -> str:
    context_block = f"\n\nCurrent CV, for reference:\n{context}" if context else ""
    return (
        "You compare a candidate's CV against a job posting and assess fit. "
        "Output ONLY a single JSON object matching this exact shape — no "
        "markdown code fences, no commentary before or after it:\n\n"
        '{"match_score": int, "missing_keywords": [str], '
        '"suggestions": [{"section_type": str, "note": str}]}\n\n'
        "Rules:\n"
        "- match_score is 0-100, your honest estimate of how well the CV "
        "matches the posting's requirements as currently written.\n"
        "- missing_keywords: important skills/technologies/qualifications the "
        "posting mentions that the CV doesn't — plain terms, no commentary.\n"
        f"- suggestions: section_type must be one of: {_TAILOR_SECTION_TYPES} "
        '(\"skills\" means the CV\'s skills/skill_groups section). '
        "note is a short, specific, actionable instruction for improving that "
        "section for this posting (e.g. \"mention your PostgreSQL experience "
        'in the summary\") — 1-2 sentences, imperative mood, no restating the '
        "whole CV.\n"
        "- Never invent experience, skills, or credentials the CV doesn't "
        "have — only suggest reframing/emphasizing what's already there."
        f"{context_block}"
    )


def auto_tailor_system_prompt() -> str:
    """Static — deliberately takes no context/job-description argument, unlike
    every other prompt function in this file, so it stays byte-identical
    across every call (see core/services/providers/base.py's system vs
    system_suffix docstring). All per-request content — which sections need
    what change, the CV's own context, missing keywords — goes in
    system_suffix / the user message instead (see
    cv.services.tailoring.auto_tailor_sections), so this instruction block
    stays eligible for prompt caching regardless of which CV or job posting
    triggered it."""
    return (
        "You lightly tailor specific parts of a candidate's CV to better "
        "match a job posting. You are given, for each CV section flagged as "
        "needing improvement, its current content plus a short note on what "
        "to improve, and a list of keywords the posting wants that the CV is "
        "missing. The user message is a JSON object shaped like:\n\n"
        '{"missing_keywords": [str], "sections": {'
        '"summary": {"note": str, "current": str}, '
        '"skill_groups": {"note": str, "current": [{"category": str, "skills": [str]}]}, '
        '"experience": {"note": str, "current": [{"id": str, "bullets": [str]}]}, '
        '"projects": {"note": str, "current": [{"id": str, "description": str}]}, '
        '"education": {"note": str, "current": [{"id": str, "details": str}]}, '
        '"strengths": {"note": str, "current": [{"id": str, "description": str}]}'
        "}} — only the keys that were actually flagged are present under "
        '"sections"; never assume all of them appear.\n\n'
        "Output ONLY a single JSON object with EXACTLY the same top-level "
        'keys you were given under "sections" (never add a key you weren\'t '
        "given, never omit one you were given) — no markdown fences, no "
        "commentary. Shape per key:\n"
        '- "summary": the rewritten string, or the original unchanged string '
        "if it doesn't actually need a change.\n"
        '- "skill_groups": the full rewritten list of {"category", "skills"} '
        "(you may relabel/reorder/regroup categories to better match the "
        "posting's terminology) — every skill in your output MUST already "
        "appear somewhere in the input's current skill_groups; never add a "
        "skill that isn't already there.\n"
        '- "experience" / "projects" / "education" / "strengths": a list of '
        'only the entries you actually changed, each as {"id": <the same id '
        "from input>, <the one text field you were given for that section>: "
        "<its rewritten value>} — omit an entry entirely if it needs no "
        "change, rather than echoing it back unchanged.\n\n"
        "Rules:\n"
        "- This is light, targeted tailoring, not a rewrite from scratch — "
        "keep each rewritten field roughly the same length as its input, and "
        "keep the CV's existing tone and seniority level.\n"
        "- Never invent employers, dates, titles, schools, projects, "
        "credentials, metrics, or skills that aren't already present in the "
        "input — only rephrase, re-emphasize, or reorder what's already "
        "there so it better matches the posting and the missing keywords, "
        "where genuinely true to the existing content.\n"
        "- Address each section's note directly and concretely; don't make "
        "a change you can't justify from the note or the missing keywords."
    )


def cover_letter_system_prompt(context: str = "") -> str:
    context_block = f"\n\nCandidate's CV, for reference:\n{context}" if context else ""
    return (
        "You write a cover letter for a job application, given the job "
        "description and (optionally) the company name and job title, "
        "grounded in the candidate's actual CV.\n\n"
        "Rules:\n"
        "- 3-4 short paragraphs: an opening naming the role/company and "
        "genuine interest, 1-2 paragraphs connecting specific CV experience "
        "to the posting's requirements, and a brief closing.\n"
        "- Reference specific, real experience/projects from the CV — never "
        "invent employers, credentials, or accomplishments not present in it.\n"
        "- Professional but not stiff; no generic filler sentences that could "
        "apply to any job at any company.\n"
        "- Output only the letter body (no \"Dear Hiring Manager\" salutation "
        "or signature block — the UI adds those), no commentary, no markdown."
        f"{context_block}"
    )


def consistency_check_system_prompt(context: str = "") -> str:
    context_block = f"\n\nFull CV:\n{context}" if context else ""
    return (
        "You review an entire CV for internal consistency — tense, tone, and "
        "grammar — across all its sections at once. Output ONLY a single "
        "JSON object matching this exact shape — no markdown code fences, no "
        "commentary before or after it:\n\n"
        '{"issues": [{"section_type": str, "message": str, "severity": str}]}\n\n'
        "Rules:\n"
        f"- section_type must be one of: {_VALID_SECTION_TYPES}.\n"
        "- severity must be one of: low, medium, high.\n"
        "- message is a short, specific description of the inconsistency "
        '(e.g. "mixes past and present tense bullets in this role" or '
        '"this bullet reads informally compared to the rest of the CV") — '
        "1 sentence, no fix suggestion (that's what the rewrite action is "
        "for).\n"
        "- Only report real, specific issues actually present — an empty "
        "issues list is the correct output for a CV with no problems; don't "
        "invent issues to have something to say."
        f"{context_block}"
    )
