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
  -f pi-customizations/Dockerfile \
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

## Start a local gateway

The Python-installed CLI does not include the gateway daemon. The `local`
registration only tells the CLI where to connect; it does not start a server.
For a local Docker driver, run the official gateway container:

```bash
H="$HOME"
mkdir -p \
  "$H/openshell/supervisor" \
  "$H/.local/state/openshell" \
  "$H/.local/share/openshell" \
  "$H/.config/openshell"

docker create --name tmp-supervisor \
  ghcr.io/nvidia/openshell/supervisor:latest

docker cp tmp-supervisor:/openshell-sandbox \
  "$H/openshell/supervisor/openshell-sandbox"
docker rm tmp-supervisor
chmod +x "$H/openshell/supervisor/openshell-sandbox"

# Generate the gateway mTLS certificates and sandbox JWT signing keys.
docker run --rm \
  -e HOME="$H" \
  -v "$H/.local/state/openshell:$H/.local/state/openshell" \
  -v "$H/.config/openshell:$H/.config/openshell" \
  ghcr.io/nvidia/openshell/gateway:latest \
  generate-certs \
  --output-dir "$H/.local/state/openshell/tls" \
  --server-san host.openshell.internal

docker run -d \
  --name openshell-gateway \
  --restart unless-stopped \
  --group-add "$(stat -c '%g' /var/run/docker.sock)" \
  -p 0.0.0.0:8080:8080 \
  -v "$H/.local/state/openshell:$H/.local/state/openshell" \
  -v "$H/.local/share/openshell:$H/.local/share/openshell" \
  -v "$H/.config/openshell:$H/.config/openshell" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$H/openshell/supervisor/openshell-sandbox:$H/openshell/supervisor/openshell-sandbox:ro" \
  -e HOME="$H" \
  -e OPENSHELL_DRIVERS=docker \
  -e OPENSHELL_GRPC_ENDPOINT=https://host.openshell.internal:8080 \
  -e OPENSHELL_DOCKER_SUPERVISOR_BIN="$H/openshell/supervisor/openshell-sandbox" \
  -e OPENSHELL_DB_URL=sqlite:"$H/.local/state/openshell/openshell.db" \
  -e OPENSHELL_LOCAL_TLS_DIR="$H/.local/state/openshell/tls" \
  -e OPENSHELL_TLS_CERT="$H/.local/state/openshell/tls/server/tls.crt" \
  -e OPENSHELL_TLS_KEY="$H/.local/state/openshell/tls/server/tls.key" \
  -e OPENSHELL_TLS_CLIENT_CA="$H/.local/state/openshell/tls/ca.crt" \
  -e OPENSHELL_ENABLE_MTLS_AUTH=true \
  -e OPENSHELL_DOCKER_TLS_CA="$H/.local/state/openshell/tls/ca.crt" \
  -e OPENSHELL_DOCKER_TLS_CERT="$H/.local/state/openshell/tls/client/tls.crt" \
  -e OPENSHELL_DOCKER_TLS_KEY="$H/.local/state/openshell/tls/client/tls.key" \
  ghcr.io/nvidia/openshell/gateway:latest
```

The gateway needs the Docker socket to create sandbox containers. The numeric
`--group-add` value is the socket's host group ID; using the name `docker` is
not portable because that group may not exist inside the gateway image. The
state and data directories are bind-mounted because the gateway runs as an
unprivileged user. The gateway JWT keys are required even when CLI access uses
mTLS: sandbox containers use gateway-minted JWTs to authenticate back to it.
The endpoint is published on the Docker bridge and uses mTLS. The Docker
sandbox network must reach the gateway callback, so do not bind this port only
to `127.0.0.1`. Restrict port 8080 with the host firewall if the machine is
reachable from an untrusted network.

Register and select the TLS gateway:

```bash
openshell gateway remove local 2>/dev/null || true
openshell gateway add https://127.0.0.1:8080 --local --name local
openshell gateway select local
openshell status
```

If `local` is already registered, use `openshell gateway remove local` before
running the `gateway add` command again, or simply select it after the gateway
is running.

Check gateway logs with:

```bash
docker logs -f openshell-gateway
```

## Make `pi` seamless

`bin/pi-openshell` is a host-side wrapper. Install it as `pi` in a directory
before the normal pi installation on your `PATH`:

```bash
mkdir -p "$HOME/.local/bin"
ln -sf "$HOME/Projetos/pi-customizations/bin/pi-openshell" \
  "$HOME/.local/bin/pi"
export PATH="$HOME/.local/bin:$PATH"
```

Add the `export PATH` line to your shell profile (`~/.bashrc`, `~/.zshrc`,
etc.) to make it permanent. Confirm the wrapper is selected:

```bash
command -v pi
```

From any project directory, simply run:

```bash
cd /path/to/project
pi
```

The wrapper builds the image from this repository, creates a uniquely named
sandbox, uploads only the current directory to `/workspace`, and starts pi.
When pi exits, it downloads `/workspace` back into the original directory and
deletes the sandbox. The customization repository and host home directory are
never uploaded.

Because the workspace is transferred rather than bind-mounted, changes made
inside the sandbox are copied back only when pi exits. Review the resulting
diff before trusting changes from untrusted work.

## Start pi manually

Create a sandbox from the image:

```bash
openshell sandbox create \
  --name pi-sandbox \
  --from "$HOME/Projetos/pi-customizations" \
  -- pi
```

When `--from` receives a directory, OpenShell builds its `Dockerfile` using
the local Docker daemon. This is preferable to using `pi-customized` as a
bare name, because bare names are resolved as community images and may be
pulled from the public registry.

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
