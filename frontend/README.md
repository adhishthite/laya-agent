# System 1 Decision Bench Frontend

React 19 single-page application for the System 1 Head-to-Head Decision Bench.

## Features

* Head-to-head comparison console for ConvAI Laya and TypeSafe Jev.
* Toggle between live Web Grounding (Vertex AI Search) and Raw Priors.
* Zero-reload progressive NDJSON streaming with stable workspace rendering.
* Isolated latency metrics: Web search vs Pure Laya GPU vs Pure Jev API.
* Leave-one-out source attribution ledger with delta point indicators.
* Light and dark themes using the OKLCH color space.

## Makefile Targets

* `make start`: Start production preview server
* `make dev`: Start Vite development server on port 5173
* `make test`: Run frontend unit tests via `vitest`
* `make format`: Format code with `biome format`
* `make lint`: Lint code with `biome check`
* `make check`: Run validation pipeline (`format` -> `lint` -> `test`)
