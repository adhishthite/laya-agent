"""Client for Gemini 3.5 Flash-Lite System 2 deliberative model on Vertex AI."""

import time

from google import genai
from google.genai import types

from laya_agent.config import Settings
from laya_agent.models import System2Synthesis


class System2GeminiClient:
    """Client for Gemini 3.5 Flash-Lite on Vertex AI."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()
        self.client = genai.Client(
            vertexai=True,
            project=self.settings.project_id,
            location=self.settings.vertex_location,
        )

    def search_web(self, query: str) -> list[str]:
        """Use Gemini 3.5 Flash-Lite with google_search tool to fetch live citations.

        Args:
            query: The search inquiry.

        Returns:
            A list of cited factual source strings.
        """
        evidence: list[str] = []
        try:
            response = self.client.models.generate_content(
                model=self.settings.gemini_model,
                contents=f"Find current, factual search evidence for: {query}",
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                ),
            )

            if response.candidates and response.candidates[0].grounding_metadata:
                metadata = response.candidates[0].grounding_metadata
                chunks = metadata.grounding_chunks or []
                for chunk in chunks:
                    if chunk.web and chunk.web.title and chunk.web.uri:
                        evidence.append(f"{chunk.web.title} — {chunk.web.uri}")

            # Also capture brief response text if available as general evidence
            if response.text and not evidence:
                evidence.append(response.text.strip())

        except Exception as e:
            evidence.append(f"Search grounding unavailable: {e}")

        return evidence[: self.settings.max_search_evidence_sources]

    def deliberate(
        self,
        query: str,
        evidence: list[str],
        probabilities: dict[str, float],
    ) -> System2Synthesis:
        """Perform System 2 slow deliberative reasoning when System 1 is uncertain.

        Args:
            query: The original question.
            evidence: Retrieved search evidence.
            probabilities: The calibrated probabilities from System 1.

        Returns:
            System2Synthesis containing explanation and recommended actions.
        """
        prompt = f"""You are the System 2 deliberative reasoning module of an AI Agent.
The System 1 fast decision engine produced the following probabilities for the query:
Query: {query}
Probabilities: {probabilities}

Evidence collected:
{chr(10).join(f"- {e}" for e in evidence)}

Explain why the decision has uncertainty or conflict.
State:
1. Short explanation of the conflicting facts.
2. Risk assessment.
3. Recommended course of action.
Keep the response concise and precise."""

        start_time = time.perf_counter()
        response = self.client.models.generate_content(
            model=self.settings.gemini_model,
            contents=prompt,
        )
        latency_ms = (time.perf_counter() - start_time) * 1000.0

        explanation = response.text.strip() if response.text else "Deliberation completed."
        return System2Synthesis(
            explanation=explanation,
            latency_ms=latency_ms,
        )
