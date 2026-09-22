"""Tests for the identity token cache."""

import base64
import json
import time
from unittest.mock import patch

from laya_agent import auth


def _token(exp: float) -> str:
    """Build a JWT-shaped string whose payload carries the given expiry."""
    payload = base64.urlsafe_b64encode(json.dumps({"exp": exp}).encode()).decode().rstrip("=")
    return f"header.{payload}.signature"


def test_second_call_reuses_the_cached_token():
    """Fetching costs a ~1.1 s subprocess, so it must happen once per hour."""
    auth.clear_identity_token_cache()
    fresh = _token(time.time() + 3600)

    with patch.object(auth, "_fetch_identity_token", return_value=fresh) as fetch:
        assert auth.get_identity_token() == fresh
        assert auth.get_identity_token() == fresh
        assert auth.get_identity_token() == fresh

    assert fetch.call_count == 1


def test_expiring_token_is_refreshed():
    """A token inside the refresh margin is replaced rather than reused."""
    auth.clear_identity_token_cache()
    nearly_expired = _token(time.time() + 60)
    replacement = _token(time.time() + 3600)

    with patch.object(auth, "_fetch_identity_token", return_value=nearly_expired):
        assert auth.get_identity_token() == nearly_expired

    with patch.object(auth, "_fetch_identity_token", return_value=replacement) as fetch:
        assert auth.get_identity_token() == replacement
        assert fetch.call_count == 1


def test_unparseable_token_still_caches():
    """An opaque token must not force a subprocess on every single call."""
    auth.clear_identity_token_cache()

    with patch.object(auth, "_fetch_identity_token", return_value="not-a-jwt") as fetch:
        assert auth.get_identity_token() == "not-a-jwt"
        assert auth.get_identity_token() == "not-a-jwt"

    assert fetch.call_count == 1


def test_clear_forces_a_refetch():
    auth.clear_identity_token_cache()
    fresh = _token(time.time() + 3600)

    with patch.object(auth, "_fetch_identity_token", return_value=fresh) as fetch:
        auth.get_identity_token()
        auth.clear_identity_token_cache()
        auth.get_identity_token()

    assert fetch.call_count == 2
