"""Configuration settings for Laya Agent."""

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Load local overrides before any field default reads the environment.
# Precedence: real environment > backend/.env > repo root .env > ~/.env.
for _candidate in (
    Path(__file__).resolve().parents[2] / ".env",
    Path(__file__).resolve().parents[3] / ".env",
    Path.home() / ".env",
):
    if _candidate.is_file():
        load_dotenv(_candidate, override=False)


class Settings(BaseModel):
    """Runtime configuration settings."""

    # GCP & Vertex AI configuration
    project_id: str = Field(
        default_factory=lambda: os.getenv("GOOGLE_CLOUD_PROJECT", "your-gcp-project-id")
    )
    vertex_location: str = Field(default_factory=lambda: os.getenv("VERTEX_LOCATION", "global"))
    gemini_model: str = Field(
        default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    )

    # Laya System 1 configuration
    laya_endpoint: str = Field(
        default_factory=lambda: os.getenv(
            "LAYA_ENDPOINT", "https://laya-system1-proxy-xyz123-uc.a.run.app/predict"
        )
    )
    # Must exceed the proxy's own upstream deadline (~30 s). Matching it means we
    # abandon a fraction of a second early and replace its 502 with a bare socket
    # timeout, which says nothing about what broke.
    laya_timeout_seconds: float = Field(
        default_factory=lambda: float(os.getenv("LAYA_TIMEOUT_SECONDS", "45.0"))
    )
    # The header probe must fail fast. A warm Laya answers in well under a second;
    # the headroom covers a Cloud Run cold start at min-instances 0.
    laya_probe_timeout_seconds: float = Field(
        default_factory=lambda: float(os.getenv("LAYA_PROBE_TIMEOUT_SECONDS", "8.0"))
    )

    # TypeSafe Jev configuration
    jev_endpoint: str = Field(
        default_factory=lambda: os.getenv("JEV_ENDPOINT", "https://api.typesafe.ai/v1/systemone")
    )
    typesafe_api_key: str | None = Field(default_factory=lambda: os.getenv("TYPESAFE_API_KEY"))

    # Agent thresholds
    confidence_threshold: float = Field(
        default_factory=lambda: float(os.getenv("CONFIDENCE_THRESHOLD", "0.60"))
    )
    max_search_evidence_sources: int = Field(
        default_factory=lambda: int(os.getenv("MAX_SEARCH_SOURCES", "5"))
    )
