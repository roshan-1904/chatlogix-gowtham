#!/usr/bin/env bash
# Run this LOCALLY (needs AWS CLI + jq configured with prod credentials) after
# PgBouncer is installed, validated, and the firewall is open (see
# setup-pgbouncer.sh + the "PgBouncer connection pooling" plan).
#
# Safely merges DATABASE_URL/DATABASE_CONNECTION_LIMIT/DATABASE_POOL_TIMEOUT into
# ONE Lambda function's existing env vars at a time -- never overwrites the whole
# map, so OPENAI_API_KEY/queue URLs/etc. are preserved. Backs up the prior config
# so any single function can be reverted independently.
#
# Usage: ./update-lambda-database-url.sh chatlogix-order-recovery
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
BACKUP_DIR="./pgbouncer-cutover-backups"
mkdir -p "$BACKUP_DIR"

: "${NEW_DATABASE_URL:?Set NEW_DATABASE_URL, e.g. export NEW_DATABASE_URL='postgresql://apiuser:<pwd>@<host>:6432/chatlogix?schema=public&pgbouncer=true'}"

fn="${1:?Usage: $0 <lambda-function-name>}"

echo "=== $fn: fetching current config ==="
aws lambda get-function-configuration --function-name "$fn" --region "$REGION" \
  > "$BACKUP_DIR/${fn}.full.json"
jq '.Environment.Variables' "$BACKUP_DIR/${fn}.full.json" > "$BACKUP_DIR/${fn}.env.before.json"
revision_id=$(jq -r '.RevisionId' "$BACKUP_DIR/${fn}.full.json")

echo "=== $fn: merging in pooled DATABASE_URL (connection_limit=1, pool_timeout=3) ==="
jq --arg url "$NEW_DATABASE_URL" \
   '. + {DATABASE_URL: $url, DATABASE_CONNECTION_LIMIT: "1", DATABASE_POOL_TIMEOUT: "3"}' \
   "$BACKUP_DIR/${fn}.env.before.json" > "$BACKUP_DIR/${fn}.env.after.json"

echo "=== $fn: diff (review before applying) ==="
diff "$BACKUP_DIR/${fn}.env.before.json" "$BACKUP_DIR/${fn}.env.after.json" || true

read -p "Apply to $fn? [y/N] " confirm
if [ "$confirm" != "y" ]; then
  echo "Skipped $fn."
  exit 0
fi

aws lambda update-function-configuration --function-name "$fn" --region "$REGION" \
  --environment "Variables=$(cat "$BACKUP_DIR/${fn}.env.after.json")" \
  --revision-id "$revision_id"
aws lambda wait function-updated --function-name "$fn" --region "$REGION"
echo "=== $fn: done. Revert with:"
echo "  aws lambda update-function-configuration --function-name $fn --region $REGION --environment \"Variables=\$(cat $BACKUP_DIR/${fn}.env.before.json)\""
