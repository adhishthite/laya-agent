# System 1 Decision Bench Backend

FastAPI service and CLI for the System 1 Head-to-Head Decision Bench comparing ConvAI Laya and TypeSafe Jev, with live web grounding via Vertex AI.

## API Endpoints

* `POST /api/compare/stream`: Progressive NDJSON stream comparing Laya and Jev.
* `POST /api/decide/stream`: Progressive NDJSON stream for Laya-only decision.
* `POST /api/compare`: Synchronous comparison response.
* `POST /api/decide`: Synchronous Laya decision response.
* `GET /api/health/laya`: Reachability probe for Laya GPU proxy.
* `GET /api/status`: System status and provider configuration.

## Makefile Targets

* `make start`: Start FastAPI production server on port 8000
* `make dev`: Start FastAPI development server with reload
* `make test`: Run test suite via `pytest`
* `make format`: Format with `ruff format`
* `make lint`: Lint with `ruff check`
* `make check`: Run validation pipeline (`format` -> `lint` -> `test`)
