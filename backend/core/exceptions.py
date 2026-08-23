import logging

from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger("core.exceptions")


def custom_exception_handler(exc, context):
    """
    Wraps DRF's default exception handler so every error response — including
    ones DRF doesn't recognize (DB errors, bugs) — comes back as consistent
    {"error": "..."} JSON instead of an HTML page or an opaque 500.
    """
    response = exception_handler(exc, context)
    if response is not None:
        if isinstance(response.data, dict) and "detail" in response.data:
            response.data = {"error": str(response.data["detail"])}
        return response

    logger.error("Unhandled exception in %s: %s", context.get("view"), exc, exc_info=True)
    return Response({"error": "Something went wrong on our end. Try again in a bit."}, status=500)
