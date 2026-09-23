# AGENTS.md

This document guides AI agents and engineers working in this repository.

## 1. Project Overview

This repository implements the **System 1 Head-to-Head Decision Bench**. It compares fast, non-autoregressive decision models:
* **ConvAI Laya**: Open-weight ModernBERT / mmBERT model running on a private NVIDIA L4 GPU on Google Cloud.
* **TypeSafe Jev**: Proprietary multi-tenant decision SaaS API (`api.typesafe.ai`).

The bench measures accuracy, calibrated probabilities, and latency differences between the two engines under two conditions:
1. **With Web Grounding**: Live citations retrieved via Vertex AI Gemini 3.5 Flash-Lite `google_search` tool.
2. **Without Web Grounding (Raw Priors)**: Pure parametric decision evaluation without external context.

## 2. Repository Layout

```
.
├── Makefile                # Root orchestration (make dev, make check, make start)
├── README.md               # User documentation with architecture and screenshots
├── AGENTS.md               # Guidelines and contracts for AI agents
├── spec/                   # Architecture and technical specifications
│   └── architecture.md
├── docs/                   # Supporting documentation and assets
│   └── images/             # UI flow screenshots
├── frontend/               # React 19 + TypeScript + Vite + Bun
│   ├── src/                # App components, lib, styles
│   ├── Makefile            # Standard make targets (biome, vitest)
│   └── package.json
├── backend/                # Python 3.12+ + FastAPI + uv
│   ├── src/laya_agent/     # API server, clients, models, health probe
│   ├── tests/              # Pytest test suite
│   ├── Makefile            # Standard make targets (ruff, pytest)
│   └── pyproject.toml
└── infra/                  # Infrastructure configurations
    └── laya-gpu-proxy/     # Cloud Run Direct VPC Egress proxy for GPU VM
```

## 3. Technology Stack and Standards

### 3.1 Frontend
* **Runtime & Package Manager**: Use `bun` exclusively (`bun add`, `bun run`).
* **Framework**: React 19 with Vite and TypeScript (strict mode, no plain JavaScript, no `any`).
* **Styling**: Tailwind CSS v4 using the **OKLCH** color system.
* **Linter & Formatter**: Use `biome` exclusively (`biome check`, `biome format`).
* **Component Guidelines**:
  * Keep the workspace mounted across streaming state changes (`BenchWorkspace`) with stable React keys to prevent UI flicker.
  * Do not add unnecessary subtitles or redundant helper text beneath headings.
  * Use Phosphor Icons (`@phosphor-icons/react`) for iconography.

### 3.2 Backend
* **Runtime & Package Manager**: Use `uv` exclusively (`uv add`, `uv run`, `uv sync`). **Never use `uv pip install`**.
* **Framework**: FastAPI with Pydantic v2 models.
* **Linter & Formatter**: Use `ruff` exclusively (`ruff check`, `ruff format`).
* **Testing**: Use `pytest` for all unit and integration tests.
* **Streaming Protocol**: Use `application/x-ndjson` with `Cache-Control: no-cache` and `X-Accel-Buffering: no` headers. Late errors must be emitted as stream events rather than HTTP 500 status codes once streaming starts.

### 3.3 Standard Makefile Targets
The root directory, `frontend/`, and `backend/` implement these standard targets:

| Target | Description |
| :--- | :--- |
| `make start` | Start production servers (root uses `concurrently` for frontend + backend). |
| `make dev` | Start development servers (root uses `concurrently` for frontend + backend). |
| `make test` | Run test suites (`vitest` / `pytest`). |
| `make format` | Format source code (`biome` / `ruff format`). |
| `make lint` | Run linters (`biome` / `ruff check`). |
| `make clean` | Clean build artifacts and cache files. |
| `make check` | Run full validation pipeline (`format` -> `lint` -> `test`). |

## 4. Architectural Rules and Guardrails

1. **System 1 Focus**: Do not reintroduce System 2 generative deliberation or synthesis loops. The purpose of this benchmark is the direct comparison of System 1 decision models.
2. **Latency Isolation**: Always separate and report:
   * `search_latency_ms`: Time taken by web search grounding.
   * `laya_latency_ms`: Pure forward pass time of the Laya model on GPU.
   * `jev_latency_ms`: Pure request time of the Jev API.
   * `total_latency_ms`: End-to-end wall clock time.
3. **Fail-Fast Networking**:
   * Cloud Run VPC proxy sets `connect=2.5s` timeout to fail fast if the GPU VM is stopped or preempted.
   * Health probe (`GET /api/health/laya`) always returns HTTP 200 with structured diagnostic state (`ready`, `proxy_unreachable`, `gpu_stopped`, `auth_error`).
4. **Data Sanitization**:
   * Never commit real Google Cloud project IDs, project numbers, or internal IP addresses.
   * Always use sanitized placeholders (`your-project-id`, `laya-proxy-xyz.run.app`, `10.0.2.x`).
