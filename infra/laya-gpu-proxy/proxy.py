"""Cloud Run shim that forwards Laya requests into the VPC.

Cloud Run cannot reach a private GCE address directly, so this service sits on
the same subnet via Direct VPC Egress and relays /health and /predict to the GPU
VM. It holds no logic of its own: whatever the VM answers is what the caller
gets, status code included.

The upstream address is read from the environment. Rebuilding the VM in another
zone therefore costs one `gcloud run services update --set-env-vars`, not a
rebuild of this image.
"""

import os

import httpx
from fastapi import FastAPI, Request, Response

app = FastAPI(title="Laya GPU VPC Proxy")

# Points at the reserved internal address, not at whatever ephemeral IP the
# current instance happens to hold. The reservation outlives the instance.
GPU_VM_URL = os.environ.get("GPU_VM_URL", "http://10.0.2.10:8080").rstrip("/")

# A stopped VM on a VPC drops TCP SYN packets rather than refusing them. A 2.5 s
# connect deadline fails fast when the VM is down while still allowing the full
# 30 s read deadline once the TCP handshake completes (< 5 ms on a live VM).
CONNECT_TIMEOUT_SECONDS = float(os.environ.get("CONNECT_TIMEOUT_SECONDS", "2.5"))
HEALTH_TIMEOUT_SECONDS = float(os.environ.get("HEALTH_TIMEOUT_SECONDS", "5.0"))
PREDICT_TIMEOUT_SECONDS = float(os.environ.get("PREDICT_TIMEOUT_SECONDS", "30.0"))


@app.get("/health")
async def health() -> Response:
    """Report whether the GPU VM answers, and say so in the status code."""
    timeout = httpx.Timeout(HEALTH_TIMEOUT_SECONDS, connect=CONNECT_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            upstream = await client.get(f"{GPU_VM_URL}/health")
        except httpx.HTTPError as exc:
            return _upstream_error(exc)
        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            media_type="application/json",
        )


@app.post("/predict")
async def predict(request: Request) -> Response:
    """Relay one inference request to the GPU VM."""
    body = await request.body()
    timeout = httpx.Timeout(PREDICT_TIMEOUT_SECONDS, connect=CONNECT_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            upstream = await client.post(
                f"{GPU_VM_URL}/predict",
                content=body,
                headers={"Content-Type": "application/json"},
            )
        except httpx.HTTPError as exc:
            return _upstream_error(exc)
        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            media_type="application/json",
        )


def _upstream_error(exc: httpx.HTTPError) -> Response:
    """Render an upstream failure as JSON without losing the reason.

    The previous version interpolated the exception straight into a format
    string, so any quote in the message produced invalid JSON and the caller saw
    an empty error. json.dumps handles the escaping.
    """
    import json

    detail = str(exc) or exc.__class__.__name__
    payload = json.dumps(
        {
            "error": detail,
            "error_type": exc.__class__.__name__,
            "upstream": GPU_VM_URL,
        }
    )
    return Response(content=payload, status_code=502, media_type="application/json")
