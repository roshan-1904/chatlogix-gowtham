#!/usr/bin/env bash
# Grant chatlogix-lambda-role permission to write turn-audit events to a dedicated
# CloudWatch Logs log group (TURN_AUDIT_LOG_GROUP).
#
# Idempotent — safe to re-run.
set -euo pipefail

ROLE_NAME="${LAMBDA_ROLE_NAME:-chatlogix-lambda-role}"
POLICY_NAME="${POLICY_NAME:-chatlogix-turn-audit-logs}"
LOG_GROUP="${TURN_AUDIT_LOG_GROUP:-/chatlogix/turn-audit}"
REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"

if [ -z "$ACCOUNT_ID" ]; then
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
fi

LOG_GROUP_ARN="arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:${LOG_GROUP}:*"

POLICY_DOC=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TurnAuditLogGroup",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": [
        "arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:${LOG_GROUP}",
        "${LOG_GROUP_ARN}"
      ]
    }
  ]
}
EOF
)

echo "=== Attaching ${POLICY_NAME} to ${ROLE_NAME} (log group ${LOG_GROUP}) ==="
aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "$POLICY_DOC"

echo "Done. Set TURN_AUDIT_LOG_GROUP=${LOG_GROUP} on webhook, processor, and dispatcher Lambdas."
