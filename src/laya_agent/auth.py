"""Authentication helpers for Cloud Run IAM-protected endpoints."""

import shutil
import subprocess

import google.auth
from google.auth.transport.requests import Request
from google.oauth2 import id_token


def get_identity_token(audience: str | None = None) -> str:
    """Retrieve an identity token for authenticating to Cloud Run.

    Args:
        audience: The target audience URL (Cloud Run service URL).

    Returns:
        A valid OpenID Connect identity token string.
    """
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
