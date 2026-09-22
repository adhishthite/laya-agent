"""Dual-Process Agent Orchestrator combining System 1 (Laya / Jev) and System 2 (Gemini)."""

import time
from concurrent.futures import ThreadPoolExecutor

from laya_agent.config import Settings
from laya_agent.models import ComparisonResult, DecisionResult, QuestionType
from laya_agent.system1_jev import System1JevClient
from laya_agent.system1_laya import System1LayaClient
from laya_agent.system2_gemini import System2GeminiClient


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
        s1_decision = self.system1.predict(
            query=query,
            criteria=criteria,
            question_type=question_type,
            instructions=instructions,
            evidence_list=evidence_list,
            compute_attribution=compute_attribution,
        )

        decision_val = s1_decision.choice or str(s1_decision.score or "undecided")
        handled_by = "System 1 (Laya)"
        s2_synthesis = None

        # Step 3: Check confidence threshold
        is_uncertain = s1_decision.confidence < self.settings.confidence_threshold
        if is_uncertain or force_system2:
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

        # Step 2: Execute Laya and Jev in parallel
        with ThreadPoolExecutor(max_workers=2) as executor:
            laya_future = executor.submit(
                self.system1.predict,
                query=query,
                criteria=criteria,
                question_type=question_type,
                instructions=instructions,
                evidence_list=evidence_list,
                compute_attribution=compute_attribution,
            )
            jev_future = executor.submit(
                self.jev.predict,
                query=query,
                criteria=criteria,
                question_type=question_type,
                instructions=instructions,
                evidence_list=evidence_list,
                compute_attribution=compute_attribution,
            )

            laya_decision = laya_future.result()
            jev_decision = jev_future.result()

        total_latency_ms = (time.perf_counter() - overall_start) * 1000.0
        agreement = laya_decision.choice == jev_decision.choice
        latency_diff_ms = round(jev_decision.latency_ms - laya_decision.latency_ms, 2)
        speedup = round(jev_decision.latency_ms / max(laya_decision.latency_ms, 0.001), 2)

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
