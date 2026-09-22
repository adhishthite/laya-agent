"""FastAPI Server exposing Dual-Process Agent and Comparison endpoints."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from laya_agent.agent import DualProcessAgent
from laya_agent.config import Settings
from laya_agent.health import probe_laya
from laya_agent.models import ComparisonResult, DecisionResult, LayaProbe, QuestionType

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
