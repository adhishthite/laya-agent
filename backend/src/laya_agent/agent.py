"""Dual-Process Agent Orchestrator combining System 1 (Laya / Jev) and System 2 (Gemini)."""

import time
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed

from laya_agent.config import Settings
from laya_agent.models import (
    ComparisonResult,
    DecisionResult,
    QuestionType,
    StreamEvent,
    StreamStage,
    StreamStatus,
    System1Decision,
)
from laya_agent.system1_jev import System1JevClient
from laya_agent.system1_laya import System1LayaClient
from laya_agent.system2_gemini import System2GeminiClient


def _run_engine(
    predict: Callable[..., System1Decision],
    engine: str,
    question_type: QuestionType,
    **kwargs: object,
) -> System1Decision:
    """Call one System 1 engine and turn any failure into a marked result.

    The engines are independent backends: Laya runs on a preemptible GPU VM, Jev
    on a third-party API. Letting one raise would cancel the other's result even
    though it arrived fine, so the failure is captured and returned instead.
    """
    start = time.perf_counter()
    try:
        return predict(question_type=question_type, **kwargs)
    except Exception as exc:  # noqa: BLE001 - the reason is reported, not swallowed
        return System1Decision(
            decision_key="decision",
            type=question_type,
            latency_ms=(time.perf_counter() - start) * 1000.0,
            error=f"{engine} is unavailable. {exc}",
        )


class DualProcessAgent:
    """Agent that balances fast reflexive decisions with deep deliberation."""

    def __init__(
        self,
        settings: Settings | None = None,
        system1_client: System1LayaClient | None = None,
        system2_client: System2GeminiClient | None = None,
        jev_client: System1JevClient | None = None,
    ) -> None:
        self.settings = settings or Settings()
        self.system1 = system1_client or System1LayaClient(self.settings)
        self.system2 = system2_client or System2GeminiClient(self.settings)
        self.jev = jev_client or System1JevClient(self.settings)

    def decide(
        self,
        query: str,
        criteria: dict[str, str] | list[str],
        question_type: QuestionType = QuestionType.CHOICE,
        instructions: str = "Make a calibrated decision based on provided state.",
        enable_search: bool = True,
        compute_attribution: bool = True,
    ) -> DecisionResult:
        """Execute a Laya-only System 1 decision and return the final result.

        This drains `decide_stream`, so there is one implementation of the
        pipeline rather than a streaming copy that can drift from a blocking one.
        """
        for event in self.decide_stream(
            query=query,
            criteria=criteria,
            question_type=question_type,
            instructions=instructions,
            enable_search=enable_search,
            compute_attribution=compute_attribution,
        ):
            if event.decision_result is not None:
                return event.decision_result
        raise RuntimeError("The decision pipeline ended without producing a result.")

    def decide_stream(
        self,
        query: str,
        criteria: dict[str, str] | list[str],
        question_type: QuestionType = QuestionType.CHOICE,
        instructions: str = "Make a calibrated decision based on provided state.",
        enable_search: bool = True,
        compute_attribution: bool = True,
    ) -> Iterator[StreamEvent]:
        """Run Laya System 1 with optional web search grounding, streaming each stage."""
        overall_start = time.perf_counter()

        def elapsed() -> float:
            return (time.perf_counter() - overall_start) * 1000.0

        # Step 1: Optional web search grounding
        evidence_list: list[str] = []
        search_latency_ms = 0.0
        if enable_search:
            yield StreamEvent(
                stage=StreamStage.SEARCH, status=StreamStatus.START, elapsed_ms=elapsed()
            )
            search_start = time.perf_counter()
            evidence_list = self.system2.search_web(query)
            search_latency_ms = (time.perf_counter() - search_start) * 1000.0
            yield StreamEvent(
                stage=StreamStage.SEARCH,
                status=StreamStatus.DONE,
                elapsed_ms=elapsed(),
                latency_ms=search_latency_ms,
                evidence=evidence_list,
            )

        # Step 2: Fast System 1 Inference (ConvAI Laya)
        yield StreamEvent(stage=StreamStage.LAYA, status=StreamStatus.START, elapsed_ms=elapsed())
        s1_decision = _run_engine(
            self.system1.predict,
            "Laya",
            question_type,
            query=query,
            criteria=criteria,
            instructions=instructions,
            evidence_list=evidence_list,
            compute_attribution=compute_attribution,
        )
        yield StreamEvent(
            stage=StreamStage.LAYA,
            status=StreamStatus.ERROR if s1_decision.error else StreamStatus.DONE,
            elapsed_ms=elapsed(),
            latency_ms=s1_decision.latency_ms,
            decision=s1_decision,
            error=s1_decision.error,
        )

        decision_val = (
            "unavailable"
            if s1_decision.error is not None
            else (s1_decision.choice or str(s1_decision.score or "undecided"))
        )

        yield StreamEvent(
            stage=StreamStage.RESULT,
            status=StreamStatus.DONE,
            elapsed_ms=elapsed(),
            decision_result=DecisionResult(
                query=query,
                decision=decision_val,
                confidence=s1_decision.confidence,
                probabilities=s1_decision.probabilities,
                handled_by="Laya",
                search_enabled=enable_search,
                search_latency_ms=search_latency_ms,
                laya_latency_ms=s1_decision.latency_ms,
                evidence=evidence_list,
                sources=s1_decision.sources,
                total_latency_ms=elapsed(),
                system1_error=s1_decision.error,
            ),
        )

    def compare(
        self,
        query: str,
        criteria: dict[str, str] | list[str],
        question_type: QuestionType = QuestionType.CHOICE,
        instructions: str = "Using the search results as evidence, answer the user's question.",
        enable_search: bool = True,
        compute_attribution: bool = True,
    ) -> ComparisonResult:
        """Run a side-by-side comparison and return only the final result."""
        for event in self.compare_stream(
            query=query,
            criteria=criteria,
            question_type=question_type,
            instructions=instructions,
            enable_search=enable_search,
            compute_attribution=compute_attribution,
        ):
            if event.comparison is not None:
                return event.comparison
        raise RuntimeError("The comparison pipeline ended without producing a result.")

    def compare_stream(
        self,
        query: str,
        criteria: dict[str, str] | list[str],
        question_type: QuestionType = QuestionType.CHOICE,
        instructions: str = "Using the search results as evidence, answer the user's question.",
        enable_search: bool = True,
        compute_attribution: bool = True,
    ) -> Iterator[StreamEvent]:
        """Run both System 1 engines, reporting each one the moment it answers."""
        overall_start = time.perf_counter()

        def elapsed() -> float:
            return (time.perf_counter() - overall_start) * 1000.0

        # Step 1: Gather web evidence (shared between both engines)
        evidence_list: list[str] = []
        search_latency_ms = 0.0
        if enable_search:
            yield StreamEvent(
                stage=StreamStage.SEARCH, status=StreamStatus.START, elapsed_ms=elapsed()
            )
            search_start = time.perf_counter()
            evidence_list = self.system2.search_web(query)
            search_latency_ms = (time.perf_counter() - search_start) * 1000.0
            yield StreamEvent(
                stage=StreamStage.SEARCH,
                status=StreamStatus.DONE,
                elapsed_ms=elapsed(),
                latency_ms=search_latency_ms,
                evidence=evidence_list,
            )

        # Step 2: Execute Laya and Jev in parallel.
        engine_kwargs = {
            "query": query,
            "criteria": criteria,
            "instructions": instructions,
            "evidence_list": evidence_list,
            "compute_attribution": compute_attribution,
        }

        yield StreamEvent(stage=StreamStage.LAYA, status=StreamStatus.START, elapsed_ms=elapsed())
        yield StreamEvent(stage=StreamStage.JEV, status=StreamStatus.START, elapsed_ms=elapsed())

        decisions: dict[StreamStage, System1Decision] = {}
        with ThreadPoolExecutor(max_workers=2) as executor:
            pending = {
                executor.submit(
                    _run_engine, self.system1.predict, "Laya", question_type, **engine_kwargs
                ): StreamStage.LAYA,
                executor.submit(
                    _run_engine, self.jev.predict, "Jev", question_type, **engine_kwargs
                ): StreamStage.JEV,
            }
            for future in as_completed(pending):
                stage = pending[future]
                decision = future.result()
                decisions[stage] = decision
                yield StreamEvent(
                    stage=stage,
                    status=StreamStatus.ERROR if decision.error else StreamStatus.DONE,
                    elapsed_ms=elapsed(),
                    latency_ms=decision.latency_ms,
                    decision=decision,
                    error=decision.error,
                )

        laya_decision = decisions[StreamStage.LAYA]
        jev_decision = decisions[StreamStage.JEV]

        both_answered = laya_decision.error is None and jev_decision.error is None
        agreement = laya_decision.choice == jev_decision.choice if both_answered else None
        latency_diff_ms = (
            round(jev_decision.latency_ms - laya_decision.latency_ms, 2) if both_answered else None
        )
        speedup = (
            round(jev_decision.latency_ms / max(laya_decision.latency_ms, 0.001), 2)
            if both_answered
            else None
        )

        yield StreamEvent(
            stage=StreamStage.RESULT,
            status=StreamStatus.DONE,
            elapsed_ms=elapsed(),
            comparison=ComparisonResult(
                query=query,
                search_enabled=enable_search,
                search_latency_ms=search_latency_ms,
                evidence=evidence_list,
                laya=laya_decision,
                jev=jev_decision,
                agreement=agreement,
                latency_diff_ms=latency_diff_ms,
                speedup_factor=speedup,
                total_latency_ms=elapsed(),
            ),
        )
