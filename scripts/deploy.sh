#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# NIX AI — Quick Deploy Script
#
# Usage:
#   ./scripts/deploy.sh           # Deploy everything
#   ./scripts/deploy.sh backend   # Deploy backend only
#   ./scripts/deploy.sh frontend  # Deploy frontend only
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
PROJECT="nixai"
TARGET="${1:-all}"

deploy_backend() {
    echo "🚀 Deploying backend..."
    cd backend
    sam build --use-container
    sam deploy --no-confirm-changeset --no-fail-on-empty-changeset
    cd ..
    
    API_URL=$(aws cloudformation describe-stacks \
        --stack-name "${PROJECT}-backend" \
        --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
        --output text --region "$REGION")
    echo "  ✅ Backend: $API_URL"
}

deploy_frontend() {
    echo "🌐 Deploying frontend..."
    cd frontend
    npm ci --prefer-offline
    npm run build
    
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
    CF_DIST_ID=$(aws cloudformation describe-stacks \
        --stack-name "${PROJECT}-infra" \
        --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
        --output text --region "$REGION" 2>/dev/null || echo "")

    if [ -n "$CF_DIST_ID" ] && [ "$CF_DIST_ID" != "None" ]; then
        aws cloudfront create-invalidation \
            --distribution-id "$CF_DIST_ID" \
            --paths "/*" > /dev/null
        echo "  ✅ CloudFront invalidated"
    fi
    cd ..
    echo "  ✅ Frontend deployed"
}

case "$TARGET" in
    backend)
        deploy_backend
        ;;
    frontend)
        deploy_frontend
        ;;
    all|"")
        deploy_backend
        deploy_frontend
        echo ""
        echo "✅ Full deployment complete!"
        ;;
    *)
        echo "Usage: $0 [backend|frontend|all]"
        exit 1
        ;;
esac
