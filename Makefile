.PHONY: start dev test format lint clean check

start:
	uv run laya-agent --help

dev:
	uv run laya-agent --interactive

test:
	uv run pytest -v

format:
	uv run ruff format .

lint:
	uv run ruff check .

clean:
	rm -rf .pytest_cache .ruff_cache build dist *.egg-info __pycache__ src/**/__pycache__ tests/__pycache__

check: format lint test
