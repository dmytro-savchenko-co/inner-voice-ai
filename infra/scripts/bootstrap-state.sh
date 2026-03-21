#!/usr/bin/env bash
# One-time bootstrap: create S3 bucket + DynamoDB table for OpenTofu state.
# Run this manually before the first `tofu init`.
#
# Usage: ./bootstrap-state.sh [region] [bucket-name]

set -euo pipefail

REGION="${1:-us-east-1}"
BUCKET="${2:-innervoice-tofu-state}"
TABLE="innervoice-tofu-locks"

echo "==> Creating S3 bucket: ${BUCKET} in ${REGION}"
if aws s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  echo "    Bucket already exists, skipping."
else
  aws s3api create-bucket \
    --bucket "${BUCKET}" \
    --region "${REGION}" \
    ${REGION:+$([ "$REGION" != "us-east-1" ] && echo "--create-bucket-configuration LocationConstraint=${REGION}" || true)}

  aws s3api put-bucket-versioning \
    --bucket "${BUCKET}" \
    --versioning-configuration Status=Enabled

  aws s3api put-bucket-encryption \
    --bucket "${BUCKET}" \
    --server-side-encryption-configuration '{
      "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
    }'

  aws s3api put-public-access-block \
    --bucket "${BUCKET}" \
    --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi

echo "==> Creating DynamoDB table: ${TABLE} in ${REGION}"
if aws dynamodb describe-table --table-name "${TABLE}" --region "${REGION}" 2>/dev/null; then
  echo "    Table already exists, skipping."
else
  aws dynamodb create-table \
    --table-name "${TABLE}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${REGION}"

  aws dynamodb wait table-exists --table-name "${TABLE}" --region "${REGION}"
fi

echo ""
echo "==> Bootstrap complete. Use these values in backend.tf:"
echo "    bucket         = \"${BUCKET}\""
echo "    dynamodb_table = \"${TABLE}\""
echo "    region         = \"${REGION}\""
