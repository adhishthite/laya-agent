"""Authentication helpers for Cloud Run IAM-protected endpoints."""

import base64
import json
import shutil
import subprocess
import threading
import time

import google.auth
from google.auth.transport.requests import Request
from google.oauth2 import id_token

# Identity tokens are valid for an hour, but fetching one costs a ~1.1 s gcloud
# subprocess. Paying that on every inference call made a 37 ms GPU look slower
# than the CPU baseline it was meant to beat, so the token is held until it is
# genuinely close to expiring.
_REFRESH_MARGIN_SECONDS = 300.0
_FALLBACK_LIFETIME_SECONDS = 1800.0

_cache_lock = threading.Lock()
_cached_token: str | None = None
_cached_expiry: float = 0.0


def _expiry_of(token: str) -> float:
    """Read the `exp` claim, or fall back to a conservative lifetime.

    The payload is read without verifying the signature. That is safe here: the
    value only decides when to refresh, and a forged token would fail at the
    server anyway.
    """
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
        return float(claims["exp"])
    except (IndexError, ValueError, KeyError, TypeError):
        return time.time() + _FALLBACK_LIFETIME_SECONDS


def clear_identity_token_cache() -> None:
    """Drop the cached token. Used by tests and after an auth failure."""
    global _cached_token, _cached_expiry
    with _cache_lock:
        _cached_token = None
        _cached_expiry = 0.0


def get_identity_token(audience: str | None = None) -> str:
    """Return a cached identity token, fetching a new one only when needed.

    Args:
        audience: The target audience URL (Cloud Run service URL).

    Returns:
        A valid OpenID Connect identity token string.
    """
    global _cached_token, _cached_expiry

    # compare() runs two engines on a thread pool, so two callers can arrive at
    # once. The lock keeps them from each paying for their own subprocess.
    with _cache_lock:
        if _cached_token and time.time() < _cached_expiry - _REFRESH_MARGIN_SECONDS:
            return _cached_token

        token = _fetch_identity_token(audience)
        _cached_token = token
        _cached_expiry = _expiry_of(token)
        return token


def _fetch_identity_token(audience: str | None = None) -> str:
    """Obtain a fresh identity token from the first source that works."""

    # 1. First prioritize gcloud CLI if available, using the active authenticated account
    if shutil.which("gcloud"):
        try:
            cmd = ["gcloud", "auth", "print-identity-token"]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            token = result.stdout.strip()
            if token:
                return token
        except Exception:
            pass

    # 2. Try google-auth id_token if audience is provided
    if audience:
        try:
            auth_req = Request()
            token = id_token.fetch_id_token(auth_req, audience)
            if token:
                return token
        except Exception:
            pass

    # 3. Try default credentials id_token
    try:
        credentials, _ = google.auth.default()
        if hasattr(credentials, "id_token") and credentials.id_token:
            return credentials.id_token
        auth_req = Request()
        credentials.refresh(auth_req)
        if hasattr(credentials, "id_token") and credentials.id_token:
            return credentials.id_token
    except Exception:
        pass

    raise RuntimeError(
        "Could not obtain a valid GCP identity token. "
        "Run 'gcloud auth login' or configure GOOGLE_APPLICATION_CREDENTIALS."
    )
