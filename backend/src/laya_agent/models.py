"""Data models for System 1 and System 2 decision-making."""

from enum import Enum

from pydantic import BaseModel, Field


class QuestionType(str, Enum):
    """Supported question types in Laya System 1."""

    CHOICE = "choice"
    SCORE = "score"
    NOUL = "noul"


class ProbeState(str, Enum):
    """Which link in the decision chain the reachability probe reached."""

    READY = "ready"
    BACKEND_DOWN = "backend_down"
    AUTH = "auth"
    ERROR = "error"


class LayaProbe(BaseModel):
    """Result of a live reachability check against the Laya decision backend."""

    state: ProbeState
    endpoint: str
    http_status: int | None = None
    latency_ms: float = 0.0
    detail: str = ""


class SourceContribution(BaseModel):
    """Leave-one-out source contribution analysis."""

    source_text: str
    impact_points: float
    is_supporting: bool


class System1Decision(BaseModel):
    """Raw output from a System 1 engine.

    An engine that could not answer returns this with `error` set and every
    other field left at its default. Callers check `error` rather than catching,
    because one dead engine must not cancel the ones that still work.
    """

    decision_key: str
    type: QuestionType
    choice: str | None = None
    score: float | None = None
    probabilities: dict[str, float] = Field(default_factory=dict)
    confidence: float = 0.0
    latency_ms: float = 0.0
    sources: list[SourceContribution] = Field(default_factory=list)
    error: str | None = None


class System2Synthesis(BaseModel):
    """Output from Gemini 3.5 Flash-Lite System 2 deliberation."""

    explanation: str
    risk_assessment: str | None = None
    recommended_action: str | None = None
    latency_ms: float = 0.0


class DecisionResult(BaseModel):
    """End-to-end result from the Dual-Process Agent."""

    query: str
    decision: str
    confidence: float
    probabilities: dict[str, float]
    handled_by: str  # "System 1 (Laya)" or "System 2 (Gemini Deliberation)"
    search_enabled: bool = False
    evidence: list[str] = Field(default_factory=list)
    sources: list[SourceContribution] = Field(default_factory=list)
    system2_synthesis: System2Synthesis | None = None
    total_latency_ms: float = 0.0
    # Set when Laya could not answer. The result still carries System 2's
    # deliberation, so the caller gets a reasoned answer rather than a 500.
    system1_error: str | None = None


class ComparisonResult(BaseModel):
    """Side-by-side comparison of Laya vs Jev.

    The three comparison metrics are None whenever either engine failed. A
    speedup against an engine that never answered is not a slow result, it is
    no result, and reporting 0.0 would read as a real measurement.
    """

    query: str
    evidence: list[str] = Field(default_factory=list)
    laya: System1Decision
    jev: System1Decision
    agreement: bool | None = None
    latency_diff_ms: float | None = None
    speedup_factor: float | None = None
    total_latency_ms: float = 0.0


class StreamStage(str, Enum):
    """Which step of the pipeline an event describes."""

    SEARCH = "search"
    LAYA = "laya"
    JEV = "jev"
    DELIBERATION = "deliberation"
    RESULT = "result"


class StreamStatus(str, Enum):
    """Where that step got to."""

    START = "start"
    DONE = "done"
    ERROR = "error"


class StreamEvent(BaseModel):
    """One line of a streamed run.

    A full run takes tens of seconds and spends most of it waiting on three
    different backends. Holding every stage until the last one finishes makes a
    working run indistinguishable from a hang, so each stage is reported as it
    happens and the caller renders it immediately.

    Only the payload field that belongs to the stage is populated; the rest are
    dropped on the wire.
    """

    stage: StreamStage
    status: StreamStatus
    # Measured from the start of the run, not of the stage, so the caller can
    # place each event on one timeline without doing arithmetic.
    elapsed_ms: float
    evidence: list[str] | None = None
    decision: System1Decision | None = None
    synthesis: System2Synthesis | None = None
    decision_result: DecisionResult | None = None
    comparison: ComparisonResult | None = None
    error: str | None = None
