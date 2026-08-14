# Pi customizations

Version-controlled, generic Pi resources.

## Contents

- `APPEND_SYSTEM.md` — appended Pi system guidance
- `agents/` — subagent definitions
- `extensions/` — TypeScript extensions, including the Terraform apply guard
- `skills/` and `themes/` — Pi resources
- `bin/export-pi-release.mjs` — deterministic generic asset exporter

Keep credentials in `~/.pi/agent/auth.json`; never commit them here. Run `/reload` after changing linked Pi resources. Agent definitions are discovered for each `subagent` call.

## Generic asset releases

Tags named `pi-assets-v<semver>` publish `pi-assets-<semver>.tar.gz`, `SHA256SUMS`, and a build-provenance attestation. The archive is schema/API version 1 and contains only `manifest.json`, `APPEND_SYSTEM.md`, and committed files under `agents/`, `extensions/`, `skills/`, and `themes/`. Every manifest file has `target: "agent"`, normalized metadata, and a SHA-256 checksum.

Create an archive from a clean checkout:

```bash
node bin/export-pi-release.mjs --version 0.2.0 --output dist
```

## Tests

```bash
npm test
```
