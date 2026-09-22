"""FastAPI Server exposing Dual-Process Agent and Comparison endpoints."""

from collections.abc import Iterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from laya_agent.agent import DualProcessAgent
from laya_agent.config import Settings
from laya_agent.health import probe_laya
from laya_agent.models import (
    ComparisonResult,
    DecisionResult,
    LayaProbe,
    QuestionType,
    StreamEvent,
    StreamStage,
    StreamStatus,
)

app = FastAPI(
    title="Laya Dual-Process Agent API",
    description="Backend service combining Gemini 3.5 Flash-Lite and ConvAI Laya / TypeSafe Jev",
    version="0.1.0",
)

# Enable CORS for frontend development and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DecideRequest(BaseModel):
    """Payload for /api/decide endpoint."""

    query: str
    criteria: dict[str, str] = Field(
        default_factory=lambda: {
            "yes": "Rain is likely",
            "no": "Dry or negligible rain chance",
        }
    )
    question_type: str = "choice"
    enable_search: bool = True
    compute_attribution: bool = True
    confidence_threshold: float = 0.60
    force_system2: bool = False


class CompareRequest(BaseModel):
    """Payload for /api/compare endpoint."""

    query: str
    criteria: dict[str, str] = Field(
        default_factory=lambda: {
            "yes": "Rain is likely",
            "no": "Dry or negligible rain chance",
        }
    )
    question_type: str = "choice"
    enable_search: bool = True
    compute_attribution: bool = True


@app.get("/api/status")
def get_status() -> dict:
    """Return backend status and active model configuration."""
    settings = Settings()
    return {
        "status": "healthy",
        "project_id": settings.project_id,
        "vertex_location": settings.vertex_location,
        "gemini_model": settings.gemini_model,
        "laya_endpoint": settings.laya_endpoint,
        "jev_configured": bool(settings.typesafe_api_key),
    }


@app.get("/api/health/laya", response_model=LayaProbe)
def get_laya_health() -> LayaProbe:
    """Check whether Laya can answer right now, and name the link that is broken.

    Always answers 200. The probe result carries the failure, so the caller never
    has to parse an error to learn that something is down.
    """
    return probe_laya()


@app.post("/api/decide", response_model=DecisionResult)
def decide(req: DecideRequest) -> DecisionResult:
    """Execute a dual-process decision."""
    try:
        settings = Settings(confidence_threshold=req.confidence_threshold)
        agent = DualProcessAgent(settings=settings)
        q_type = (
            QuestionType.CHOICE if req.question_type.lower() == "choice" else QuestionType.SCORE
        )
        return agent.decide(
            query=req.query,
            criteria=req.criteria,
            question_type=q_type,
            enable_search=req.enable_search,
            compute_attribution=req.compute_attribution,
            force_system2=req.force_system2,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/compare", response_model=ComparisonResult)
def compare(req: CompareRequest) -> ComparisonResult:
    """Execute parallel comparison of Laya vs Jev."""
    try:
        agent = DualProcessAgent()
        q_type = (
            QuestionType.CHOICE if req.question_type.lower() == "choice" else QuestionType.SCORE
        )
        return agent.compare(
            query=req.query,
            criteria=req.criteria,
            question_type=q_type,
            enable_search=req.enable_search,
            compute_attribution=req.compute_attribution,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


def _ndjson(events: Iterator[StreamEvent]) -> Iterator[str]:
    """Serialise a run as one JSON object per line.

    The HTTP status is already on the wire by the time a stage can fail, so a
    late failure cannot become a 500. It is emitted as a final event instead and
    the caller reads the error from the body.
    """
    try:
        for event in events:
            yield f"{event.model_dump_json(exclude_none=True)}\n"
    except Exception as exc:  # noqa: BLE001 - reported to the caller, not swallowed
        failure = StreamEvent(
            stage=StreamStage.RESULT,
            status=StreamStatus.ERROR,
            elapsed_ms=0.0,
            error=str(exc),
        )
        yield f"{failure.model_dump_json(exclude_none=True)}\n"


def _stream(events: Iterator[StreamEvent]) -> StreamingResponse:
    """Wrap an event iterator in a response that proxies will not buffer."""
    return StreamingResponse(
        _ndjson(events),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            # Without this, a buffering reverse proxy holds every line until the
            # run finishes, which defeats the point of streaming.
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/decide/stream")
def decide_stream(req: DecideRequest) -> StreamingResponse:
    """Execute a dual-process decision, reporting each stage as it finishes."""
    settings = Settings(confidence_threshold=req.confidence_threshold)
    agent = DualProcessAgent(settings=settings)
    q_type = QuestionType.CHOICE if req.question_type.lower() == "choice" else QuestionType.SCORE
    return _stream(
        agent.decide_stream(
            query=req.query,
            criteria=req.criteria,
            question_type=q_type,
            enable_search=req.enable_search,
            compute_attribution=req.compute_attribution,
            force_system2=req.force_system2,
        )
    )


@app.post("/api/compare/stream")
def compare_stream(req: CompareRequest) -> StreamingResponse:
    """Compare Laya and Jev, reporting each engine the moment it answers."""
    agent = DualProcessAgent()
    q_type = QuestionType.CHOICE if req.question_type.lower() == "choice" else QuestionType.SCORE
    return _stream(
        agent.compare_stream(
            query=req.query,
            criteria=req.criteria,
            question_type=q_type,
            enable_search=req.enable_search,
            compute_attribution=req.compute_attribution,
        )
    )
