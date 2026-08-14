# Memory

- This repository produces generic Pi resources only: `APPEND_SYSTEM.md`, `agents/`, `extensions/`, `skills/`, and `themes/`. Do not add environment, host-launcher, provider, credential, or sandbox-specific configuration here.
- `bin/export-pi-release.mjs` exports only generic `pi-assets` archives. It requires a clean committed source tree, accepts regular files only, normalizes archive metadata, records per-file SHA-256 checksums, and verifies the finished archive before publication.
- A generic asset release is tagged `pi-assets-v<version>` and publishes `pi-assets-<version>.tar.gz`, `SHA256SUMS`, and build provenance. The archive manifest remains schema/API version 1 and gives every resource `target: "agent"`.
- Keep generated release output under ignored `dist/`; writing generated files into the checkout makes the exporter's clean-tree check fail.
- Never commit credentials. Pi credentials belong in `~/.pi/agent/auth.json`.
