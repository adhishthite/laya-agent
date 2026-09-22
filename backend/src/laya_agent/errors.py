"""Shared helpers for turning HTTP failures into readable errors."""

import re

_TAG = re.compile(r"<[^>]+>")
_WHITESPACE = re.compile(r"\s+")
_MAX_DETAIL_CHARS = 240


def summarise_http_error(service: str, endpoint: str, status_code: int, body: str) -> str:
    """Build a single-line error that names the service, the cause, and the fix.

    Upstream proxies answer with full HTML error pages. Passing that straight to
    the caller floods the UI with markup and hides the real problem, so the body
    is stripped to plain text and clipped.
    """
    detail = _WHITESPACE.sub(" ", _TAG.sub(" ", body)).strip()
    if len(detail) > _MAX_DETAIL_CHARS:
        detail = f"{detail[:_MAX_DETAIL_CHARS]}..."

    hint = _HINTS.get(status_code)
    parts = [f"{service} returned HTTP {status_code} for {endpoint}."]
    if hint:
        parts.append(hint)
    if detail:
        parts.append(f"Upstream said: {detail}")
    return " ".join(parts)


_HINTS = {
    401: "The request carried no valid identity token.",
    403: "The caller identity is not allowed to invoke this endpoint.",
    404: "That endpoint does not exist. Check the configured URL and its path.",
    429: "The endpoint is rate limited. Retry later.",
    503: "The endpoint is unavailable. The backing instance may be cold or stopped.",
}
