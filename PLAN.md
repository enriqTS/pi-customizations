# Plan

Objective: support common Node, Python/uv, and Rust project workflows in the isolated OpenShell image while allowing sandbox internet access.

Approach:
- Keep the Debian Node image; install language toolchains and build prerequisites rather than switching to a broad, unmaintained development image.
- Remove the restrictive sandbox network allowlist while preserving filesystem isolation.
- Direct tool caches to writable `/tmp` locations under the existing filesystem policy.
- Update documentation and durable notes, review the focused diff, then commit.

Status: complete; the focused changes were reviewed and tested with the repository test suite.
