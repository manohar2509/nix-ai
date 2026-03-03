#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# NIX AI — Knowledge Base Upload Script
# Uploads all KB markdown files to S3 with proper category metadata
# ═══════════════════════════════════════════════════════════════════════════

set -e

# Load environment variables from .env
export $(cat backend/.env | grep -E "^AWS_|KB_BUCKET_NAME" | xargs)

KB_BUCKET_NAME="${KB_BUCKET_NAME:-nixai-clinical-kb}"
KB_DIR="project/knowledge_base/kb_ready"

echo "🔐 AWS Credentials loaded from backend/.env"
echo "📦 KB Bucket: $KB_BUCKET_NAME"
echo "📁 KB Directory: $KB_DIR"
echo ""

# Verify bucket exists and is accessible
echo "🔍 Verifying S3 bucket access..."
if aws s3 ls "s3://$KB_BUCKET_NAME" > /dev/null 2>&1; then
    echo "✅ S3 bucket is accessible"
else
    echo "❌ ERROR: Cannot access S3 bucket '$KB_BUCKET_NAME'"
    echo "   Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in backend/.env"
    exit 1
fi

echo ""
echo "🚀 Uploading KB files to S3..."
echo ""

# Counter for tracking uploads
uploaded=0
failed=0

# Upload each markdown file with proper metadata
for md_file in "$KB_DIR"/*.md; do
    if [ -f "$md_file" ]; then
        filename=$(basename "$md_file")
        s3_key="documents/$filename"
        
        echo -n "⏳ Uploading $filename ... "
        
        if aws s3 cp "$md_file" "s3://$KB_BUCKET_NAME/$s3_key" \
            --content-type "text/markdown" \
            --region "us-east-1" \
            --quiet 2>/dev/null; then
            echo "✅"
            ((uploaded++))
        else
            echo "❌"
            ((failed++))
        fi
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "📊 Upload Summary:"
echo "   ✅ Successfully uploaded: $uploaded files"
if [ $failed -gt 0 ]; then
    echo "   ❌ Failed: $failed files"
    exit 1
fi
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "✅ All KB files uploaded successfully!"
echo ""
echo "📋 Next Steps:"
echo "   1. Go to the NIX AI Admin UI (http://localhost:5173 or https://...)"
echo "   2. Navigate to Knowledge Base → Documents"
echo "   3. Click the purple 'Sync Knowledge Base' button"
echo "   4. Wait for Bedrock to re-index the new documents (~2-3 min)"
echo "   5. Verify with Health Check button that all documents are indexed"
echo ""
echo "🎯 Files are now in S3:"
for md_file in "$KB_DIR"/*.md; do
    filename=$(basename "$md_file")
    echo "   s3://$KB_BUCKET_NAME/documents/$filename"
done
