"""Tests for the Laya reachability probe."""

import httpx
import pytest

from laya_agent import health
from laya_agent.config import Settings
from laya_agent.health import classify, probe_laya
from laya_agent.models import ProbeState

ENDPOINT = "https://proxy.example.invalid/predict"


@pytest.fixture(autouse=True)
def stub_token(monkeypatch: pytest.MonkeyPatch) -> None:
    """The probe's identity token is not what these tests are about."""
    monkeypatch.setattr(health, "get_identity_token", lambda audience=None: "test-token")


def settings() -> Settings:
    return Settings(laya_endpoint=ENDPOINT, laya_probe_timeout_seconds=1.0)


def responder(status_code: int, body: str = "") -> httpx.MockTransport:
    return httpx.MockTransport(lambda _: httpx.Response(status_code, text=body))


def test_classify_maps_each_link() -> None:
    assert classify(200) is ProbeState.READY
    assert classify(401) is ProbeState.AUTH
    assert classify(403) is ProbeState.AUTH
    assert classify(502) is ProbeState.BACKEND_DOWN
    assert classify(503) is ProbeState.BACKEND_DOWN
    assert classify(504) is ProbeState.BACKEND_DOWN
    assert classify(418) is ProbeState.ERROR


def test_ready_when_laya_answers() -> None:
    result = probe_laya(settings(), transport=responder(200, '{"answers": {}}'))
    assert result.state is ProbeState.READY
    assert result.http_status == 200
    assert result.endpoint == ENDPOINT


def test_gateway_error_reports_a_stopped_backend() -> None:
    result = probe_laya(settings(), transport=responder(502, '{"error": ""}'))
    assert result.state is ProbeState.BACKEND_DOWN
    assert result.http_status == 502
    assert "GPU backend is probably stopped" in result.detail


def test_forbidden_reports_an_identity_problem() -> None:
    result = probe_laya(settings(), transport=responder(403, "<html>Forbidden</html>"))
    assert result.state is ProbeState.AUTH
    assert "<" not in result.detail


def test_timeout_reports_a_stopped_backend() -> None:
    def hang(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("The read operation timed out", request=request)

    result = probe_laya(settings(), transport=httpx.MockTransport(hang))
    assert result.state is ProbeState.BACKEND_DOWN
    assert result.http_status is None
    assert "drops packets" in result.detail


def test_connect_failure_is_not_blamed_on_the_gpu() -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    result = probe_laya(settings(), transport=httpx.MockTransport(refuse))
    assert result.state is ProbeState.ERROR
    assert "Could not reach the proxy" in result.detail


def test_missing_token_reports_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    def no_token(audience: str | None = None) -> str:
        raise RuntimeError("no credentials")

    monkeypatch.setattr(health, "get_identity_token", no_token)
    result = probe_laya(settings(), transport=responder(200))
    assert result.state is ProbeState.AUTH
    assert "no credentials" in result.detail
