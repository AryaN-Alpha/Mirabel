import pdfplumber

# Caps the text handed to the structuring LLM call regardless of how large a
# PDF is uploaded — an unbounded-input cost/DoS guard, same reasoning as
# MAX_MESSAGE_LENGTH in the chat view.
MAX_EXTRACTED_CHARS = 15000
MAX_HYPERLINKS = 30


def extract_text(file_field) -> str:
    """Extracts text from an uploaded CV PDF via the given Django FieldFile."""
    file_field.open("rb")
    try:
        with pdfplumber.open(file_field) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
    finally:
        file_field.close()
    return "\n\n".join(pages).strip()[:MAX_EXTRACTED_CHARS]


def extract_hyperlinks(file_field) -> list[dict]:
    """Maps each embedded PDF hyperlink to its visible label text.

    Plain text extraction only ever sees the visible label ("LinkedIn",
    "Portfolio", "Website") — the actual href lives in a separate link
    annotation with its own bounding box, invisible to extract_text(). This
    finds the words whose position overlaps each link's box so the
    structuring prompt can recover the real URL instead of leaving it as
    the label text (which normalize_sections would otherwise happily accept
    as a "url", since it has no way to know it isn't one).
    """
    results: list[dict] = []
    file_field.open("rb")
    try:
        with pdfplumber.open(file_field) as pdf:
            for page in pdf.pages:
                if not page.hyperlinks:
                    continue
                words = page.extract_words()
                for link in page.hyperlinks:
                    label = " ".join(
                        w["text"]
                        for w in words
                        if w["x1"] > link["x0"]
                        and w["x0"] < link["x1"]
                        and w["bottom"] > link["top"]
                        and w["top"] < link["bottom"]
                    ).strip()
                    uri = (link.get("uri") or "").strip()
                    if label and uri:
                        results.append({"label": label, "url": uri})
                    if len(results) >= MAX_HYPERLINKS:
                        return results
    finally:
        file_field.close()
    return results
