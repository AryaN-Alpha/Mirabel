import logging
from typing import Any

from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from memory.services import deletion
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
    if kind in ("turn", "summary", "fact"):
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
        "fact_type": meta.get("fact_type"),
        "status": meta.get("status", "active"),
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


def _parse_deletion_params(request: Request) -> tuple[str, str | None, str | None, str | None]:
    scope = (request.GET.get("scope") or "range").strip()
    date_from = (request.GET.get("date_from") or "").strip() or None
    date_to = (request.GET.get("date_to") or "").strip() or None
    kind = (request.GET.get("kind") or "").strip() or None
    if kind not in (None, "turn", "summary", "fact"):
        kind = None
    return scope, date_from, date_to, kind


@api_view(["GET"])
def memory_delete_preview(request: Request) -> Response:
    """Dry-run count for the danger-zone delete UI — lets the frontend show
    'Delete 42 memories?' before the user commits to the real DELETE call."""
    scope, date_from, date_to, kind = _parse_deletion_params(request)
    if scope == "all":
        return Response({"count": deletion.count_all()})
    if not date_from and not date_to and not kind:
        return Response({"error": "Specify date_from, date_to, or kind, or scope=all."}, status=400)
    return Response({"count": deletion.count_range(date_from=date_from, date_to=date_to, kind=kind)})


@api_view(["DELETE"])
def memory_delete(request: Request) -> Response:
    """Hard-deletes memories from both Chroma and Postgres. scope=all wipes
    the entire store; scope=range (default) requires at least one of
    date_from/date_to/kind so an empty query can never delete everything
    by accident."""
    scope, date_from, date_to, kind = _parse_deletion_params(request)
    if scope == "all":
        return Response(deletion.delete_all())
    if not date_from and not date_to and not kind:
        return Response({"error": "Specify date_from, date_to, or kind, or scope=all."}, status=400)
    return Response(deletion.delete_range(date_from=date_from, date_to=date_to, kind=kind))
