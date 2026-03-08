#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# NIX AI — First-Time Setup Script
#
# Run this ONCE on a fresh AWS account to set up everything.
# Prerequisites: AWS CLI configured, Docker running.
#
# Usage:
#   chmod +x scripts/setup.sh
#   ./scripts/setup.sh
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
PROJECT="nixai"

echo ""
echo "════════════════════════════════════════════════════"
echo "  NIX AI — First-Time AWS Setup"
echo "════════════════════════════════════════════════════"
echo ""

# ── 1. Check prerequisites ─────────────────────────────────────
echo "🔍 Checking prerequisites..."

command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI not found. Install: brew install awscli"; exit 1; }
command -v sam >/dev/null 2>&1 || { echo "❌ SAM CLI not found. Install: brew install aws-sam-cli"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker not found. Install: https://docker.com"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Install: brew install node@20"; exit 1; }

# Check AWS credentials
aws sts get-caller-identity >/dev/null 2>&1 || { echo "❌ AWS credentials not configured. Run: aws configure"; exit 1; }

ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
echo "  ✅ AWS Account: $ACCOUNT_ID"
echo "  ✅ Region: $REGION"
echo ""

# ── 2. Create GitHub OIDC Provider ─────────────────────────────
echo "🔐 Setting up GitHub OIDC provider..."
aws iam create-open-id-connect-provider \
    --url "https://token.actions.githubusercontent.com" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" \
    --region "$REGION" 2>/dev/null && echo "  ✅ OIDC provider created" || echo "  ℹ️  OIDC provider already exists"
echo ""

# ── 3. Deploy Infrastructure Stack ─────────────────────────────
echo "🏗️  Deploying infrastructure stack (DynamoDB, S3, SQS, CloudFront)..."
aws cloudformation deploy \
    --template-file infra/template.yaml \
    --stack-name "${PROJECT}-infra" \
    --parameter-overrides Environment=production ProjectName="${PROJECT}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$REGION" \
    --no-fail-on-empty-changeset

echo "  ✅ Infrastructure deployed"
echo ""

# ── 4. Get Infrastructure Outputs ──────────────────────────────
echo "📊 Infrastructure Outputs:"
echo "─────────────────────────────────────────────────"

CF_DIST_ID=$(aws cloudformation describe-stacks \
    --stack-name "${PROJECT}-infra" \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --output text --region "$REGION")

CF_URL=$(aws cloudformation describe-stacks \
    --stack-name "${PROJECT}-infra" \
    --query 'Stacks[0].Outputs[?OutputKey==`FrontendURL`].OutputValue' \
    --output text --region "$REGION")

GH_ROLE_ARN=$(aws cloudformation describe-stacks \
    --stack-name "${PROJECT}-infra" \
    --query 'Stacks[0].Outputs[?OutputKey==`GitHubActionsRoleArn`].OutputValue' \
    --output text --region "$REGION")

echo "  CloudFront Distribution ID : $CF_DIST_ID"
echo "  Frontend URL               : $CF_URL"
echo "  GitHub Actions Role ARN    : $GH_ROLE_ARN"
echo ""

# ── 5. Deploy Backend ──────────────────────────────────────────
echo "🚀 Building & deploying backend..."
cd backend
sam build --use-container
sam deploy --no-confirm-changeset --no-fail-on-empty-changeset
cd ..

API_URL=$(aws cloudformation describe-stacks \
    --stack-name "${PROJECT}-backend" \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text --region "$REGION")

echo "  ✅ Backend deployed: $API_URL"
echo ""

# ── 6. Build & Deploy Frontend ─────────────────────────────────
echo "🌐 Building & deploying frontend..."
cd frontend
npm ci
VITE_API_URL="$API_URL" npm run build

# Upload to S3
aws s3 sync dist/ "s3://${PROJECT}-frontend/" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --exclude "index.html" \
    --exclude "*.json" \
    --region "$REGION"

aws s3 cp dist/index.html "s3://${PROJECT}-frontend/index.html" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "text/html" \
    --region "$REGION"

# Invalidate CloudFront
if [ -n "$CF_DIST_ID" ] && [ "$CF_DIST_ID" != "None" ]; then
    aws cloudfront create-invalidation \
        --distribution-id "$CF_DIST_ID" \
        --paths "/*" \
        --region "$REGION" > /dev/null
fi
cd ..

echo "  ✅ Frontend deployed"
echo ""

# ── 7. Smoke Test ──────────────────────────────────────────────
echo "🔍 Running smoke test..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/")
if [ "$STATUS" -eq 200 ]; then
    echo "  ✅ API health check passed (HTTP $STATUS)"
else
    echo "  ⚠️  API returned HTTP $STATUS (may need Cognito warm-up)"
fi
echo ""

# ── 8. Summary ─────────────────────────────────────────────────
echo "════════════════════════════════════════════════════"
echo "  🎉 NIX AI Setup Complete!"
echo "════════════════════════════════════════════════════"
echo ""
echo "  🌐 Frontend:  $CF_URL"
echo "  🔌 API:       $API_URL"
echo "  📊 API Docs:  $API_URL/docs"
echo ""
echo "  📋 GitHub Actions Setup:"
echo "  ─────────────────────────────────────────────────"
echo "  Add these to your GitHub repo → Settings → Secrets:"
echo ""
echo "  Secret:   AWS_DEPLOY_ROLE_ARN = $GH_ROLE_ARN"
echo "  Variable: CLOUDFRONT_DISTRIBUTION_ID = $CF_DIST_ID"
echo "  Variable: FRONTEND_S3_BUCKET = ${PROJECT}-frontend"
echo "  Variable: VITE_API_URL = $API_URL"
echo ""
