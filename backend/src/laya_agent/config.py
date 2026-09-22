"""Configuration settings for Laya Agent."""

import os

from pydantic import BaseModel, Field


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
    laya_timeout_seconds: float = Field(
        default_factory=lambda: float(os.getenv("LAYA_TIMEOUT_SECONDS", "30.0"))
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
