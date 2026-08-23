#!/bin/sh
# Create the MinIO bucket Langfuse uses for event/media uploads (MVP-3 B1).
set -eu
mc alias set local "http://minio:9000" "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}"
mc mb --ignore-existing "local/${LANGFUSE_S3_BUCKET:-langfuse}"
echo "langfuse MinIO bucket ready"
