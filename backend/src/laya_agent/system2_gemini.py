"""Client for Gemini 3.5 Flash-Lite web search grounding on Vertex AI."""

from google import genai
from google.genai import types

from laya_agent.config import Settings


class System2GeminiClient:
    """Client for fetching live Google Search evidence via Gemini 3.5 Flash-Lite."""

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
