# Plan

Objective: execute `OPENSHELL_MIGRATION_PLAN.md` by extracting reusable OpenShell infrastructure into a versioned `openshell-environments` repository and reducing this repository to Pi-owned assets plus a thin integration.

Approach:
1. Inventory and classify the current implementation, dependencies, tests, and pre-migration baseline.
2. Create the shared repository with durable docs, base image/toolchain, generic lifecycle helpers, composable policy, and parity tests.
3. Add the Pi client integration while retaining Pi settings, sessions, provider, patch, and resources here.
4. Pin dependency delivery and image compatibility; add explicit image build/inspection/cleanup commands rather than per-launch source builds.
5. Cut over the Pi adapter, run the test/security baseline, document rollback, then remove only proven duplication.

Status: in progress — inventory and baseline capture started.
