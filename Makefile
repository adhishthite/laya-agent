ZONE ?= asia-south1-c
VM_NAME ?= laya-gpu-spot-v2

.PHONY: start dev test format lint clean check start-vm stop-vm status-vm

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

start-vm:
	@gcloud auth print-access-token >/dev/null 2>&1 || (echo "Error: Run 'gcloud auth login' first" && exit 1)
	@echo "Checking VM status..."
	@STATUS=$$(gcloud compute instances describe $(VM_NAME) --zone $(ZONE) --format="value(status)" 2>/dev/null) ; \
	if [ "$$STATUS" = "RUNNING" ]; then \
		echo "$(VM_NAME) is already RUNNING in $(ZONE)." ; \
	else \
		echo "Starting $(VM_NAME) in $(ZONE)..." ; \
		gcloud compute instances start $(VM_NAME) --zone $(ZONE) ; \
	fi

stop-vm:
	@echo "Stopping $(VM_NAME) in $(ZONE)..."
	@gcloud compute instances stop $(VM_NAME) --zone $(ZONE)

status-vm:
	@gcloud compute instances describe $(VM_NAME) --zone $(ZONE) --format="table(name,zone,status,machineType,scheduling.provisioningModel)"
