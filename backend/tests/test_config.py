"""Tests for configuration and models."""

import pytest

from laya_agent.config import Settings
from laya_agent.errors import summarise_http_error
from laya_agent.models import DecisionResult, QuestionType, SourceContribution, System1Decision

_CONFIG_ENV_VARS = (
    "GOOGLE_CLOUD_PROJECT",
    "VERTEX_LOCATION",
    "GEMINI_MODEL",
    "LAYA_ENDPOINT",
    "LAYA_TIMEOUT_SECONDS",
    "JEV_ENDPOINT",
    "TYPESAFE_API_KEY",
    "CONFIDENCE_THRESHOLD",
    "MAX_SEARCH_SOURCES",
)


def test_settings_defaults(monkeypatch: pytest.MonkeyPatch):
    # Settings reads the process environment, so clear it to test the fallbacks.
    for name in _CONFIG_ENV_VARS:
        monkeypatch.delenv(name, raising=False)

    settings = Settings()
    assert settings.project_id == "your-gcp-project-id"
    assert settings.gemini_model == "gemini-3.5-flash-lite"
    assert "laya-system1-proxy" in settings.laya_endpoint
    assert settings.confidence_threshold == 0.60


def test_settings_read_environment(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LAYA_ENDPOINT", "https://example.invalid/predict")
    monkeypatch.setenv("CONFIDENCE_THRESHOLD", "0.25")

    settings = Settings()
    assert settings.laya_endpoint == "https://example.invalid/predict"
    assert settings.confidence_threshold == 0.25


def test_summarise_http_error_strips_html():
    message = summarise_http_error(
        "Laya proxy",
        "https://example.invalid/predict",
        404,
        "<html><head><title>404</title></head><body><h1>Error: Page not found</h1></body></html>",
    )
    assert "<" not in message
    assert "HTTP 404" in message
    assert "https://example.invalid/predict" in message
    assert "That endpoint does not exist" in message


def test_summarise_http_error_clips_long_bodies():
    message = summarise_http_error("Jev API", "https://example.invalid", 500, "x" * 5000)
    assert len(message) < 400
    assert message.endswith("...")


def test_models_serialization():
    s1 = System1Decision(
        decision_key="decision",
        type=QuestionType.CHOICE,
        choice="yes",
        probabilities={"yes": 0.92, "no": 0.08},
        confidence=0.61,
        latency_ms=45.0,
        sources=[
            SourceContribution(
                source_text="Test source",
                impact_points=12.5,
                is_supporting=True,
            )
        ],
    )
    assert s1.choice == "yes"
    assert len(s1.sources) == 1
    assert s1.sources[0].impact_points == 12.5

    result = DecisionResult(
        query="Test query",
        decision="yes",
        confidence=0.61,
        probabilities={"yes": 0.92, "no": 0.08},
        handled_by="System 1 (Laya)",
        sources=s1.sources,
        total_latency_ms=120.0,
    )
    assert result.decision == "yes"
    assert result.handled_by == "System 1 (Laya)"
