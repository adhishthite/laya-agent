# Laya GPU proxy

Cloud Run cannot dial a private GCE address. This service sits on the same
subnet through Direct VPC Egress and relays `/health` and `/predict` to the GPU
VM.

## Why it exists as its own service

The GPU VM is a Spot instance with no external address. Spot instances get
preempted, and a preempted instance in a stocked-out zone has to be rebuilt
somewhere else. The proxy absorbs that churn so nothing upstream has to know
which zone the VM currently lives in.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `GPU_VM_URL` | `http://10.0.2.10:8080` | Upstream GPU VM |
| `HEALTH_TIMEOUT_SECONDS` | `5.0` | Deadline for `/health` |
| `PREDICT_TIMEOUT_SECONDS` | `30.0` | Deadline for `/predict` |

`GPU_VM_URL` points at a reserved internal address, not at an ephemeral one. The
reservation outlives the instance, so a zone rebuild reattaches the same address
and needs no change here.

Keep `PREDICT_TIMEOUT_SECONDS` below the caller's own deadline
(`LAYA_TIMEOUT_SECONDS` in the backend, 45 s). If the two match, the caller
abandons the request a fraction of a second before this 502 arrives and reports
a bare socket timeout instead of the real cause.

## Deploy

    make deploy

Or set a new upstream without rebuilding the image:

    make set-upstream GPU_VM_URL=http://10.0.2.11:8080

## Failure shape

An unreachable VM returns HTTP 502 with a JSON body naming the reason:

    {"error": "...", "error_type": "ConnectTimeout", "upstream": "http://10.0.2.10:8080"}

A stopped VM drops packets rather than refusing them, so this costs the full
`PREDICT_TIMEOUT_SECONDS` instead of failing fast.
