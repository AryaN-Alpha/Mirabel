import requests

from classroom.services.oauth import ClassroomError, error_detail, reason_for_status

DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
DOCS_API_BASE = "https://docs.googleapis.com/v1"
_TIMEOUT = 20

_GOOGLE_DOC_MIMETYPE = "application/vnd.google-apps.document"


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def get_file_metadata(token: str, file_id: str) -> dict:
    try:
        resp = requests.get(
            f"{DRIVE_API_BASE}/files/{file_id}",
            headers=_headers(token),
            params={"fields": "id,name,mimeType"},
            timeout=_TIMEOUT,
        )
    except requests.RequestException:
        return {}
    if not resp.ok:
        return {}
    return resp.json()


def export_doc_as_text(token: str, file_id: str) -> str:
    """Best-effort content enrichment, never raises. Only works for native
    Google Docs — PDF/image/Office-format attachments return "" and the
    solver falls back to just the coursework title+description. OCR/PDF text
    extraction is out of scope for this app."""
    metadata = get_file_metadata(token, file_id)
    if metadata.get("mimeType") != _GOOGLE_DOC_MIMETYPE:
        return ""
    try:
        resp = requests.get(
            f"{DRIVE_API_BASE}/files/{file_id}/export",
            headers=_headers(token),
            params={"mimeType": "text/plain"},
            timeout=_TIMEOUT,
        )
    except requests.RequestException:
        return ""
    if not resp.ok:
        return ""
    return resp.text


def create_solution_doc(token: str, *, title: str, body_text: str) -> tuple[str, str]:
    """Creates a Google Doc with the AI-drafted answer and returns
    (file_id, web_view_link) so it can be attached to a student submission.
    Two-call approach: Drive creates the (empty) Doc, Docs batchUpdate writes
    the body text — this is Google's own documented pattern for this, and
    more predictable than Drive's implicit plain-text-to-Doc conversion."""
    try:
        create_resp = requests.post(
            f"{DRIVE_API_BASE}/files",
            headers=_headers(token),
            params={"fields": "id,webViewLink"},
            json={"name": title, "mimeType": _GOOGLE_DOC_MIMETYPE},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise ClassroomError(f"Couldn't reach Google Drive: {exc}") from exc
    if not create_resp.ok:
        raise ClassroomError(
            error_detail(create_resp), reason=reason_for_status(create_resp.status_code)
        )
    created = create_resp.json()
    file_id = created["id"]
    web_view_link = created.get("webViewLink", "")

    try:
        update_resp = requests.post(
            f"{DOCS_API_BASE}/documents/{file_id}:batchUpdate",
            headers=_headers(token),
            json={
                "requests": [
                    {"insertText": {"location": {"index": 1}, "text": body_text}}
                ]
            },
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise ClassroomError(f"Couldn't reach Google Docs: {exc}") from exc
    if not update_resp.ok:
        raise ClassroomError(
            error_detail(update_resp), reason=reason_for_status(update_resp.status_code)
        )

    return file_id, web_view_link
