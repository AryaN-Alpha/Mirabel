import logging
from typing import Any

from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from memory.services.chroma_client import collection_stats, list_memories

logger = logging.getLogger(__name__)

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def _build_where(request: Request) -> dict[str, Any] | None:
    conditions: list[dict[str, Any]] = []

    moods = request.GET.getlist("mood")
    if moods:
        conditions.append({"mood": {"$in": moods}})

    kind = (request.GET.get("kind") or "").strip()
    if kind in ("turn", "summary"):
        conditions.append({"kind": kind})

    date_from = (request.GET.get("date_from") or "").strip()
    if date_from:
        conditions.append({"created_at": {"$gte": date_from}})

    date_to = (request.GET.get("date_to") or "").strip()
    if date_to:
        conditions.append({"created_at": {"$lte": date_to}})

    min_salience = (request.GET.get("min_salience") or "").strip()
    if min_salience:
        try:
            conditions.append({"salience": {"$gte": float(min_salience)}})
        except ValueError:
            pass

    if not conditions:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


def _serialize_memory(item: dict[str, Any]) -> dict[str, Any]:
    meta = item["metadata"]
    return {
        "id": item["id"],
        "text": item["text"],
        "role": meta.get("role"),
        "mood": meta.get("mood"),
        "salience": meta.get("salience"),
        "kind": meta.get("kind", "turn"),
        "created_at": meta.get("created_at"),
        "conversation_id": meta.get("conversation_id"),
    }


@api_view(["GET"])
def memories(request: Request) -> Response:
    try:
        page = max(1, int(request.GET.get("page", 1)))
    except ValueError:
        page = 1
    try:
        page_size = int(request.GET.get("page_size", DEFAULT_PAGE_SIZE))
    except ValueError:
        page_size = DEFAULT_PAGE_SIZE
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))

    sort = request.GET.get("sort", "created_at")
    q = (request.GET.get("q") or "").strip()

    where = _build_where(request)
    where_document = {"$contains": q} if q else None

    try:
        total, page_items = list_memories(
            where=where,
            where_document=where_document,
            sort=sort,
            limit=page_size,
            offset=(page - 1) * page_size,
        )
    except Exception as exc:
        logger.exception("memory list failed: %s", exc)
        return Response({"total": 0, "page": page, "page_size": page_size, "results": []})

    return Response(
        {
            "total": total,
            "page": page,
            "page_size": page_size,
            "results": [_serialize_memory(item) for item in page_items],
        }
    )


@api_view(["GET"])
def memory_stats(_request: Request) -> Response:
    try:
        stats = collection_stats()
    except Exception as exc:
        logger.exception("memory stats failed: %s", exc)
        return Response({"total": 0, "mood_breakdown": {}, "oldest": None, "newest": None})
    return Response(stats)
