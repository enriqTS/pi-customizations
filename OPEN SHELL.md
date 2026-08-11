# Run pi in OpenShell

This repository is the build context for a pi image containing the versioned
customizations. The customization repository is copied into the image; it is
**not mounted into the sandbox at runtime**.

## Prerequisites

- Docker (to build the image)
- OpenShell CLI
- `git` and `rsync` on the host for repository transfer
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
```

For **fish**, add the directory to your path with:

```fish
fish_add_path "$HOME/.local/bin"
```

For **bash** or **zsh**, add this to your shell profile (`~/.bashrc`,
`~/.zshrc`, etc.):

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Open a new shell if necessary, then confirm the wrapper is selected:

```bash
command -v pi
```

From any project directory, simply run:

```bash
cd /path/to/project
pi
```

The wrapper builds the image from this repository, creates a uniquely named
sandbox, and uploads the project or repository root under
`/workspace/<directory-name>`. Pi starts in the corresponding directory (also
when invoked from a repository subdirectory). When Pi exits, the wrapper
downloads that directory back over the original workspace and deletes the
sandbox. The customization repository and host home directory are never
uploaded as workspace data.

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

Upload only the current project. OpenShell preserves the source directory
basename below the destination:

```bash
project_name="$(basename "$PWD")"
openshell sandbox upload pi-sandbox "$PWD" /workspace
```

After the work is complete, download the resulting project:

```bash
openshell sandbox download \
  pi-sandbox "/workspace/$project_name" ./workspace-from-sandbox
```

For a remote gateway, `/workspace` is sandbox-local. Changes will not appear
in the host checkout until they are downloaded. Do not upload `~`,
`~/.pi/agent`, SSH credentials, or parent directories.

## Local Git history

The wrapper preserves Git history without disabling ignore filtering for the
working tree:

1. It resolves the repository root even when Pi is launched from a subdirectory.
2. It creates an idle sandbox and uploads the working tree with normal
   `.gitignore` filtering.
3. It separately uploads only the ordinary repository-root `.git/` directory
   with `--no-git-ignore`.
4. It runs Pi with `sandbox exec` from the corresponding repository
   subdirectory.
5. On exit, it downloads to a staging directory, overlays changed files,
   removes tracked files deleted in the sandbox, synchronizes `.git/` exactly,
   and only then deletes the sandbox. Host ignored files remain untouched.

This supports `git status`, branches, local commits, tags, and reflogs. The
host's resolved `user.name` and `user.email` are passed as non-secret author
and committer environment variables, but global Git configuration, signing
keys, SSH keys, and credential helpers are not transferred.

Before uploading metadata, `bin/pi-openshell-git-check` rejects linked
worktrees, external object alternates, symlinks within `.git`, local credential
helpers, auth headers, proxy/SSH commands, includes, URL rewrites, executable
remote helpers, and credential-bearing remote URLs. Plain remote URLs remain
in Git metadata, but the sandbox policy permits only the required OpenAI
endpoints, so Git remotes cannot be contacted.

Linked worktrees and repositories whose Git directory is outside the
repository root are intentionally unsupported. Avoid editing the host checkout
while the sandbox is active because transfer is snapshot-based, not a live
mount. If download fails, the wrapper leaves the sandbox intact for recovery.

## Safe Pi configuration sharing

OpenShell sets `HOME=/workspace` for `sandbox exec`, regardless of the image's
`HOME`. Without an override, Pi consequently searches `/workspace/.pi/agent`
instead of the resources baked into `/home/pi/.pi/agent`. Pi's supported agent
directory override is `PI_CODING_AGENT_DIR` (not `PI_AGENT_DIR`). The wrapper
therefore executes with both `HOME=/home/pi` and
`PI_CODING_AGENT_DIR=/home/pi/.pi/agent`; the filesystem policy grants access
to that Pi profile directory and read-only access to the baked customization
tree, but not to the rest of the home directory.

Before creating the sandbox, `bin/pi-openshell-settings.mjs` builds a temporary
`settings.json` using an explicit allowlist of non-executable UI, model,
compaction, retry, terminal, and display preferences. Resource paths are always
replaced with the reviewed extensions, prompts, skills, and themes baked from
this repository under `/opt/pi-customizations`. The wrapper uploads this one
sanitized file separately from the project and `.git` transfers via `/tmp`; the
entrypoint installs it into the stable agent directory before creating any
credentials, then removes the staging file. Agents and `APPEND_SYSTEM.md` are
already baked directly into the stable agent directory.

The sanitizer deliberately excludes arbitrary resource/package paths, project
trust, proxies, session paths, shell/editor/npm commands, tracking identifiers,
unknown future settings, and provider configuration. It never transfers:

- `auth.json` or raw OAuth/API credentials
- `models.json` or other provider configuration
- sessions, conversation history, trust state, logs, caches, or temporary files
- SSH/GPG keys, credential helpers, shell profiles, or host home directories
- settings values that embed secrets, execute commands, or reference host paths

The entrypoint writes only OpenShell's injected opaque Codex handles to an
ephemeral `auth.json` under `PI_CODING_AGENT_DIR`. The wrapper also forwards a
host `COLORTERM` value only when it is the standard `truecolor` or `24bit`
capability; otherwise OpenShell's PTY makes Pi fall back to coarse 256-color
theme approximations. Terminal-specific image protocol variables remain
isolated. This preserves the existing `pi-codex` provider flow, binary policy,
startup ordering, and Git synchronization without exposing the host Pi profile.

## Credentials and inference routing

Prefer OpenShell inference routing for supported API-key providers so raw API
keys remain outside the sandbox. Configure Pi to use `https://inference.local`
through a corresponding OpenAI- or Anthropic-compatible custom model.

OpenShell 0.0.102 does **not** support the `codex` provider type for cluster
inference; `openshell inference set --provider codex ...` accepts only OpenAI,
Anthropic, NVIDIA, DeepInfra, Vertex AI, and Bedrock provider types. ChatGPT
subscription OAuth therefore uses a sandbox-attached provider instead. Never
copy the host `~/.pi/agent/auth.json` into the image or upload it.

### Codex OAuth provider

`bin/pi-openshell` synchronizes Pi's `openai-codex` OAuth credential with an
OpenShell provider named `pi-codex`. The repository's custom
`providers/pi-codex.yaml` profile extends the built-in Codex endpoint set with
Pi's `node` and `pi` binary paths. OpenShell requires both the destination and
the requesting binary to match policy; the built-in profile permits only the
Codex CLI and therefore rejects Pi with HTTP 403.

Credential values are passed to the OpenShell CLI through environment lookup,
not command-line arguments. OpenShell injects opaque credential handles—not
the raw OAuth tokens—into the sandbox. The gateway proxy substitutes the real
values only on matching outbound requests. The image applies a narrow Pi Codex
adapter because Pi normally expects a decodable JWT: it uses OpenShell's opaque
account-ID handle and prevents Pi from trying to refresh an opaque token. The
host auth file is never uploaded or mounted.

The explicit sandbox policy repeats the OpenAI endpoints and, critically, the
`node` and `pi` binary paths. OpenShell requires the requesting executable as
well as the destination to match. It can also take about one second after
startup to resolve those binary identities, so the entrypoint waits before
starting Pi.

Log in on the host first, then run the wrapper normally:

```bash
pi
```

The wrapper imports the custom profile when absent, creates or updates the
workspace-scoped provider, and attaches it with `--provider pi-codex`. It
extracts the Codex account ID from the OAuth JWT. If the profile definition is
changed later, delete the custom profile and provider before the next run so
the wrapper can import the new version; OpenShell profile updates require the
current gateway resource version.

To use a different provider name, set both variables:

```bash
export PI_OPENSHELL_CODEX_PROVIDER=my-codex
export PI_OPENSHELL_PROVIDER=my-codex
```

Set `PI_OPENSHELL_PROVIDER=none` to disable automatic synchronization and
attachment. `PI_CREDENTIALS_PATH` can point to a different Pi auth file. Do
not set `CODEX_AUTH_*` manually in the sandbox, and do not use `--env` for
these credentials. Rebuild the image after changing this entrypoint. The
provider still grants the sandbox network access to
OpenAI endpoints, so keep the gateway policy restricted and use a trusted
local gateway.

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
