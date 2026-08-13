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

Phase 3 (`openshell-environments`) is complete: its Pi image now installs from the exported `pi-assets` archive into Pi's standard resource paths instead of copying this whole checkout.

Supporting `openshell-environments`' Phase 4, this repository gained `.github/workflows/release-pi-assets.yml`: on a `pi-assets-v<version>` tag it runs `npm test`, runs the existing exporter, and publishes `pi-assets-<version>.tar.gz` plus `SHA256SUMS` as a GitHub Release with a build-provenance attestation on the archive — so `openshell-environments` downloads and verifies a published artifact rather than cloning this repository's source and running its scripts. Locally verified (`actionlint`, the exact exporter command the workflow runs, `npm test`); not yet triggered — no `pi-assets-v*` tag has been pushed, so no release exists yet.

The earlier OpenShell migration remains the rollback baseline. No portable artifact has been published, installed, or activated. Next action: push this repository and a `pi-assets-v0.1.0` tag (pending explicit go-ahead), then Phase 5 in `openshell-environments` (the host integration package release/installer).
