# Laya Dual-Process Agent

A production dual-process cognitive AI agent combining **Gemini 3.5 Flash-Lite** (System 2) on Vertex AI and **ConvAI Laya** (System 1) on Google Cloud.

## Architecture

```
User Query ──> [ Gemini 3.5 Flash-Lite ] (System 2 Grounding)
                      │
                 Web Evidence
                      ▼
               [ ConvAI Laya ] (System 1 Decision Engine)
              (NVIDIA L4 GPU via Cloud Run Direct VPC)
                      │
           Calibrated Probabilities
                      │
       ┌──────────────┴──────────────┐
  Confidence >= 0.60            Confidence < 0.60
       │                              │
[ Instant Return ]         [ Gemini 3.5 Flash-Lite ]
   (< 500 ms)              (System 2 Deliberation)
```

## Features

* **Sub-50ms System 1 Inference**: Evaluates decisions, scores, and booleans using ModernBERT on NVIDIA L4 GPU.
* **Leave-One-Out Source Attribution**: Calculates the exact point contribution of each web citation.
* **Automated Escalation**: Automatically routes ambiguous or low-confidence queries to Gemini 3.5 Flash-Lite for deliberation.
* **Serverless VPC Ingress**: Connected through Cloud Run Direct VPC Egress with `min-instances: 0` for zero idle cost.

## Installation & Setup

Ensure `uv` is installed:

```bash
cd /usr/local/google/home/adhishthite/.gemini/jetski/scratch/laya-agent
uv sync
```

## Quick Start

### 1. Run a Single Decision

```bash
uv run laya-agent decide "Should I take an umbrella in Tokyo today?" \
  --criteria yes="Rain expected" no="Dry weather"
```

### 2. Interactive Console

```bash
uv run laya-agent interactive
```

### 3. Check System Status

```bash
uv run laya-agent status
```

## Makefile Targets

| Target | Description |
| :--- | :--- |
| `make start` | Displays CLI help |
| `make dev` | Starts interactive console |
| `make test` | Runs unit test suite via `pytest` |
| `make format` | Formats code with `ruff format` |
| `make lint` | Lints code with `ruff check` |
| `make check` | Full pipeline: format -> lint -> test |
