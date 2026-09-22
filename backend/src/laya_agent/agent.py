"""Dual-Process Agent Orchestrator combining System 1 (Laya / Jev) and System 2 (Gemini)."""

import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from laya_agent.config import Settings
from laya_agent.models import (
    ComparisonResult,
    DecisionResult,
    QuestionType,
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
        """Execute a dual-process decision.

        1. Gathers search evidence via System 2 web grounding.
        2. Evaluates fast decision and source attribution via System 1 (Laya).
        3. If confidence is below threshold or force_system2 is set, invokes System 2 deliberation.

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
        overall_start = time.perf_counter()

        # Step 1: Gather web evidence (System 2 Grounding)
        evidence_list: list[str] = []
        if enable_search:
            evidence_list = self.system2.search_web(query)

        # Step 2: Fast System 1 Inference (ConvAI Laya)
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
            s2_synthesis = self.system2.deliberate(
                query=query,
                evidence=evidence_list,
                probabilities=s1_decision.probabilities,
            )

        total_latency_ms = (time.perf_counter() - overall_start) * 1000.0

        return DecisionResult(
            query=query,
            decision=decision_val,
            confidence=s1_decision.confidence,
            probabilities=s1_decision.probabilities,
            handled_by=handled_by,
            search_enabled=enable_search,
            evidence=evidence_list,
            sources=s1_decision.sources,
            system2_synthesis=s2_synthesis,
            total_latency_ms=total_latency_ms,
            system1_error=s1_decision.error,
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
        """Run a side-by-side comparison of ConvAI Laya vs TypeSafe Jev with identical grounding.

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
        overall_start = time.perf_counter()

        # Step 1: Gather web evidence (shared between both engines)
        evidence_list: list[str] = []
        if enable_search:
            evidence_list = self.system2.search_web(query)

        # Step 2: Execute Laya and Jev in parallel.
        #
        # Each engine is wrapped, so a dead GPU VM costs the Laya column and
        # nothing else. Jev's answer still arrives and is still rendered.
        with ThreadPoolExecutor(max_workers=2) as executor:
            laya_future = executor.submit(
                _run_engine,
                self.system1.predict,
                "Laya",
                question_type,
                query=query,
                criteria=criteria,
                instructions=instructions,
                evidence_list=evidence_list,
                compute_attribution=compute_attribution,
            )
            jev_future = executor.submit(
                _run_engine,
                self.jev.predict,
                "Jev",
                question_type,
                query=query,
                criteria=criteria,
                instructions=instructions,
                evidence_list=evidence_list,
                compute_attribution=compute_attribution,
            )

            laya_decision = laya_future.result()
            jev_decision = jev_future.result()

        total_latency_ms = (time.perf_counter() - overall_start) * 1000.0

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

        return ComparisonResult(
            query=query,
            evidence=evidence_list,
            laya=laya_decision,
            jev=jev_decision,
            agreement=agreement,
            latency_diff_ms=latency_diff_ms,
            speedup_factor=speedup,
            total_latency_ms=total_latency_ms,
        )
