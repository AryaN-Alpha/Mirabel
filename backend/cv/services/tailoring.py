import copy
import json
import logging
from typing import Any

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from core.services.text_utils import select_relevant_sentences
from cv.prompts import auto_tailor_system_prompt, job_tailor_system_prompt
from cv.schema import normalize_sections
from cv.services.generation import format_cv_context
from cv.services.json_utils import extract_json_object

logger = logging.getLogger("cv.services.tailoring")

# "skills" is accepted here (unlike cv/views.py's SECTION_TYPES, which gates
# the single-string "Ask AI to rewrite" action) because job_tailor_system_prompt
# allows the model to flag it, and auto_tailor_sections below knows how to
# apply it (-> sections.skill_groups). See _TAILOR_SECTION_TYPES in
# cv/prompts.py for the matching prompt-side allowlist.
_VALID_SECTION_TYPES = {"experience", "education", "projects", "certifications", "summary", "strengths", "skills"}
_MAX_JOB_DESCRIPTION_CHARS = 6000
_MAX_SUGGESTION_NOTE_CHARS = 300

# Reasoning-tier models (live-verified here: DeepSeek's default reasoning
# model) spend a large, variable share of max_tokens on hidden chain-of-
# thought before ever emitting the visible answer — that's the actual cause
# of the 1500->4000->6000->12000 token-cap chase in auto_tailor_sections
# below, not payload size. Fit-scoring and light section rewriting are small,
# deterministic tasks with no need for that reasoning tax, so both
# tailor_cv_to_job and auto_tailor_sections always use each provider's fast/
# non-reasoning model here instead of whatever ModelPreference.model
# currently is — keeping the user's chosen *provider* (so their existing API
# key/billing still applies) while overriding just the model. Anthropic/
# OpenAI aren't listed: this app never opts into their reasoning-tier
# behavior (no `thinking`/`reasoning_effort` param is set in
# anthropic_provider.py / openai_provider.py), and Gemini already forces
# thinking_level=MINIMAL for every call inside gemini_provider.py itself.
_FAST_MODEL_OVERRIDE = {"deepseek": "deepseek-chat"}


def _fast_model(pref: ModelPreference) -> str:
    return _FAST_MODEL_OVERRIDE.get(pref.provider, pref.model)


def _fallback(*, error: bool, reason: str | None) -> dict[str, Any]:
    return {"match_score": None, "missing_keywords": [], "suggestions": [], "error": error, "reason": reason}


def _normalize_suggestions(raw) -> list[dict]:
    """Shared by _normalize_result (validating the tailor_cv_to_job LLM
    response) and auto_tailor_sections (validating suggestions handed back in
    by the frontend for the "auto-update & save as new CV" action) — same
    allowed-type/shape rules either way, so this is the one place that
    enforces them."""
    if not isinstance(raw, list):
        return []
    return [
        {"section_type": s.get("section_type"), "note": str(s.get("note", ""))[:_MAX_SUGGESTION_NOTE_CHARS]}
        for s in raw
        if isinstance(s, dict) and s.get("section_type") in _VALID_SECTION_TYPES and s.get("note")
    ][:10]


def _normalize_result(parsed: dict) -> dict[str, Any]:
    match_score = parsed.get("match_score")
    if not isinstance(match_score, (int, float)) or not (0 <= match_score <= 100):
        match_score = None
    missing_keywords = [str(k) for k in parsed.get("missing_keywords", []) if isinstance(k, (str, int, float))][:20]
    return {
        "match_score": match_score,
        "missing_keywords": missing_keywords,
        "suggestions": _normalize_suggestions(parsed.get("suggestions", [])),
        "error": False,
        "reason": None,
    }


def tailor_cv_to_job(sections: dict, job_description: str) -> dict[str, Any]:
    """Never-crash contract, matching cv.services.structuring.structure_cv's
    shape: provider call -> JSON parse -> normalize, falling back to an
    empty-but-valid result (never raises) at any failure point."""
    context = format_cv_context(sections)
    # The CV's own content is the relevance query: a job posting mixes
    # load-bearing requirements with boilerplate (company blurbs, benefits,
    # EOE statements), and what's relevant is determined by what's in the
    # candidate's CV, not a fixed character offset. Falls back to plain
    # truncate_chars internally if extraction isn't applicable.
    job_description = select_relevant_sentences(
        job_description, query=context, max_chars=_MAX_JOB_DESCRIPTION_CHARS,
        label="job description", call_site="cv.tailor",
    )
    pref = ModelPreference.current()
    try:
        provider = get_provider(pref.provider)
        text = provider.generate_text(
            model=_fast_model(pref),
            system=job_tailor_system_prompt(context),
            history=[{"role": "user", "content": job_description}],
            # Live-verified in production use: with DeepSeek (and other
            # reasoning-style models that spend output tokens on hidden
            # reasoning before the visible answer), 1000 was consistently
            # too tight — every real call hit the cap and returned zero
            # usable text, hitting the "invalid JSON" fallback below every
            # time. Matches the 4000 floor used elsewhere in this module
            # (auto_tailor_sections) and in structuring.py for the same
            # reason.
            max_tokens=max(pref.max_tokens, 4000),
            temperature=0.3,
            call_site="cv.tailor",
        )
    except ProviderError as exc:
        logger.error("%s provider call failed tailoring CV: %s", pref.provider, exc)
        return _fallback(error=True, reason="provider")
    except Exception as exc:
        logger.error("CV tailoring failed: %s", exc)
        return _fallback(error=True, reason="unknown")

    try:
        parsed = json.loads(extract_json_object(text))
    except json.JSONDecodeError as exc:
        logger.error("CV tailoring returned invalid JSON: %s", exc)
        return _fallback(error=False, reason=None)

    if not isinstance(parsed, dict):
        logger.error("CV tailoring returned valid but non-object JSON: %r", type(parsed))
        return _fallback(error=False, reason=None)

    return _normalize_result(parsed)


# ---------------------------------------------------------------------------
# Auto-apply: takes a tailor_cv_to_job result the caller already paid for and
# rewrites only the flagged sections, via one consolidated LLM call, into a
# fresh sections dict a view can save as a new CVProfile. See
# cv/prompts.py::auto_tailor_system_prompt for the full I/O contract.
# ---------------------------------------------------------------------------

# "certifications" is a valid tailor-suggestion section_type but has no free
# text worth rewriting (name/issuer/date are factual) — a certifications
# suggestion is left for the user to act on manually, same as today; it's
# simply never added to notes_by_key below, so it never triggers a change.
_AUTO_TAILOR_SECTION_KEY = {"skills": "skill_groups"}
_AUTO_TAILOR_SUPPORTED_KEYS = {"summary", "skill_groups", "experience", "projects", "education", "strengths"}
_AUTO_TAILOR_ENTRY_TEXT_FIELD = {
    "experience": "bullets",
    "projects": "description",
    "education": "details",
    "strengths": "description",
}
# Human-readable label for one changed entry in the "what changed" report,
# built from fields the merge never touches (title/company/school/etc.) —
# never from text_field itself, since that's the thing being diffed.
_AUTO_TAILOR_ENTRY_LABEL_FIELDS = {
    "experience": lambda e: " at ".join(p for p in (e.get("title", "").strip(), e.get("company", "").strip()) if p) or "Experience entry",
    "projects": lambda e: e.get("title", "").strip() or "Project entry",
    "education": lambda e: " — ".join(p for p in (e.get("degree", "").strip(), e.get("school", "").strip()) if p) or "Education entry",
    "strengths": lambda e: e.get("title", "").strip() or "Strength entry",
}
_MAX_MISSING_KEYWORDS_FOR_APPLY = 20


def _auto_tailor_fallback(sections: dict, *, error: bool, reason: str | None) -> dict[str, Any]:
    return {"sections": sections, "changed_sections": [], "changes": [], "error": error, "reason": reason}


def _build_auto_tailor_payload(sections: dict, notes_by_key: dict[str, list[str]]) -> dict[str, Any]:
    """Sends only the flagged sections' free-text fields (never the whole CV,
    never the job description again — the notes already distill what
    matters) so this call stays as small as the task allows."""
    payload: dict[str, Any] = {}
    if "summary" in notes_by_key:
        payload["summary"] = {"note": " ".join(notes_by_key["summary"]), "current": sections.get("summary", "")}
    if "skill_groups" in notes_by_key:
        payload["skill_groups"] = {
            "note": " ".join(notes_by_key["skill_groups"]),
            "current": [
                {"category": g.get("category", ""), "skills": g.get("skills", [])}
                for g in sections.get("skill_groups", [])
            ],
        }
    for key, text_field in _AUTO_TAILOR_ENTRY_TEXT_FIELD.items():
        if key not in notes_by_key:
            continue
        default = [] if text_field == "bullets" else ""
        payload[key] = {
            "note": " ".join(notes_by_key[key]),
            "current": [{"id": entry.get("id", ""), text_field: entry.get(text_field, default)} for entry in sections.get(key, [])],
        }
    return payload


def _known_skills(skill_groups: list[dict]) -> dict[str, str]:
    """Maps lowercased skill text -> its original casing, across every
    existing skill_groups entry — used to reject any skill the model's
    rewritten skill_groups introduces that wasn't already on the CV. Defense
    in depth on top of the prompt's "never invent skills" rule, matching
    CLAUDE.md's "never invent experience/skills" constraint at the code
    level, not just the prompt level."""
    known: dict[str, str] = {}
    for group in skill_groups:
        for skill in group.get("skills", []):
            if isinstance(skill, str) and skill.strip():
                known.setdefault(skill.strip().lower(), skill)
    return known


def _merge_skill_groups(parsed_groups, original_groups: list[dict]) -> list[dict] | None:
    if not isinstance(parsed_groups, list):
        return None
    known = _known_skills(original_groups)
    merged = []
    for item in parsed_groups:
        if not isinstance(item, dict):
            continue
        raw_skills = item.get("skills")
        if not isinstance(raw_skills, list):
            continue
        skills = [known[s.strip().lower()] for s in raw_skills if isinstance(s, str) and s.strip().lower() in known]
        if not skills:
            continue
        merged.append({"category": str(item.get("category", "")).strip(), "skills": skills})
    return merged or None


def _merge_entries(parsed_entries, original_entries: list[dict], text_field: str) -> tuple[list[dict], list[dict]]:
    """Merges by stable entry id (schema.py stamps one on every item), only
    ever touching `text_field` — every other field (title/company/dates/...)
    and every entry the model didn't return stays byte-identical to the
    input, which is what makes "only change what's needed" a guarantee
    rather than a prompt-only hope. Returns the merged list plus one
    {id, before, after} record per entry that actually changed — compared
    by value, not just "the model returned something for this id", so a
    model that echoes an entry back unchanged (against the prompt's
    instructions) doesn't get counted as a change either."""
    if not isinstance(parsed_entries, list):
        return original_entries, []
    result = [dict(entry) for entry in original_entries]
    index_by_id = {entry.get("id"): i for i, entry in enumerate(result)}
    entry_changes: list[dict] = []
    for item in parsed_entries:
        if not isinstance(item, dict):
            continue
        entry_id = item.get("id")
        if entry_id not in index_by_id:
            continue
        new_value = item.get(text_field)
        if text_field == "bullets":
            if not (isinstance(new_value, list) and new_value and all(isinstance(b, str) and b.strip() for b in new_value)):
                continue
            new_value = [b.strip() for b in new_value]
        else:
            if not (isinstance(new_value, str) and new_value.strip()):
                continue
            new_value = new_value.strip()
        idx = index_by_id[entry_id]
        before = result[idx][text_field]
        if new_value == before:
            continue
        result[idx][text_field] = new_value
        entry_changes.append({"id": entry_id, "before": before, "after": new_value})
    return result, entry_changes


def auto_tailor_sections(sections: dict, suggestions: list, missing_keywords: list) -> dict[str, Any]:
    """Never-crash contract, matching tailor_cv_to_job's shape. Applies only
    the sections a prior tailor_cv_to_job result actually flagged, via one
    consolidated LLM call, merging its output back onto a deep copy of
    `sections` field-by-field — everything not flagged, and any entry the
    model didn't return, stays byte-identical to the input. Deliberately
    reuses the suggestions/missing_keywords a caller already paid for (see
    cv.views.apply_tailoring) instead of re-running the job-fit analysis."""
    notes_by_key: dict[str, list[str]] = {}
    for suggestion in _normalize_suggestions(suggestions):
        key = _AUTO_TAILOR_SECTION_KEY.get(suggestion["section_type"], suggestion["section_type"])
        if key not in _AUTO_TAILOR_SUPPORTED_KEYS:
            continue
        notes_by_key.setdefault(key, []).append(suggestion["note"])

    # Gate before spend: nothing we know how to auto-apply was flagged (e.g.
    # only a certifications suggestion came through) -> no LLM call at all.
    if not notes_by_key:
        return _auto_tailor_fallback(sections, error=False, reason=None)

    payload = _build_auto_tailor_payload(sections, notes_by_key)
    keywords = [str(k) for k in missing_keywords if isinstance(k, (str, int, float))][:_MAX_MISSING_KEYWORDS_FOR_APPLY]
    context = format_cv_context(sections)

    pref = ModelPreference.current()
    base_max_tokens = max(pref.max_tokens, 6000)
    user_message = json.dumps({"missing_keywords": keywords, "sections": payload})
    system_suffix = f"CV context, for tone/seniority consistency:\n{context}" if context else ""
    try:
        provider = get_provider(pref.provider)
        text = provider.generate_text(
            model=_fast_model(pref),
            system=auto_tailor_system_prompt(),
            system_suffix=system_suffix,
            history=[{"role": "user", "content": user_message}],
            # Live-verified against real DeepSeek calls during development:
            # 1500 wasn't enough headroom even for a 1-summary+1-skill-group
            # response, and a second live run still hit a 4000 floor on a
            # comparably small payload (26s latency, output_tokens=4000
            # exactly, no closing brace) — this call site's model can spend
            # a large, variable amount of its budget on hidden reasoning
            # before the visible answer, well beyond what the payload size
            # alone would suggest. 6000 gives more headroom; this is an
            # empirically-tuned value against a live, non-deterministic
            # model, not a hard guarantee — the JSON-decode fallback below
            # (and its distinct "malformed" reason, see below) is what
            # actually keeps a still-too-tight budget from being a crash or
            # a silent no-op.
            max_tokens=base_max_tokens,
            temperature=0.3,
            call_site="cv.tailor.apply",
        )
        if not text or not text.strip():
            # Live-verified failure mode, still happening at the 6000 floor
            # above: a reasoning-heavy model (this call site's default,
            # DeepSeek) can burn its *entire* max_tokens budget on hidden
            # reasoning and emit zero visible characters — the telemetry log
            # shows completion_tokens landing exactly on the cap with an
            # empty message.content. Rather than chase that with another
            # guessed fixed floor (1500 -> 4000 -> 6000, each one eventually
            # observed failing), retry once at double the budget before
            # giving up — this is what actually turns a reliably-empty
            # response into a usable one, since it targets the specific
            # observed failure rather than padding every call "just in case".
            retry_max_tokens = min(base_max_tokens * 2, 16000)
            logger.warning(
                "CV auto-tailor got an empty response at max_tokens=%d, retrying once at max_tokens=%d",
                base_max_tokens, retry_max_tokens,
            )
            text = provider.generate_text(
                model=_fast_model(pref),
                system=auto_tailor_system_prompt(),
                system_suffix=system_suffix,
                history=[{"role": "user", "content": user_message}],
                max_tokens=retry_max_tokens,
                temperature=0.3,
                call_site="cv.tailor.apply",
            )
    except ProviderError as exc:
        logger.error("%s provider call failed applying CV tailoring: %s", pref.provider, exc)
        return _auto_tailor_fallback(sections, error=True, reason="provider")
    except Exception as exc:
        logger.error("CV auto-tailor failed: %s", exc)
        return _auto_tailor_fallback(sections, error=True, reason="unknown")

    try:
        parsed = json.loads(extract_json_object(text))
    except json.JSONDecodeError as exc:
        logger.error("CV auto-tailor returned invalid JSON: %s", exc)
        # reason="malformed" (not None) deliberately diverges from
        # tailor_cv_to_job's equivalent branch: that call's caller can't act
        # on a lost result either way, but this one creates a new CV the
        # user will actually open — "malformed" lets the frontend say "the
        # AI's response couldn't be used, try again" instead of the
        # misleading "no changes were needed" a bare no-op reason would
        # imply for what was actually a failed attempt.
        return _auto_tailor_fallback(sections, error=False, reason="malformed")
    if not isinstance(parsed, dict):
        logger.error("CV auto-tailor returned valid but non-object JSON: %r", type(parsed))
        return _auto_tailor_fallback(sections, error=False, reason="malformed")

    merged = copy.deepcopy(sections)
    changed_sections: list[str] = []
    # Per-section before/after detail for the "what changed" report the
    # frontend shows after creating the new CV (see cv.views.apply_tailoring)
    # — kept alongside, not instead of, changed_sections so existing callers
    # of that field are unaffected.
    changes: list[dict[str, Any]] = []

    if "summary" in notes_by_key:
        new_summary = parsed.get("summary")
        original_summary = (sections.get("summary") or "").strip()
        if isinstance(new_summary, str) and new_summary.strip() and new_summary.strip() != original_summary:
            merged["summary"] = new_summary.strip()
            changed_sections.append("summary")
            changes.append({"section": "summary", "before": original_summary, "after": merged["summary"]})

    if "skill_groups" in notes_by_key:
        original_groups = sections.get("skill_groups", [])
        new_groups = _merge_skill_groups(parsed.get("skill_groups"), original_groups)
        # Compare as (category, skills) sets so a model that echoes the same
        # groups back (in a different order, or after being asked to change
        # them and deciding not to) isn't reported as a change either — same
        # "only report a real diff" guarantee as the summary/entry checks.
        original_signature = {(g.get("category", ""), tuple(g.get("skills", []))) for g in original_groups}
        new_signature = {(g["category"], tuple(g["skills"])) for g in new_groups} if new_groups is not None else None
        if new_groups is not None and new_signature != original_signature:
            # normalize_sections() below mints a fresh id for each group here
            # (categories may have been relabeled/reorganized, so there's no
            # stable id to preserve the way entry-list sections have).
            merged["skill_groups"] = new_groups
            changed_sections.append("skills")
            changes.append({"section": "skills", "before": original_groups, "after": new_groups})

    for key, text_field in _AUTO_TAILOR_ENTRY_TEXT_FIELD.items():
        if key not in notes_by_key:
            continue
        original_entries = sections.get(key, [])
        new_entries, entry_changes = _merge_entries(parsed.get(key), original_entries, text_field)
        if entry_changes:
            merged[key] = new_entries
            changed_sections.append(key)
            label_fn = _AUTO_TAILOR_ENTRY_LABEL_FIELDS[key]
            original_by_id = {e.get("id"): e for e in original_entries}
            changes.append(
                {
                    "section": key,
                    "entries": [
                        {"id": c["id"], "label": label_fn(original_by_id.get(c["id"], {})), "before": c["before"], "after": c["after"]}
                        for c in entry_changes
                    ],
                }
            )

    return {
        "sections": normalize_sections(merged),
        "changed_sections": changed_sections,
        "changes": changes,
        "error": False,
        "reason": None,
    }
