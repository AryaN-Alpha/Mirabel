def extract_json_object(text: str) -> str:
    """Strips a markdown code fence if present, then narrows to the outermost
    {...} span — covers models that add stray commentary before/after the
    JSON despite being told not to (the prompt says "no commentary", but
    that's not a guarantee). Shared by every service that asks the LLM for
    structured JSON output (structuring.py, tailoring.py, consistency.py)."""
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:]
        stripped = stripped.strip()
    start, end = stripped.find("{"), stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        return stripped[start : end + 1]
    return stripped
