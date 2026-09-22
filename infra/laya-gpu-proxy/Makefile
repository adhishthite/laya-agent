.PHONY: deploy set-upstream status logs

PROJECT ?= adhish-base-project-1
REGION  ?= asia-south1
SERVICE ?= laya-gpu-proxy
GPU_VM_URL ?= http://10.0.2.10:8080

# Rebuilds the image from this directory and redeploys. Only needed when
# proxy.py changes; a new upstream address does not require it.
deploy:
	gcloud run deploy $(SERVICE) \
		--source . \
		--region $(REGION) \
		--project $(PROJECT) \
		--no-allow-unauthenticated \
		--network claude-code-vpc \
		--subnet claude-code-subnet-mh \
		--vpc-egress private-ranges-only \
		--set-env-vars GPU_VM_URL=$(GPU_VM_URL) \
		--memory 512Mi \
		--cpu 1 \
		--max-instances 10 \
		--min-instances 0

# Repoints the proxy at a different GPU VM without rebuilding the image.
set-upstream:
	gcloud run services update $(SERVICE) \
		--region $(REGION) \
		--project $(PROJECT) \
		--update-env-vars GPU_VM_URL=$(GPU_VM_URL)

status:
	gcloud run services describe $(SERVICE) \
		--region $(REGION) \
		--project $(PROJECT) \
		--format="value(status.url,spec.template.spec.containers[0].env)"

logs:
	gcloud run services logs read $(SERVICE) \
		--region $(REGION) \
		--project $(PROJECT) \
		--limit 50
