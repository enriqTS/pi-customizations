# Run pi in OpenShell

This repository is the build context for a pi image containing the versioned
customizations. The customization repository is copied into the image; it is
**not mounted into the sandbox at runtime**.

## Prerequisites

- Docker (to build the image)
- OpenShell CLI
- An OpenShell gateway
- A provider configured for either inference routing or sandbox credentials

## Build the image

Run this from the parent directory so the image receives this repository as
its build context:

```bash
cd ~/Projetos
docker buildx build \
  --pull \
  --load \
  -t pi-customized \
  -f pi-customizations/Dockerfile.openshell \
  pi-customizations
```

`buildx` uses Docker's current BuildKit builder and avoids the legacy-builder
warning. `--pull` checks for a newer base image, while `--load` imports the
result into the local Docker image store for OpenShell to use.

Rebuild after changing this repository and periodically for base-image security
updates. The image contains:

- extensions, skills, prompts, and themes from this repository
- `APPEND_SYSTEM.md`
- subagent definitions from `agents/`

It intentionally does not contain `~/.pi/agent/auth.json`, host sessions, SSH
keys, or any other host files.

## Select a gateway

Every OpenShell sandbox needs an active gateway:

```bash
openshell gateway add <gateway-url> --name local
openshell gateway select local
```

If a gateway has already been configured, only the `select` command is needed.

## Start pi

Create a sandbox from the image:

```bash
openshell sandbox create \
  --name pi-sandbox \
  --from pi-customized \
  -- pi
```

The command above runs the complete pi process inside OpenShell. Use a new
terminal for file transfer when the selected gateway is remote or when the
workspace is not directly mounted by the gateway.

Upload only the current project:

```bash
openshell sandbox upload pi-sandbox "$PWD" /workspace
```

After the work is complete, download the resulting project:

```bash
openshell sandbox download pi-sandbox /workspace ./workspace-from-sandbox
```

For a remote gateway, `/workspace` is sandbox-local. Changes will not appear
in the host checkout until they are downloaded. Do not upload `~`,
`~/.pi/agent`, SSH credentials, or parent directories.

## Credentials and inference routing

Prefer OpenShell inference routing so raw API keys remain outside the
sandbox. Configure pi to use the OpenShell-compatible endpoint supplied by
your gateway (for example `https://inference.local`) according to the gateway
configuration.

If inference routing is unavailable, pass only the required provider key to
the sandbox using the gateway's secret/credential mechanism. Never copy
`~/.pi/agent/auth.json` into the image or upload it to the sandbox.

## Build warnings

The `node-domexception` deprecation warning comes from a transitive dependency
of the pi package (or one of its dependencies), not from the Debian base image.
The npm version notice is also informational. The Dockerfile deliberately uses
an explicit current Node major and Debian stable release; rebuild with `--pull`
to receive updated security patches.

## Isolation checklist

- Build from a reviewed Git revision of this repository.
- Use an image containing only the tools and customizations required.
- Upload or mount only the current workspace at `/workspace`.
- Configure OpenShell filesystem policy to allow writes only under `/workspace`.
- Restrict network access to model inference and required package registries.
- Do not mount host home directories, `~/.pi/agent`, or SSH credentials.
- Review the downloaded diff before copying it back over the original checkout.

The container still needs its own system files and the baked-in customization
files. “Only the workspace” here means no access to the host filesystem beyond
the explicitly transferred workspace.
