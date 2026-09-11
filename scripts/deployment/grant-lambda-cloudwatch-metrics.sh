#!/usr/bin/env bash
# Grant chatlogix-lambda-role permission to publish custom metrics from the
# conversation processor (ChatLogix/ConversationParity namespace).
#
# Idempotent — safe to re-run.
set -euo pipefail

ROLE_NAME="${LAMBDA_ROLE_NAME:-chatlogix-lambda-role}"
POLICY_NAME="${POLICY_NAME:-chatlogix-cloudwatch-custom-metrics}"
NAMESPACE="${CLOUDWATCH_NAMESPACE:-ChatLogix/ConversationParity}"

POLICY_DOC=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PutConversationParityMetrics",
      "Effect": "Allow",
      "Action": "cloudwatch:PutMetricData",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "cloudwatch:namespace": "${NAMESPACE}"
        }
      }
    }
  ]
}
EOF
)

echo "=== Attaching inline policy ${POLICY_NAME} to role ${ROLE_NAME} (namespace ${NAMESPACE}) ==="
aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "$POLICY_DOC"

echo "Done. Existing Lambda containers pick this up on the next cold start."
