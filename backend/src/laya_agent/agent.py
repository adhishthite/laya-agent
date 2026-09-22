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
        force_system2: bool = False,
    ) -> DecisionResult:
        """Execute a dual-process decision and return only the final result.

        This drains `decide_stream`, so there is one implementation of the
        pipeline rather than a streaming copy that can drift from a blocking one.

        Args:
            query: The question or situation prompt.
            criteria: Choice mapping or scoring categories.
            question_type: Type of decision (CHOICE, SCORE, NOUL).
            instructions: Guidance for the decision head.
            enable_search: Whether to gather live web evidence.
            compute_attribution: Whether to calculate leave-one-out source impact.
            force_system2: Force System 2 deliberation regardless of confidence.

        Returns:
            DecisionResult containing the choice, probabilities, attribution, and synthesis.
        """
        for event in self.decide_stream(
            query=query,
            criteria=criteria,
            question_type=question_type,
            instructions=instructions,
            enable_search=enable_search,
            compute_attribution=compute_attribution,
            force_system2=force_system2,
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
        force_system2: bool = False,
    ) -> Iterator[StreamEvent]:
        """Run a decision, reporting each stage the moment it finishes.

        The three stages sit on different backends and the slow ones dominate.
        Yielding as they land lets the caller show grounding before Laya has
        answered, and Laya's answer before Gemini has finished deliberating.

        Yields:
            StreamEvent per stage boundary, ending with one carrying
            `decision_result`.
        """
        overall_start = time.perf_counter()

        def elapsed() -> float:
            return (time.perf_counter() - overall_start) * 1000.0

        # Step 1: Gather web evidence (System 2 Grounding)
        evidence_list: list[str] = []
        if enable_search:
            yield StreamEvent(
                stage=StreamStage.SEARCH, status=StreamStatus.START, elapsed_ms=elapsed()
            )
            evidence_list = self.system2.search_web(query)
            yield StreamEvent(
                stage=StreamStage.SEARCH,
                status=StreamStatus.DONE,
                elapsed_ms=elapsed(),
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
            decision=s1_decision,
            error=s1_decision.error,
        )

        # Step 3: Decide who answers.
        #
        # Laya runs on a preemptible GPU VM, so it can vanish mid-session. When
        # it does, Gemini answers alone rather than the request failing: the
        # evidence is already gathered and System 2 can reason over it without
        # any System 1 prior.
        s2_synthesis = None
        if s1_decision.error is not None:
            decision_val = "unavailable"
            handled_by = "System 2 (Gemini alone, Laya unavailable)"
        else:
            decision_val = s1_decision.choice or str(s1_decision.score or "undecided")
            handled_by = "System 1 (Laya)"

        is_uncertain = s1_decision.confidence < self.settings.confidence_threshold
        if s1_decision.error is not None or is_uncertain or force_system2:
            if s1_decision.error is None:
                handled_by = "System 2 (Gemini Deliberation)"
            yield StreamEvent(
                stage=StreamStage.DELIBERATION,
                status=StreamStatus.START,
                elapsed_ms=elapsed(),
            )
            s2_synthesis = self.system2.deliberate(
                query=query,
                evidence=evidence_list,
                probabilities=s1_decision.probabilities,
            )
            yield StreamEvent(
                stage=StreamStage.DELIBERATION,
                status=StreamStatus.DONE,
                elapsed_ms=elapsed(),
                synthesis=s2_synthesis,
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
                handled_by=handled_by,
                search_enabled=enable_search,
                evidence=evidence_list,
                sources=s1_decision.sources,
                system2_synthesis=s2_synthesis,
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
        """Run a side-by-side comparison and return only the final result.

        This drains `compare_stream` so both paths share one implementation.

        Args:
            query: The question or situation prompt.
            criteria: Choice mapping or scoring categories.
            question_type: Type of decision (CHOICE, SCORE).
            instructions: Guidance for the decision heads.
            enable_search: Whether to gather live web evidence.
            compute_attribution: Whether to calculate leave-one-out source impact.

        Returns:
            ComparisonResult containing outputs, probabilities, latencies, and speedup.
        """
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
        """Run both engines, reporting each one the moment it answers.

        The whole point of this view is that one engine is much faster than the
        other. Holding the fast answer until the slow one arrives hides exactly
        the thing being measured.

        Yields:
            StreamEvent per stage boundary, ending with one carrying
            `comparison`.
        """
        overall_start = time.perf_counter()

        def elapsed() -> float:
            return (time.perf_counter() - overall_start) * 1000.0

        # Step 1: Gather web evidence (shared between both engines)
        evidence_list: list[str] = []
        if enable_search:
            yield StreamEvent(
                stage=StreamStage.SEARCH, status=StreamStatus.START, elapsed_ms=elapsed()
            )
            evidence_list = self.system2.search_web(query)
            yield StreamEvent(
                stage=StreamStage.SEARCH,
                status=StreamStatus.DONE,
                elapsed_ms=elapsed(),
                evidence=evidence_list,
            )

        # Step 2: Execute Laya and Jev in parallel.
        #
        # Each engine is wrapped, so a dead GPU VM costs the Laya column and
        # nothing else. Jev's answer still arrives and is still rendered.
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
            # as_completed, not future.result() in submission order: the whole
            # reason to stream is to show whichever engine finishes first.
            for future in as_completed(pending):
                stage = pending[future]
                decision = future.result()  # _run_engine never raises
                decisions[stage] = decision
                yield StreamEvent(
                    stage=stage,
                    status=StreamStatus.ERROR if decision.error else StreamStatus.DONE,
                    elapsed_ms=elapsed(),
                    decision=decision,
                    error=decision.error,
                )

        laya_decision = decisions[StreamStage.LAYA]
        jev_decision = decisions[StreamStage.JEV]

        # Only compare what both engines actually produced. A speedup measured
        # against a failure is not a fast result, it is no result.
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
                evidence=evidence_list,
                laya=laya_decision,
                jev=jev_decision,
                agreement=agreement,
                latency_diff_ms=latency_diff_ms,
                speedup_factor=speedup,
                total_latency_ms=elapsed(),
            ),
        )
