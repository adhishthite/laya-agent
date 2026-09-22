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
    """Raw output from Laya System 1."""

    decision_key: str
    type: QuestionType
    choice: str | None = None
    score: float | None = None
    probabilities: dict[str, float] = Field(default_factory=dict)
    confidence: float = 0.0
    latency_ms: float = 0.0
    sources: list[SourceContribution] = Field(default_factory=list)


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


class ComparisonResult(BaseModel):
    """Side-by-side comparison of Laya vs Jev."""

    query: str
    evidence: list[str] = Field(default_factory=list)
    laya: System1Decision
    jev: System1Decision
    agreement: bool
    latency_diff_ms: float
    speedup_factor: float
    total_latency_ms: float = 0.0
