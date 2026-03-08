# ═══════════════════════════════════════════════════════════════
# NIX AI — Makefile
# One-command deployment for backend & frontend
# ═══════════════════════════════════════════════════════════════

.PHONY: help install dev backend-dev frontend-dev build deploy deploy-backend deploy-frontend deploy-infra test lint clean

# ── Variables ──────────────────────────────────────────────────
AWS_REGION       ?= us-east-1
STACK_NAME       ?= nixai-backend
INFRA_STACK_NAME ?= nixai-infra
FRONTEND_BUCKET  ?= nixai-frontend
AMPLIFY_APP_ID   ?= d3hb7807u19psc
AMPLIFY_BRANCH   ?= develop

# ── Default ────────────────────────────────────────────────────
help: ## Show this help
	@echo ""
	@echo "  NIX AI — Deployment Commands"
	@echo "  ══════════════════════════════════════════"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ═══════════════════════════════════════════════════════════════
# LOCAL DEVELOPMENT
# ═══════════════════════════════════════════════════════════════

install: ## Install all dependencies (backend + frontend)
	cd backend && python -m pip install -r requirements-dev.txt
	cd frontend && npm ci

backend-dev: ## Start backend locally (uvicorn)
	cd backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend-dev: ## Start frontend locally (vite)
	cd frontend && npm run dev

dev: ## Start both backend and frontend (requires tmux or run in two terminals)
	@echo "Run in separate terminals:"
	@echo "  make backend-dev"
	@echo "  make frontend-dev"

# ═══════════════════════════════════════════════════════════════
# TESTING
# ═══════════════════════════════════════════════════════════════

test: ## Run all tests
	cd backend && python -m pytest tests/ -v --tb=short

lint: ## Lint backend + frontend
	cd backend && python -m ruff check app/ worker/ --ignore E501
	cd frontend && npm run lint

# ═══════════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════════

build: build-backend build-frontend ## Build everything

build-backend: ## SAM build (uses Docker)
	cd backend && sam build --use-container

build-frontend: ## Vite production build
	cd frontend && npm ci && npm run build

# ═══════════════════════════════════════════════════════════════
# DEPLOY — INFRASTRUCTURE (one-time)
# ═══════════════════════════════════════════════════════════════

deploy-infra: ## Deploy infrastructure stack (DynamoDB, S3, SQS, CloudFront) — run ONCE
	@echo "🏗️  Deploying infrastructure stack..."
	aws cloudformation deploy \
		--template-file infra/template.yaml \
		--stack-name $(INFRA_STACK_NAME) \
		--parameter-overrides Environment=production \
		--capabilities CAPABILITY_NAMED_IAM \
		--region $(AWS_REGION) \
		--no-fail-on-empty-changeset
	@echo ""
	@echo "✅ Infrastructure deployed. Outputs:"
	@aws cloudformation describe-stacks \
		--stack-name $(INFRA_STACK_NAME) \
		--query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
		--output table \
		--region $(AWS_REGION)

# ═══════════════════════════════════════════════════════════════
# DEPLOY — BACKEND (SAM)
# ═══════════════════════════════════════════════════════════════

deploy-backend: build-backend ## Build + deploy backend to AWS
	@echo "🚀 Deploying backend..."
	cd backend && sam deploy \
		--no-confirm-changeset \
		--no-fail-on-empty-changeset
	@echo ""
	@echo "✅ Backend deployed. API Endpoint:"
	@aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) \
		--query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
		--output text \
		--region $(AWS_REGION)

# ═══════════════════════════════════════════════════════════════
# DEPLOY — FRONTEND (AWS Amplify)
# ═══════════════════════════════════════════════════════════════

deploy-frontend: ## Trigger Amplify build for $(AMPLIFY_BRANCH) branch
	@echo "🌐 Triggering Amplify build for app=$(AMPLIFY_APP_ID) branch=$(AMPLIFY_BRANCH)..."
	$(eval JOB_ID := $(shell aws amplify start-job \
		--app-id $(AMPLIFY_APP_ID) \
		--branch-name $(AMPLIFY_BRANCH) \
		--job-type RELEASE \
		--query 'jobSummary.jobId' \
		--output text \
		--region $(AWS_REGION)))
	@echo "✅ Amplify job started: $(JOB_ID)"
	@echo "🔗 https://$(AMPLIFY_BRANCH).$(AMPLIFY_APP_ID).amplifyapp.com"
	@echo "  Monitor: aws amplify get-job --app-id $(AMPLIFY_APP_ID) --branch-name $(AMPLIFY_BRANCH) --job-id $(JOB_ID)"

# ═══════════════════════════════════════════════════════════════
# DEPLOY — EVERYTHING
# ═══════════════════════════════════════════════════════════════

deploy: deploy-backend deploy-frontend ## Deploy backend + frontend (full deploy)
	@echo ""
	@echo "════════════════════════════════════════════"
	@echo "  ✅ NIX AI deployed successfully!"
	@echo "════════════════════════════════════════════"

# ═══════════════════════════════════════════════════════════════
# UTILITY
# ═══════════════════════════════════════════════════════════════

status: ## Show deployment status
	@echo "📊 Backend Stack:"
	@aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) \
		--query 'Stacks[0].{Status:StackStatus,Updated:LastUpdatedTime}' \
		--output table 2>/dev/null || echo "  Not deployed"
	@echo ""
	@echo "📊 Infrastructure Stack:"
	@aws cloudformation describe-stacks \
		--stack-name $(INFRA_STACK_NAME) \
		--query 'Stacks[0].{Status:StackStatus,Updated:LastUpdatedTime}' \
		--output table 2>/dev/null || echo "  Not deployed"

logs-api: ## Tail API Lambda logs
	aws logs tail /aws/lambda/nixai-api --follow --region $(AWS_REGION)

logs-worker: ## Tail Worker Lambda logs
	aws logs tail /aws/lambda/nixai-worker --follow --region $(AWS_REGION)

clean: ## Clean build artifacts
	rm -rf backend/.aws-sam
	rm -rf frontend/dist
	rm -rf frontend/node_modules/.cache
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# ═══════════════════════════════════════════════════════════════
# GITHUB OIDC SETUP
# ═══════════════════════════════════════════════════════════════

setup-github-oidc: ## Create GitHub OIDC provider in AWS (one-time)
	@echo "🔐 Creating GitHub OIDC provider..."
	@aws iam create-open-id-connect-provider \
		--url "https://token.actions.githubusercontent.com" \
		--client-id-list "sts.amazonaws.com" \
		--thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" \
		--region $(AWS_REGION) 2>/dev/null || echo "  OIDC provider already exists"
	@echo "✅ Done. Now run: make deploy-infra"
