.PHONY: start dev test format lint clean check

start:
	uv run uvicorn laya_agent.server:app --host 0.0.0.0 --port 8000

dev:
	uv run uvicorn laya_agent.server:app --reload --host 0.0.0.0 --port 8000

test:
	uv run pytest -v

format:
	uv run ruff format .

lint:
	uv run ruff check .

clean:
	rm -rf .pytest_cache .ruff_cache build dist *.egg-info __pycache__ src/**/__pycache__ tests/__pycache__ .venv

check: format lint test
