# Plan

Objective: fix repeated `fetch failed` errors after the OpenShell network-policy change.

Approach:
- Recover the prior network-policy fix that an older sandbox snapshot overwrote on exit.
- Reproduce the actual Codex request path and inspect gateway diagnostics.
- Apply and validate any additional fix, then commit from a clean host checkout.

Status: complete; the recovered policy passed an actual Codex request (`network-ok`) after a fresh image build and sandbox lifecycle.
