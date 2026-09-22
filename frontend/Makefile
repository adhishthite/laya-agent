.PHONY: start dev test format lint clean check

start:
	bun run build && bun run preview --port 5173 --host 0.0.0.0

dev:
	bun run dev --port 5173 --host 0.0.0.0

test:
	bun run vitest run

format:
	bunx @biomejs/biome format --write src/

lint:
	bunx @biomejs/biome check src/

clean:
	rm -rf dist node_modules/.vite

check: format lint test
