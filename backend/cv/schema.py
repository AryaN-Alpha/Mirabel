"""Shared JSON schema for CVProfile.sections — the structured representation of
a CV. cv/prompts.py describes this shape to the AI-structuring call, and
normalize_sections() below is the single place that enforces it, whether the
JSON came from that AI call or from a manual frontend edit (cv/views.py calls
it on every PUT). Never validate this shape in two places.

Shaped after a two-column resume layout (dark sidebar: contact/skills-by-
category/education/strengths; main column: name/title/summary/experience/
projects) rather than a generic flat list, since that's the actual layout
this app renders (CvPreview.jsx, resume.html) and edits.
"""

import uuid

# Shared with cv/views.py (imported from here, not redefined) so the two
# ad-hoc AI-endpoint truncations and this PUT-path normalization agree on
# what "too long" means.
MAX_FIELD_LENGTH = 500
MAX_URL_LENGTH = 2000

PERSONAL_INFO_KEYS = ("name", "title", "email", "phone", "location")

EXPERIENCE_KEYS = ("title", "company", "location", "start_date", "end_date")
EDUCATION_KEYS = ("school", "degree", "location", "start_date", "end_date", "details")
PROJECT_KEYS = ("title", "tech", "description", "link")
CERTIFICATION_KEYS = ("name", "issuer", "date")
STRENGTH_KEYS = ("title", "description")

# Section -> (plain string keys, list-of-strings keys)
SECTION_ITEM_KEYS: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "experience": (EXPERIENCE_KEYS, ("bullets",)),
    "education": (EDUCATION_KEYS, ()),
    "projects": (PROJECT_KEYS, ()),
    "certifications": (CERTIFICATION_KEYS, ()),
    "strengths": (STRENGTH_KEYS, ()),
}


def empty_sections() -> dict:
    return {
        "personal_info": {"name": "", "title": "", "email": "", "phone": "", "location": "", "links": []},
        "summary": "",
        "experience": [],
        "education": [],
        "projects": [],
        "skill_groups": [],
        "strengths": [],
        "certifications": [],
    }


def _as_str(value) -> str:
    if value is None:
        return ""
    return str(value)


def _as_list(value) -> list:
    if isinstance(value, list):
        return value
    return []


def _link_dedupe_key(url: str) -> str:
    return url.strip().lower().rstrip("/")


def _normalize_links(raw) -> list[dict]:
    links = []
    seen_urls = set()
    for item in _as_list(raw):
        if isinstance(item, dict):
            url = _as_str(item.get("url")).strip()
            label = _as_str(item.get("label")).strip()
        elif isinstance(item, str) and item.strip():
            # The structuring prompt asks for {label, url} objects, but a
            # model occasionally returns bare URL strings instead — treat
            # that as a link with no label rather than silently dropping it.
            url = item.strip()
            label = ""
        else:
            continue
        if not url:
            continue
        # Same URL saved twice under different labels (or pasted twice) —
        # keep the first occurrence rather than storing a second, visually
        # near-identical row. Compared before truncation below so two
        # distinct long URLs that happen to share a truncated prefix are
        # never mistaken for duplicates.
        key = _link_dedupe_key(url)
        if key in seen_urls:
            continue
        seen_urls.add(key)
        links.append({"label": label[:MAX_FIELD_LENGTH], "url": url[:MAX_URL_LENGTH]})
    return links


def _normalize_string_list(raw) -> list[str]:
    return [s for s in (_as_str(v).strip() for v in _as_list(raw)) if s]


def _normalize_item(raw: dict, str_keys: tuple[str, ...], list_keys: tuple[str, ...]) -> dict:
    item = {key: _as_str(raw.get(key)) for key in str_keys}
    for key in list_keys:
        item[key] = _normalize_string_list(raw.get(key))
    item["id"] = _as_str(raw.get("id")) or uuid.uuid4().hex
    return item


def _normalize_skill_groups(raw) -> list[dict]:
    groups = []
    for item in _as_list(raw):
        if not isinstance(item, dict):
            continue
        skills = _normalize_string_list(item.get("skills") if "skills" in item else item.get("items"))
        if not skills:
            continue
        groups.append(
            {
                "id": _as_str(item.get("id")) or uuid.uuid4().hex,
                "category": _as_str(item.get("category")).strip(),
                "skills": skills,
            }
        )
    return groups


def normalize_sections(data) -> dict:
    """Coerces arbitrary parsed JSON (AI output or a frontend PUT body) into a
    well-formed sections dict: unknown keys dropped, missing keys defaulted,
    every list item stamped with a stable id."""
    if not isinstance(data, dict):
        data = {}
    result = empty_sections()

    personal_info_raw = data.get("personal_info")
    if isinstance(personal_info_raw, dict):
        for key in PERSONAL_INFO_KEYS:
            result["personal_info"][key] = _as_str(personal_info_raw.get(key))[:MAX_FIELD_LENGTH]
        result["personal_info"]["links"] = _normalize_links(personal_info_raw.get("links"))

    result["summary"] = _as_str(data.get("summary"))

    for section, (str_keys, list_keys) in SECTION_ITEM_KEYS.items():
        result[section] = [
            _normalize_item(item, str_keys, list_keys) for item in _as_list(data.get(section)) if isinstance(item, dict)
        ]

    result["skill_groups"] = _normalize_skill_groups(data.get("skill_groups"))

    return result
