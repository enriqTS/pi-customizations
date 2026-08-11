# Plan

Objective: execute `OPENSHELL_MIGRATION_PLAN.md` by extracting reusable OpenShell infrastructure into a versioned `openshell-environments` repository and reducing this repository to Pi-owned assets plus a thin integration.

Approach:
1. Inventory and classify the current implementation, dependencies, tests, and pre-migration baseline.
2. Create the shared repository with durable docs, base image/toolchain, generic lifecycle helpers, composable policy, and parity tests.
3. Add the Pi client integration while retaining Pi settings, sessions, provider, patch, and resources here.
4. Pin dependency delivery and image compatibility; add explicit image build/inspection/cleanup commands rather than per-launch source builds.
5. Cut over the Pi adapter, run the test/security baseline, document rollback, then remove only proven duplication.

Status: complete — `openshell-environments` 0.1.0/API 1 now owns the shared base, policy, Git/workspace lifecycle, recovery, tests, documentation, and explicit tagged image lifecycle. This repository pins it and retains Pi-owned resources, settings/sessions, provider compatibility, entrypoint, and a thin adapter. Unit tests, both image builds, tool checks, public HTTP/HTTPS, blocked port 22/filesystem writes, Git/session round trip, and a live Codex request passed.

Rollback: tag `pre-openshell-migration-20260811` points to the final old launcher at `05d90d3`.
