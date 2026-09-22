"""Client for TypeSafe Jev System 1 decision model."""

import os
import time

import httpx
from dotenv import load_dotenv

from laya_agent.config import Settings
from laya_agent.errors import summarise_http_error
from laya_agent.models import QuestionType, SourceContribution, System1Decision


class System1JevClient:
    """Client for calling TypeSafe Jev API."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()
        # Ensure TYPESAFE_API_KEY is loaded
        if not self.settings.typesafe_api_key:
            load_dotenv()
            home_env = os.path.expanduser("~/.env")
            if os.path.exists(home_env):
                load_dotenv(home_env)
            self.settings.typesafe_api_key = os.getenv("TYPESAFE_API_KEY")

    def predict(
        self,
        query: str,
        criteria: dict[str, str] | list[str],
        question_type: QuestionType = QuestionType.CHOICE,
        instructions: str = "Using the search results as evidence, answer the user's question.",
        evidence_list: list[str] | None = None,
        compute_attribution: bool = False,
    ) -> System1Decision:
        """Call TypeSafe Jev API.

        Args:
            query: The user question.
            criteria: Choice mapping or score categories.
            question_type: QuestionType (CHOICE, SCORE).
            instructions: Guidance for the decision head.
            evidence_list: List of retrieved evidence strings.
            compute_attribution: If True, computes leave-one-out source contributions.

        Returns:
            System1Decision containing probabilities, winning choice, and source attribution.
        """
        if not self.settings.typesafe_api_key:
            raise ValueError(
                "TYPESAFE_API_KEY is not set. Please provide it in ~/.env or environment."
            )

        evidence = evidence_list or []
        payload = {
            "model": "jev-latest",
            "state": {
                "question": query,
                "search_results": evidence,
            },
            "questions": {
                "decision": {
                    "type": question_type.value,
                    "instructions": instructions,
                    "criteria": criteria,
                }
            },
        }

        start_time = time.perf_counter()
        raw_res = self._send_request(payload)
        latency_ms = (time.perf_counter() - start_time) * 1000.0

        decision_data = raw_res.get("answers", {}).get("decision", {})
        choice = decision_data.get("choice")
        score = decision_data.get("score")
        probabilities = decision_data.get("probabilities", {})
        confidence = float(decision_data.get("confidence", 0.0))

        sources: list[SourceContribution] = []
        if compute_attribution and evidence and len(evidence) > 1 and choice:
            baseline_prob = probabilities.get(choice, 0.0)
            sources = self._compute_leave_one_out(
                query=query,
                criteria=criteria,
                question_type=question_type,
                instructions=instructions,
                evidence_list=evidence,
                target_choice=choice,
                baseline_prob=baseline_prob,
            )

        return System1Decision(
            decision_key="decision",
            type=question_type,
            choice=choice,
            score=score,
            probabilities=probabilities,
            confidence=confidence,
            latency_ms=latency_ms,
            sources=sources,
        )

    def _send_request(self, payload: dict) -> dict:
        """Send HTTP POST request to TypeSafe Jev API."""
        headers = {
            "Authorization": f"Bearer {self.settings.typesafe_api_key}",
            "Content-Type": "application/json",
        }

        with httpx.Client(timeout=self.settings.laya_timeout_seconds) as client:
            response = client.post(self.settings.jev_endpoint, headers=headers, json=payload)
            if response.status_code != 200:
                raise RuntimeError(
                    summarise_http_error(
                        "Jev API",
                        self.settings.jev_endpoint,
                        response.status_code,
                        response.text,
                    )
                )
            return response.json()

    def _compute_leave_one_out(
        self,
        query: str,
        criteria: dict[str, str] | list[str],
        question_type: QuestionType,
        instructions: str,
        evidence_list: list[str],
        target_choice: str,
        baseline_prob: float,
    ) -> list[SourceContribution]:
        """Compute leave-one-out source attribution across evidence snippets concurrently."""
        from concurrent.futures import ThreadPoolExecutor

        def probe_without(index: int, excluded_source: str) -> SourceContribution:
            subset = [src for j, src in enumerate(evidence_list) if j != index]
            payload = {
                "model": "jev-latest",
                "state": {
                    "question": query,
                    "search_results": subset,
                },
                "questions": {
                    "decision": {
                        "type": question_type.value,
                        "instructions": instructions,
                        "criteria": criteria,
                    }
                },
            }
            try:
                raw_res = self._send_request(payload)
                ans = raw_res.get("answers", {}).get("decision", {})
                subset_prob = ans.get("probabilities", {}).get(target_choice, 0.0)
                delta = round((baseline_prob - subset_prob) * 100.0, 2)
                return SourceContribution(
                    source_text=excluded_source,
                    impact_points=delta,
                    is_supporting=(delta >= 0),
                )
            except Exception:
                return SourceContribution(
                    source_text=excluded_source,
                    impact_points=0.0,
                    is_supporting=True,
                )

        with ThreadPoolExecutor(max_workers=max(1, len(evidence_list))) as pool:
            contributions = list(
                pool.map(
                    lambda pair: probe_without(pair[0], pair[1]),
                    enumerate(evidence_list),
                )
            )

        contributions.sort(key=lambda s: abs(s.impact_points), reverse=True)
        return contributions
