"""Client for ConvAI Laya System 1 decision engine."""

import time

import httpx

from laya_agent.auth import get_identity_token
from laya_agent.config import Settings
from laya_agent.errors import summarise_http_error
from laya_agent.models import QuestionType, SourceContribution, System1Decision


class System1LayaClient:
    """Client for calling Laya running behind Cloud Run proxy."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()

    def predict(
        self,
        query: str,
        criteria: dict[str, str] | list[str],
        question_type: QuestionType = QuestionType.CHOICE,
        instructions: str = "Make a calibrated decision based on provided state.",
        evidence_list: list[str] | None = None,
        compute_attribution: bool = False,
    ) -> System1Decision:
        """Call Laya to make a fast, calibrated System 1 decision.

        Args:
            query: The question or situation prompt.
            criteria: Choice mapping (e.g. {'yes': '...', 'no': '...'}) or score list.
            question_type: QuestionType (CHOICE, SCORE, NOUL).
            instructions: Guidance for the decision head.
            evidence_list: Optional list of retrieved evidence snippets.
            compute_attribution: If True, executes leave-one-out analysis across evidence.

        Returns:
            System1Decision containing probabilities, winning choice, and source attribution.
        """
        evidence_str = "\n".join(evidence_list) if evidence_list else ""
        state = {
            "query": query,
            "search_evidence": evidence_str,
        }

        # Build question structure
        question_payload: dict[str, object] = {
            "type": question_type.value,
            "instructions": instructions,
        }
        if question_type == QuestionType.CHOICE:
            question_payload["criteria"] = criteria
        elif question_type == QuestionType.SCORE:
            question_payload["criteria"] = criteria

        payload = {
            "state": state,
            "questions": {
                "decision": question_payload,
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
        if compute_attribution and evidence_list and len(evidence_list) > 1 and choice:
            baseline_prob = probabilities.get(choice, 0.0)
            sources = self._compute_leave_one_out(
                query=query,
                criteria=criteria,
                question_payload=question_payload,
                evidence_list=evidence_list,
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
        """Send HTTP POST request to Cloud Run proxy with IAM identity token."""
        token = get_identity_token(audience=self.settings.laya_endpoint)
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        with httpx.Client(timeout=self.settings.laya_timeout_seconds) as client:
            response = client.post(self.settings.laya_endpoint, headers=headers, json=payload)
            if response.status_code != 200:
                raise RuntimeError(
                    summarise_http_error(
                        "Laya proxy",
                        self.settings.laya_endpoint,
                        response.status_code,
                        response.text,
                    )
                )
            return response.json()

    def _compute_leave_one_out(
        self,
        query: str,
        criteria: dict[str, str] | list[str],
        question_payload: dict,
        evidence_list: list[str],
        target_choice: str,
        baseline_prob: float,
    ) -> list[SourceContribution]:
        """Compute leave-one-out source attribution across evidence snippets."""
        contributions: list[SourceContribution] = []

        for i, excluded_source in enumerate(evidence_list):
            subset = [src for j, src in enumerate(evidence_list) if j != i]
            state = {
                "query": query,
                "search_evidence": "\n".join(subset),
            }
            payload = {
                "state": state,
                "questions": {
                    "decision": question_payload,
                },
            }
            try:
                raw_res = self._send_request(payload)
                ans = raw_res.get("answers", {}).get("decision", {})
                subset_prob = ans.get("probabilities", {}).get(target_choice, 0.0)
                # Delta in percentage points
                delta = round((baseline_prob - subset_prob) * 100.0, 2)
                contributions.append(
                    SourceContribution(
                        source_text=excluded_source,
                        impact_points=delta,
                        is_supporting=(delta >= 0),
                    )
                )
            except Exception:
                contributions.append(
                    SourceContribution(
                        source_text=excluded_source,
                        impact_points=0.0,
                        is_supporting=True,
                    )
                )

        # Sort by descending impact
        contributions.sort(key=lambda s: abs(s.impact_points), reverse=True)
        return contributions
