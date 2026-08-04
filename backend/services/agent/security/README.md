# Agent security configuration

The agent service applies a deterministic local policy by default and can delegate decisions to Open Policy Agent (OPA).

| Variable | Purpose | Recommended production value |
| --- | --- | --- |
| `OPA_DECISION_URL` | OPA REST decision endpoint | `http://opa:8181/v1/data/cortex/allow` |
| `OPA_REQUIRED` | Reject requests when OPA cannot be reached | `true` |
| `OPA_TIMEOUT_MS` | OPA request timeout | `1500` |
| `POLICY_VERSION` | Audit policy version | your deployed policy version |
| `HIGH_RISK_AGENTS` | Comma-separated tools requiring approval | tools that make irreversible external changes |
| `MAX_PROMPT_LENGTH` | Prompt-size limit | `12000` or lower |
| `DAILY_BUDGET_CENTS` | Atomic per-tenant daily reservation limit | Set per plan in production |
| `IMAGE_MODERATION_URL` | Image-output moderation service | Required in production |
| `IMAGE_MODERATION_REQUIRED` | Fail closed if image moderation is unavailable | `true` |
| `IMAGE_CLASSIFIER_URL` | Semantic image-prompt classifier | Required in production |
| `IMAGE_CLASSIFIER_REQUIRED` | Fail closed if semantic classification is unavailable | `true` |

## Modality enforcement

Use the explicit service routes `/image` and `/rag` for new clients. `/chat` remains a compatibility route, but the selected modality is still policy-checked before the graph runs. Image generation is denied for explicit sexual content, age ambiguity, graphic violence, and forged identity documents before the provider is called.

Generated image bytes remain in memory as quarantine until `IMAGE_MODERATION_URL` returns `ALLOW`; only then are they written to S3 or the local public upload directory. In production, missing moderation configuration fails closed.

Budget reservations use a Redis atomic script. Set `DAILY_BUDGET_CENTS` and make the value tenant/plan-specific at the policy service for multi-plan deployments.

OPA receives `{ input: { action, tool, user, tenantId, approvalId, traceId } }` and may return either a boolean or an object such as `{ "allow": true, "requiresApproval": false, "policyVersion": "2026-08-04" }`.

Audit events are JSON logs with `traceId`, user, tenant, selected tool, policy version, and redacted prompt metadata. Send those logs to the OpenTelemetry Collector configured for your deployment; no raw PII is logged by this layer.
