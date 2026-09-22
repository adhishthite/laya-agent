"""Tests for the streamed run pipeline and its NDJSON framing."""

import json
from unittest.mock import MagicMock

from laya_agent.agent import DualProcessAgent
from laya_agent.config import Settings
from laya_agent.models import (
    QuestionType,
    StreamEvent,
    StreamStage,
    StreamStatus,
    System1Decision,
    System2Synthesis,
)
from laya_agent.server import _ndjson


def _decision(choice: str, latency_ms: float, confidence: float = 0.9) -> System1Decision:
    return System1Decision(
        decision_key="decision",
        type=QuestionType.CHOICE,
        choice=choice,
        probabilities={"yes": 0.9, "no": 0.1},
        confidence=confidence,
        latency_ms=latency_ms,
    )


def test_decide_stream_reports_every_stage_in_order():
    settings = Settings(confidence_threshold=0.60)
    mock_s1, mock_s2 = MagicMock(), MagicMock()
    mock_s2.search_web.return_value = ["Source 1"]
    mock_s1.predict.return_value = _decision("yes", 40.0)

    agent = DualProcessAgent(settings=settings, system1_client=mock_s1, system2_client=mock_s2)
    events = list(agent.decide_stream(query="Rain?", criteria={"yes": "Rain", "no": "Dry"}))

    assert [(e.stage, e.status) for e in events] == [
        (StreamStage.SEARCH, StreamStatus.START),
        (StreamStage.SEARCH, StreamStatus.DONE),
        (StreamStage.LAYA, StreamStatus.START),
        (StreamStage.LAYA, StreamStatus.DONE),
        (StreamStage.RESULT, StreamStatus.DONE),
    ]
    assert events[1].evidence == ["Source 1"]
    assert events[-1].decision_result is not None


def test_decide_stream_announces_deliberation_before_running_it():
    """The start event must precede the call, or the UI cannot show the wait."""
    settings = Settings(confidence_threshold=0.60)
    mock_s1, mock_s2 = MagicMock(), MagicMock()
    mock_s2.search_web.return_value = []
    mock_s1.predict.return_value = _decision("yes", 40.0, confidence=0.2)
    mock_s2.deliberate.return_value = System2Synthesis(explanation="Ambiguous.", latency_ms=300.0)

    agent = DualProcessAgent(settings=settings, system1_client=mock_s1, system2_client=mock_s2)
    events = list(
        agent.decide_stream(
            query="Rain?", criteria={"yes": "Rain", "no": "Dry"}, enable_search=False
        )
    )

    stages = [(e.stage, e.status) for e in events]
    assert (StreamStage.DELIBERATION, StreamStatus.START) in stages
    assert stages.index((StreamStage.DELIBERATION, StreamStatus.START)) < stages.index(
        (StreamStage.DELIBERATION, StreamStatus.DONE)
    )
    assert events[-1].decision_result is not None


def test_compare_stream_emits_the_faster_engine_first():
    """Holding the fast answer until the slow one lands hides what is measured."""
    mock_s1, mock_s2, mock_jev = MagicMock(), MagicMock(), MagicMock()
    mock_s2.search_web.return_value = []

    def slow_jev(**_: object) -> System1Decision:
        import time

        time.sleep(0.25)
        return _decision("yes", 800.0)

    mock_s1.predict.return_value = _decision("yes", 40.0)
    mock_jev.predict.side_effect = slow_jev

    agent = DualProcessAgent(system1_client=mock_s1, system2_client=mock_s2, jev_client=mock_jev)
    events = list(
        agent.compare_stream(
            query="Rain?", criteria={"yes": "Rain", "no": "Dry"}, enable_search=False
        )
    )

    finished = [e.stage for e in events if e.status is StreamStatus.DONE and e.decision]
    assert finished == [StreamStage.LAYA, StreamStage.JEV]
    assert events[-1].comparison is not None
    assert events[-1].comparison.agreement is True


def test_compare_stream_still_finishes_when_one_engine_dies():
    mock_s1, mock_s2, mock_jev = MagicMock(), MagicMock(), MagicMock()
    mock_s2.search_web.return_value = []
    mock_s1.predict.side_effect = RuntimeError("Laya API returned HTTP 502")
    mock_jev.predict.return_value = _decision("yes", 800.0)

    agent = DualProcessAgent(system1_client=mock_s1, system2_client=mock_s2, jev_client=mock_jev)
    events = list(
        agent.compare_stream(
            query="Rain?", criteria={"yes": "Rain", "no": "Dry"}, enable_search=False
        )
    )

    laya_event = next(e for e in events if e.stage is StreamStage.LAYA and e.decision)
    assert laya_event.status is StreamStatus.ERROR
    assert events[-1].comparison is not None
    assert events[-1].comparison.jev.choice == "yes"
    assert events[-1].comparison.agreement is None


def test_ndjson_writes_one_object_per_line_without_empty_keys():
    events = iter(
        [
            StreamEvent(stage=StreamStage.SEARCH, status=StreamStatus.START, elapsed_ms=1.0),
            StreamEvent(
                stage=StreamStage.SEARCH,
                status=StreamStatus.DONE,
                elapsed_ms=2.0,
                evidence=["a"],
            ),
        ]
    )

    lines = list(_ndjson(events))

    assert all(line.endswith("\n") for line in lines)
    first = json.loads(lines[0])
    assert first == {"stage": "search", "status": "start", "elapsed_ms": 1.0}
    assert json.loads(lines[1])["evidence"] == ["a"]


def test_ndjson_turns_a_late_failure_into_a_final_event():
    """The status line is already sent, so a late failure cannot be a 500."""

    def exploding() -> object:
        yield StreamEvent(stage=StreamStage.SEARCH, status=StreamStatus.START, elapsed_ms=0.0)
        raise RuntimeError("Vertex refused the request")

    lines = list(_ndjson(exploding()))

    assert len(lines) == 2
    last = json.loads(lines[-1])
    assert last["stage"] == "result"
    assert last["status"] == "error"
    assert "Vertex refused the request" in last["error"]
