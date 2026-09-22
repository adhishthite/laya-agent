"""Live reachability probe for the Laya decision backend.

`/api/status` reports that this process is alive, which was never in doubt. The
probe here answers the question that actually matters before you press Run: can
a decision be made right now, and if not, which link in the chain is broken?

The chain is identity token -> Cloud Run proxy -> VPC egress -> GPU VM -> model.
A stopped Spot VM drops packets instead of refusing them, so the proxy waits for
its own upstream deadline before answering 502. That silence is the signal this
module exists to name.
"""

from __future__ import annotations

import time

import httpx

from laya_agent.auth import get_identity_token
from laya_agent.config import Settings
from laya_agent.errors import summarise_http_error
from laya_agent.models import LayaProbe, ProbeState

# The smallest well-formed question Laya will accept. The answer is discarded;
# only the fact that one came back matters.
PROBE_PAYLOAD: dict = {
    "state": {"query": "reachability probe"},
    "questions": {
        "probe": {
            "type": "choice",
            "instructions": "Reachability probe. Any answer is acceptable.",
            "criteria": {"yes": "reachable", "no": "unreachable"},
        }
    },
}

_AUTH_STATUSES = frozenset({401, 403})
_BACKEND_DOWN_STATUSES = frozenset({502, 503, 504})


def classify(status_code: int) -> ProbeState:
    """Map an upstream status onto the link in the chain that broke."""
    if status_code == 200:
        return ProbeState.READY
    if status_code in _AUTH_STATUSES:
        return ProbeState.AUTH
    if status_code in _BACKEND_DOWN_STATUSES:
        return ProbeState.BACKEND_DOWN
    return ProbeState.ERROR


def probe_laya(
    settings: Settings | None = None,
    transport: httpx.BaseTransport | None = None,
) -> LayaProbe:
    """Check whether Laya can answer right now.

    Never raises. A probe that throws is a probe that cannot report, so every
    failure is returned as a `LayaProbe` describing what went wrong.

    Args:
        settings: Runtime configuration. Defaults to the process settings.
        transport: Optional httpx transport, used by tests to avoid the network.
    """
    settings = settings or Settings()
    endpoint = settings.laya_endpoint
    started = time.perf_counter()

    def elapsed_ms() -> float:
        return (time.perf_counter() - started) * 1000

    try:
        token = get_identity_token(audience=endpoint)
    except Exception as exc:
        return LayaProbe(
            state=ProbeState.AUTH,
            endpoint=endpoint,
            latency_ms=elapsed_ms(),
            detail=f"Could not obtain an identity token. {exc}",
        )

    timeout = settings.laya_probe_timeout_seconds
    try:
        with httpx.Client(timeout=timeout, transport=transport) as client:
            response = client.post(
                endpoint,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=PROBE_PAYLOAD,
            )
    except httpx.TimeoutException:
        return LayaProbe(
            state=ProbeState.BACKEND_DOWN,
            endpoint=endpoint,
            latency_ms=elapsed_ms(),
            detail=(
                f"No answer within {timeout:.0f} s. A stopped GPU VM drops packets instead of "
                "refusing them, so the proxy waits rather than failing fast. Start the VM."
            ),
        )
    except httpx.HTTPError as exc:
        return LayaProbe(
            state=ProbeState.ERROR,
            endpoint=endpoint,
            latency_ms=elapsed_ms(),
            detail=f"Could not reach the proxy. {exc}",
        )

    latency_ms = elapsed_ms()
    if response.status_code == 200:
        return LayaProbe(
            state=ProbeState.READY,
            endpoint=endpoint,
            http_status=200,
            latency_ms=latency_ms,
            detail="Laya answered.",
        )

    return LayaProbe(
        state=classify(response.status_code),
        endpoint=endpoint,
        http_status=response.status_code,
        latency_ms=latency_ms,
        detail=summarise_http_error("Laya proxy", endpoint, response.status_code, response.text),
    )
