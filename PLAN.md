# Plan

## Objective

Produce sanitized, deterministic Pi asset and host integration archives for the portable OpenShell distribution defined by `openshell-environments` contract API 1, without changing the installed launcher or the 0.1.0 rollback path.

## Approach

1. Add an exporter that resolves this committed repository, requires a clean tree, and selects only explicit reviewed paths.
2. Generate versioned manifests with source revision, compatibility APIs, normalized modes, and per-file SHA-256 checksums.
3. Build byte-reproducible tar.gz archives with normalized timestamps/ownership and atomic output replacement.
4. Export a package-relative host launcher, client hook, settings/session/provider helpers, provider profile, and supplied validated compatibility metadata.
5. Verify generated archives and test reproducibility, exact member sets, forbidden-content exclusion, dirty-tree rejection, and package-relative behavior.
6. Preserve the source-based 0.1.0 adapter and do not install, publish, or activate generated packages.

## Status

Phase 2 complete. The exporter produces and reopens deterministic assets and host packages, validates exact compatibility and asset identity, and fails closed for dirty trees, forbidden paths, symlinks, and incompatible metadata. Tests cover byte-for-byte reproducibility, normalized manifests/checksums, exact package contents, and package-relative launch behavior.

The earlier OpenShell migration remains the rollback baseline. No portable artifact has been published, installed, or activated. Next action is Phase 3 in `openshell-environments`: consume the sanitized asset artifact and remove runtime image dependence on the source tree.
