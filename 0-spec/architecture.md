# Dual-Process AI Agent Specification

## 1. System Overview

The Dual-Process AI Agent combines fast, calibrated, non-autoregressive decision models (System 1) with slow, deliberative, autoregressive generative models (System 2) for grounded decision-making.

```
                  ┌────────────────────────────────────────┐
                  │         User Query / Scenario          │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │  Gemini 3.5 Flash-Lite (Vertex AI)     │
                  │  Tool: google_search grounding         │
                  └───────────────────┬────────────────────┘
                                      │
                               Web Evidence
                                      │
               ┌──────────────────────┴──────────────────────┐
               ▼                                             ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│  ConvAI Laya (System 1)      │              │  TypeSafe Jev (System 1)     │
│  ModernBERT on NVIDIA L4 GPU │              │  Multi-Tenant SaaS API       │
│  Private VPC / Cloud Run     │              │  https://api.typesafe.ai     │
└──────────────┬───────────────┘              └──────────────┬───────────────┘
               │                                             │
               │         Leave-One-Out Source Attribution    │
               │         Calibrated Choice & Probabilities   │
               │                                             │
               └──────────────────────┬──────────────────────┘
                                      │
                          Consensus & Confidence
                                      │
                      ┌───────────────┴───────────────┐
                      ▼                               ▼
            Confidence >= 0.60              Confidence < 0.60
            ┌───────────────────┐           ┌───────────────────┐
            │ Fast Path Return  │           │ Gemini 3.5 Delib. │
            │ Sub-second TAT    │           │ Tradeoff Analysis │
            └───────────────────┘           └───────────────────┘
```

## 2. Component Specifications

### 2.1 Backend (Python / FastAPI / uv)
* **Framework**: FastAPI + Uvicorn
* **Model Clients**:
  * `System1LayaClient`: Connects to Laya via Cloud Run Direct VPC proxy with IAM token auth.
  * `System1JevClient`: Connects to TypeSafe Jev API via `TYPESAFE_API_KEY`.
  * `System2GeminiClient`: Connects to Vertex AI Gemini 3.5 Flash-Lite with `google_search` grounding.
* **Endpoints**:
  * `POST /api/decide`: Executes dual-process decision.
  * `POST /api/compare`: Executes parallel Laya vs Jev comparison.
  * `GET /api/status`: Health and connectivity checks.

### 2.2 Frontend (React / Vite / TypeScript / bun)
* **Framework**: Vite + React 19 + TypeScript
* **Design**: Tailwind CSS with OKLCH color space and Biome formatting.
* **Components**: Clean decision cards, latency metrics, probability bars, source attribution impact tables.

### 2.3 Orchestration
* Root Makefile orchestrates `backend/` and `frontend/` using `concurrently`.
