# Run Pi in OpenShell

Shared image, policy, gateway, workspace/Git lifecycle, and recovery behavior live in [`openshell-environments`](https://github.com/enriqTS/openshell-environments). This repository owns Pi resources and the thin client integration.

## Portable installation (recommended)

For normal use, install the published `pi-openshell` host package instead of checking out either repository:

```bash
curl -fsSL https://raw.githubusercontent.com/enriqTS/pi-customizations/main/bin/install-pi-openshell | bash -s -- install <version>
```

`bin/install-pi-openshell` downloads and checksum-verifies a `pi-openshell-v<version>` GitHub Release, validates its manifest and `compatibility.json` inline (no dependency on a local checkout), fetches the compatible `openshell-environments` release it names, installs atomically under `${XDG_DATA_HOME:-$HOME/.local/share}/pi-openshell/<version>/`, and symlinks `${XDG_BIN_HOME:-$HOME/.local/bin}/pi`. Manage installed versions with `install-pi-openshell {upgrade|downgrade|uninstall|list}`. See `openshell-environments`' [`docs/pi-release-contracts.md`](https://github.com/enriqTS/openshell-environments/blob/main/docs/pi-release-contracts.md) for the full contract.

Releases are cut by `.github/workflows/release-pi-openshell.yml` on a `pi-openshell-v<version>` tag, which assembles `compatibility.json` from the `release/openshell-environments.version` and `release/pi-assets.version` pin files (resolving the actual published image digest and asset checksum, never hand-transcribed) and publishes via `bin/export-pi-release.mjs host`.

The rest of this document covers the source-based rollback path (`bin/pi-openshell`, still pinned at `openshell-environments` 0.1.0), useful for local development of either repository.

## Compatibility and installation

This revision requires `openshell-environments` 0.1.0, launcher API 1. Install the tagged dependency:

```bash
bin/install-openshell-environments
```

Before the release exists remotely, or while developing both repositories, install from an explicit checkout:

```bash
PI_OPENSHELL_ENVIRONMENTS_SOURCE=/path/to/openshell-environments \
  bin/install-openshell-environments
```

An explicit non-installed checkout may instead be selected with `PI_OPENSHELL_ENVIRONMENTS_DIR`. The wrapper validates both `VERSION` and `API_VERSION`; it never relies on an unversioned sibling checkout.

Build the deliberately tagged base and Pi images after installation or after changing either repository:

```bash
shared="$HOME/.local/share/openshell-environments/0.1.0"
"$shared/bin/openshell-image" build all --pi-source "$PWD"
"$shared/bin/openshell-image" inspect pi
```

The launcher uses the full reference `localhost/openshell-environments/pi:0.1.0`. It fails with the build command when that image is absent and never rebuilds on Pi startup. Set `PI_OPENSHELL_IMAGE` only to another full versioned reference. Use `openshell-image cleanup` to remove this version's images.

## Portable release artifacts

Release exports require a clean committed tree and select only reviewed paths; they never archive the checkout or host Pi profile. Create the deterministic asset archive with:

```bash
bin/export-pi-release.mjs assets --version 0.2.0 --output dist
```

This writes `pi-assets-0.2.0.tar.gz` and updates `dist/SHA256SUMS`. The archive contains `APPEND_SYSTEM.md`, committed agents/extensions/skills/themes, and the two image helpers, plus a manifest with source revision, API, normalized modes, and member checksums.

After the image has an immutable digest and release compatibility metadata has been generated, create the host package with:

```bash
bin/export-pi-release.mjs host \
  --version 0.2.0 \
  --output dist \
  --compatibility /path/to/compatibility.json \
  --asset-archive dist/pi-assets-0.2.0.tar.gz
```

The exporter validates that the host version/APIs, immutable image reference, and asset checksum match. The host package contains only package-relative launch/synchronization/provider files and compatibility metadata. It does not install, publish, or activate either archive. `SOURCE_DATE_EPOCH` may be set by release CI; otherwise the source commit time is used.

## Launch

Install the adapter before the ordinary Pi executable on `PATH`:

```bash
mkdir -p "$HOME/.local/bin"
ln -sf "$HOME/Projetos/pi-customizations/bin/pi-openshell" "$HOME/.local/bin/pi"
```

Then run `pi` in a project. The shared launcher snapshots the repository root and checked `.git`, executes Pi in the corresponding subdirectory, synchronizes current-project Pi sessions, downloads changes, and deletes the sandbox only after successful synchronization.

Do not edit the same host checkout or project sessions concurrently. Recovery from the original project/subdirectory preserves a retained sandbox without reuploading host files:

```bash
pi --recover SANDBOX
pi --recover-download SANDBOX
```

## Pi-owned state and credentials

`bin/pi-openshell-client` sanitizes host settings and transfers only current-project session JSONL files. It translates host/sandbox cwd and local parent-session paths. It never transfers `auth.json`, arbitrary settings paths, trust state, other projects' sessions, SSH keys, or the host home.

`bin/pi-openshell-provider` synchronizes host Codex OAuth into the gateway-owned `pi-codex` provider. `providers/pi-codex.yaml` restricts credential substitution to Pi/Node and matching OpenAI endpoints. The sandbox receives opaque handles only; `bin/pi-openshell-entrypoint` materializes those handles in ephemeral Pi state. Set `PI_OPENSHELL_PROVIDER=none` to disable provider synchronization.

Pi's writable profile remains `/home/pi/.pi/agent`; reviewed resources are baked under `/opt/pi-customizations`. General public HTTP/HTTPS and filesystem restrictions are defined by the Pi client policy in the shared repository. Port 22 and private/special-use destinations remain blocked.

## Rollback

The final pre-migration launcher/image is tagged `pre-openshell-migration-20260811` at commit `05d90d3`. To roll back, check out that tag in a separate directory, rebuild its Dockerfile, and point the installed `pi` symlink at that checkout's `bin/pi-openshell`. Do not delete retained sandboxes before recovering needed work.

See the shared repository's `docs/security-model.md`, `docs/gateway.md`, and `docs/adding-a-client.md` for common operations and extension rules.
