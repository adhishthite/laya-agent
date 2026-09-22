"""Tests for DualProcessAgent orchestrator."""

from unittest.mock import MagicMock

from laya_agent.agent import DualProcessAgent
from laya_agent.config import Settings
from laya_agent.models import QuestionType, System1Decision, System2Synthesis


def test_agent_system1_high_confidence():
    settings = Settings(confidence_threshold=0.60)
    mock_s1 = MagicMock()
    mock_s2 = MagicMock()

    mock_s2.search_web.return_value = ["Source 1", "Source 2"]
    mock_s1.predict.return_value = System1Decision(
        decision_key="decision",
        type=QuestionType.CHOICE,
        choice="yes",
        probabilities={"yes": 0.95, "no": 0.05},
        confidence=0.85,
        latency_ms=35.0,
    )

    agent = DualProcessAgent(settings=settings, system1_client=mock_s1, system2_client=mock_s2)
    result = agent.decide(
        query="Should I take an umbrella?",
        criteria={"yes": "Rain", "no": "Dry"},
    )

    assert result.decision == "yes"
    assert result.handled_by == "System 1 (Laya)"
    assert result.system2_synthesis is None
    mock_s2.search_web.assert_called_once()
    mock_s1.predict.assert_called_once()
    mock_s2.deliberate.assert_not_called()


def test_agent_system2_escalation_on_low_confidence():
    settings = Settings(confidence_threshold=0.60)
    mock_s1 = MagicMock()
    mock_s2 = MagicMock()

    mock_s2.search_web.return_value = ["Conflicting source A", "Conflicting source B"]
    mock_s1.predict.return_value = System1Decision(
        decision_key="decision",
        type=QuestionType.CHOICE,
        choice="yes",
        probabilities={"yes": 0.52, "no": 0.48},
        confidence=0.40,  # Below threshold
        latency_ms=35.0,
    )
    mock_s2.deliberate.return_value = System2Synthesis(
        explanation="Evidence is ambiguous. Low confidence detected.",
        latency_ms=450.0,
    )

    agent = DualProcessAgent(settings=settings, system1_client=mock_s1, system2_client=mock_s2)
    result = agent.decide(
        query="Ambiguous query?",
        criteria={"yes": "Yes", "no": "No"},
    )

    assert result.handled_by == "System 2 (Gemini Deliberation)"
    assert result.system2_synthesis is not None
    assert "ambiguous" in result.system2_synthesis.explanation.lower()
    mock_s2.deliberate.assert_called_once()


def test_agent_compare_laya_vs_jev():
    mock_s1 = MagicMock()
    mock_s2 = MagicMock()
    mock_jev = MagicMock()

    mock_s2.search_web.return_value = ["Weather Report Tokyo"]
    mock_s1.predict.return_value = System1Decision(
        decision_key="decision",
        type=QuestionType.CHOICE,
        choice="yes",
        probabilities={"yes": 0.90, "no": 0.10},
        confidence=0.60,
        latency_ms=37.0,
    )
    mock_jev.predict.return_value = System1Decision(
        decision_key="decision",
        type=QuestionType.CHOICE,
        choice="yes",
        probabilities={"yes": 0.85, "no": 0.15},
        confidence=0.55,
        latency_ms=260.0,
    )

    agent = DualProcessAgent(
        system1_client=mock_s1,
        system2_client=mock_s2,
        jev_client=mock_jev,
    )

    result = agent.compare(
        query="Should I take an umbrella in Tokyo?",
        criteria={"yes": "Rain", "no": "Dry"},
    )

    assert result.agreement is True
    assert result.laya.choice == "yes"
    assert result.jev.choice == "yes"
    assert result.speedup_factor > 1.0
    assert result.latency_diff_ms == 223.0
    mock_s1.predict.assert_called_once()
    mock_jev.predict.assert_called_once()


def test_decide_falls_through_to_gemini_when_laya_is_down():
    """A dead GPU VM must not fail the request: Gemini answers alone."""
    settings = Settings(confidence_threshold=0.60)
    mock_s1 = MagicMock()
    mock_s2 = MagicMock()

    mock_s2.search_web.return_value = ["Source 1"]
    mock_s1.predict.side_effect = RuntimeError("Laya API returned HTTP 502")
    mock_s2.deliberate.return_value = System2Synthesis(
        explanation="Reasoned without a System 1 prior.",
        latency_ms=400.0,
    )

    agent = DualProcessAgent(settings=settings, system1_client=mock_s1, system2_client=mock_s2)
    result = agent.decide(query="Should I take an umbrella?", criteria={"yes": "Rain", "no": "Dry"})

    assert result.decision == "unavailable"
    assert result.handled_by == "System 2 (Gemini alone, Laya unavailable)"
    assert result.system1_error is not None
    assert "502" in result.system1_error
    assert result.system2_synthesis is not None
    mock_s2.deliberate.assert_called_once()


def test_compare_returns_jev_when_laya_is_down():
    """Jev's answer survives a dead Laya instead of being cancelled with it."""
    mock_s1 = MagicMock()
    mock_s2 = MagicMock()
    mock_jev = MagicMock()

    mock_s2.search_web.return_value = ["Source 1"]
    mock_s1.predict.side_effect = RuntimeError("Laya API returned HTTP 502")
    mock_jev.predict.return_value = System1Decision(
        decision_key="decision",
        type=QuestionType.CHOICE,
        choice="yes",
        probabilities={"yes": 0.8, "no": 0.2},
        confidence=0.7,
        latency_ms=900.0,
    )

    agent = DualProcessAgent(system1_client=mock_s1, system2_client=mock_s2, jev_client=mock_jev)
    result = agent.compare(query="Rain?", criteria={"yes": "Rain", "no": "Dry"})

    assert result.laya.error is not None
    assert result.jev.error is None
    assert result.jev.choice == "yes"
    # Nothing to compare against, so the metrics are withheld rather than faked.
    assert result.agreement is None
    assert result.speedup_factor is None
    assert result.latency_diff_ms is None


def test_compare_still_scores_when_both_engines_answer():
    """The degraded path must not change the healthy path."""
    mock_s1 = MagicMock()
    mock_s2 = MagicMock()
    mock_jev = MagicMock()

    mock_s2.search_web.return_value = []
    mock_s1.predict.return_value = System1Decision(
        decision_key="decision",
        type=QuestionType.CHOICE,
        choice="yes",
        probabilities={"yes": 0.9, "no": 0.1},
        confidence=0.8,
        latency_ms=40.0,
    )
    mock_jev.predict.return_value = System1Decision(
        decision_key="decision",
        type=QuestionType.CHOICE,
        choice="yes",
        probabilities={"yes": 0.7, "no": 0.3},
        confidence=0.6,
        latency_ms=800.0,
    )

    agent = DualProcessAgent(system1_client=mock_s1, system2_client=mock_s2, jev_client=mock_jev)
    result = agent.compare(query="Rain?", criteria={"yes": "Rain", "no": "Dry"})

    assert result.agreement is True
    assert result.speedup_factor == 20.0
    assert result.latency_diff_ms == 760.0
