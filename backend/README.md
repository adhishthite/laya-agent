# Laya Dual-Process Agent Backend

FastAPI service and CLI for the Dual-Process Agent combining Gemini 3.5 Flash-Lite (System 2) and ConvAI Laya / TypeSafe Jev (System 1).

## Makefile Targets

* `make start`: Start FastAPI production server on port 8000
* `make dev`: Start FastAPI development server with reload
* `make test`: Run test suite
* `make format`: Format with ruff
* `make lint`: Lint with ruff
* `make check`: Run format -> lint -> test
