"""Tests for configuration and models."""

from laya_agent.config import Settings
from laya_agent.models import DecisionResult, QuestionType, SourceContribution, System1Decision


def test_settings_defaults():
    settings = Settings()
    assert settings.project_id == "your-gcp-project-id"
    assert settings.gemini_model == "gemini-3.5-flash-lite"
    assert "laya-system1-proxy" in settings.laya_endpoint
    assert settings.confidence_threshold == 0.60


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
