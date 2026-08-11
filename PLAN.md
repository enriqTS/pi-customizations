# Plan

Objective: permit general outbound internet access while preserving Codex credential routing.

Approach:
- Determine OpenShell 0.0.102 policy syntax for broad endpoint and binary authorization.
- Keep the narrow Codex credential provider rules and add a separate general-egress rule.
- Validate model access and representative internet access in a fresh sandbox, then commit.

Status: complete; public HTTP/HTTPS endpoints and Codex model access both pass in OpenShell sandboxes.
