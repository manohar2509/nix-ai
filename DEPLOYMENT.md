# NIX AI — Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CloudFront CDN                        │
│                 (nixai-frontend S3)                      │
│                    React SPA                             │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────┐
│              API Gateway (REST, prod stage)              │
│              Cognito Authorizer (JWT)                    │
└────────┬───────────────────────────────────┬────────────┘
         │                                   │
┌────────▼────────┐               ┌──────────▼──────────┐
│  nixai-api       │               │  nixai-worker       │
│  Lambda (1024MB) │──── SQS ────▶│  Lambda (1024MB)    │
│  FastAPI+Mangum  │               │  15 min timeout     │
└────────┬────────┘               └──────────┬──────────┘
         │                                   │
    ┌────▼────────────────────────────────────▼───┐
    │  DynamoDB (nixai-core)                      │
    │  S3 (nixai-clinical-uploads)                │
    │  S3 (nixai-clinical-kb)                     │
    │  Bedrock (Nova Lite / Nova Pro)             │
    │  Bedrock Knowledge Base (R8HXMHF97R)        │
    │  Cognito User Pool                          │
    └─────────────────────────────────────────────┘
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| AWS CLI | v2+ | `brew install awscli` |
| SAM CLI | v1.100+ | `brew install aws-sam-cli` |
| Python | 3.12 | `brew install python@3.12` |
| Node.js | 20+ | `brew install node@20` |
| Docker | Latest | [docker.com](https://docker.com) (for SAM build) |

---

## 🚀 Quick Deploy (3 commands)

```bash
# 1. First-time infrastructure setup (DynamoDB, S3, SQS, CloudFront)
make deploy-infra

# 2. Deploy backend (SAM → Lambda + API Gateway)
make deploy-backend

# 3. Deploy frontend (Vite build → S3 + CloudFront)
make deploy-frontend
```

Or deploy everything at once:
```bash
make deploy
```

---

## Step-by-Step Setup

### Step 1: AWS Account Setup

Ensure these are configured in your AWS account (us-east-1):

1. **AWS CLI credentials** configured:
   ```bash
   aws configure
   # Or use SSO: aws sso login --profile your-profile
   ```

2. **Cognito User Pool** (already exists):
   - User Pool ID: `us-east-1_rjx3Fv6lg`
   - App Client ID: `937sqn4ogsomo8d6stlapvpo9`

3. **Bedrock Model Access** — enable in the AWS Console:
   - `amazon.nova-lite-v1:0` (main model)
   - `us.amazon.nova-pro-v1:0` (boardroom debates)
   - Navigate: AWS Console → Bedrock → Model Access → Request Access

4. **Bedrock Knowledge Base** (already exists):
   - KB ID: `R8HXMHF97R`
   - Data source: `nixai-clinical-kb` S3 bucket

### Step 2: Deploy Infrastructure (One-Time)

```bash
# Create GitHub OIDC provider (for CI/CD)
make setup-github-oidc

# Deploy all infrastructure resources
make deploy-infra
```

This creates:
- DynamoDB table (`nixai-core`)
- S3 buckets (uploads, kb, frontend)
- SQS queue + DLQ
- CloudFront distribution
- GitHub Actions IAM role (OIDC)

**After deployment, note the outputs:**
- `CloudFrontDistributionId` — needed for CI/CD
- `GitHubActionsRoleArn` — needed for CI/CD
- `FrontendURL` — your app's public URL

### Step 3: Configure GitHub Secrets

Go to **GitHub → Settings → Secrets and variables → Actions**:

| Type | Name | Value |
|------|------|-------|
| Secret | `AWS_DEPLOY_ROLE_ARN` | ARN from Step 2 output |
| Variable | `VITE_API_URL` | `https://9nffw9vxc5.execute-api.us-east-1.amazonaws.com/prod` |
| Variable | `VITE_COGNITO_USER_POOL_ID` | `us-east-1_rjx3Fv6lg` |
| Variable | `VITE_COGNITO_CLIENT_ID` | `937sqn4ogsomo8d6stlapvpo9` |
| Variable | `VITE_COGNITO_REGION` | `us-east-1` |
| Variable | `FRONTEND_S3_BUCKET` | `nixai-frontend` |
| Variable | `CLOUDFRONT_DISTRIBUTION_ID` | From Step 2 output |

### Step 4: Deploy Backend

```bash
make deploy-backend
```

This runs:
1. `sam build --use-container` (Docker builds the Python Lambda package)
2. `sam deploy` (CloudFormation creates/updates Lambda + API Gateway)

### Step 5: Deploy Frontend

```bash
make deploy-frontend
```

This runs:
1. `npm ci && npm run build` (Vite production build)
2. `aws s3 sync` (upload to S3 with proper caching headers)
3. `aws cloudfront create-invalidation` (clear CDN cache)

### Step 6: Update Frontend CORS Origins

After getting your CloudFront URL, update the backend SAM template's `CorsOrigins` parameter:

```bash
# In backend/samconfig.toml, add your CloudFront domain to parameter_overrides:
# CorsOrigins=https://d1234567890.cloudfront.net,https://9nffw9vxc5.execute-api.us-east-1.amazonaws.com,...
```

Then redeploy the backend: `make deploy-backend`

---

## CI/CD Pipeline

The GitHub Actions pipeline (`.github/workflows/deploy.yml`) runs automatically:

| Trigger | Action |
|---------|--------|
| PR to `main` | Run tests only (no deploy) |
| Push to `main` | Test → Deploy backend → Deploy frontend → Smoke test |
| Push to `staging` | Test → Deploy to staging environment |

### Pipeline Flow

```
Push to main
    │
    ├──► Backend Tests  ──► Deploy Backend (SAM)  ─┐
    │                                               ├──► Smoke Test
    └──► Frontend Build ──► Deploy Frontend (S3)   ─┘
```

---

## Alternative: Deploy with Access Keys (No OIDC)

If you prefer access keys over OIDC:

1. Create an IAM user with the policies from `infra/template.yaml`
2. In `.github/workflows/deploy.yml`, change the credentials step:

```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: us-east-1
```

3. Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as GitHub secrets.

---

## Manual Deploy (Without Make)

```bash
# Backend
cd backend
sam build --use-container
sam deploy --no-confirm-changeset --no-fail-on-empty-changeset

# Frontend
cd frontend
npm ci
npm run build
aws s3 sync dist/ s3://nixai-frontend/ --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

---

## Useful Commands

```bash
make status          # Check deployment status
make logs-api        # Tail API Lambda logs (live)
make logs-worker     # Tail Worker Lambda logs (live)
make clean           # Remove build artifacts
make test            # Run backend tests
make lint            # Lint backend + frontend
```

---

## Troubleshooting

### SAM Build Fails
```bash
# Ensure Docker is running
docker info

# Try without container (uses local Python)
cd backend && sam build
```

### Lambda Cold Start Slow
The SAM template includes `AutoPublishAlias: live` for the API Lambda. To add provisioned concurrency (keeps 1 instance warm):

Uncomment in `template.yaml`:
```yaml
ProvisionedConcurrencyConfig:
  ProvisionedConcurrentExecutions: 1
```

### CORS Errors in Browser
1. Check the `CorsOrigins` parameter in `backend/samconfig.toml`
2. Ensure your CloudFront domain is in the list
3. Redeploy: `make deploy-backend`

### Frontend Shows Blank Page
1. Check browser console for errors
2. Verify `.env.production` has the correct `VITE_API_URL`
3. Rebuild and redeploy: `make deploy-frontend`

### 401 Unauthorized from API
1. Ensure Cognito User Pool and App Client IDs match
2. Check the Cognito Authorizer is properly configured in API Gateway
3. Verify the user exists in the Cognito User Pool
