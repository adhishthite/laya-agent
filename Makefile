.PHONY: start dev test format lint clean check

start:
	bun run concurrently -n backend,frontend -c green,cyan "make -C backend start" "make -C frontend start"

dev:
	bun run concurrently -n backend,frontend -c green,cyan "make -C backend dev" "make -C frontend dev"

test:
	make -C backend test
	make -C frontend test

format:
	make -C backend format
	make -C frontend format

lint:
	make -C backend lint
	make -C frontend lint

clean:
	make -C backend clean
	make -C frontend clean

check: format lint test
