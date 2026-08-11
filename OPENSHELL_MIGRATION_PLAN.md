# OpenShell Repository Migration Plan

## Goal

Extract reusable OpenShell infrastructure from `pi-customizations` into a dedicated repository before adding VS Code, Codex CLI, Claude Code, or other clients. Keep each client independently permissioned and keep Pi customizations usable without copying unrelated client configuration.

Implemented repository: `openshell-environments`.

## Completion status

Completed in the 0.1.0/API 1 extraction. Shared toolchain, policy, workspace/Git lifecycle, tests, security/gateway docs, and explicit versioned image lifecycle now live in the dedicated repository. This repository retains Pi resources, settings/session synchronization, Codex compatibility/provider behavior, entrypoint, and a thin pinned adapter. The pre-migration rollback point is tag `pre-openshell-migration-20260811` at commit `05d90d3`.

## Desired ownership boundary

### Move to `openshell-environments`

- Gateway setup and operational documentation.
- Shared base image and development toolchain installation.
- Generic workspace upload/download and Git metadata safeguards.
- Shared filesystem and general HTTP/HTTPS policy fragments.
- Generic provider synchronization utilities.
- Common image, policy, and wrapper tests.
- Client launch framework and lifecycle conventions.

### Keep in `pi-customizations`

- Pi agents, prompts, skills, themes, and extensions.
- `APPEND_SYSTEM.md`.
- Pi settings sanitizer.
- Pi project-session translation and synchronization.
- Pi Codex OAuth compatibility patch and Pi-specific provider profile.
- Pi-specific entrypoint and a thin launcher/integration layer.

### Keep client-specific in the new repository

Each client must retain separate configuration for:

- Image layer and entrypoint.
- Credential provider/profile.
- Network policy additions.
- Filesystem permissions.
- Config and session synchronization.
- Tests and security assumptions.

Do not create a single policy that grants every client the union of all permissions.

## Proposed new repository layout

```text
openshell-environments/
├── base/
│   ├── Dockerfile
│   └── toolchains/
├── bin/
│   ├── openshell-workspace
│   ├── openshell-git-check
│   └── shared lifecycle helpers
├── clients/
│   ├── pi/
│   ├── codex/
│   ├── claude-code/
│   └── vscode/
├── policies/
│   ├── base.yaml
│   └── clients/
├── providers/
│   └── client-specific profiles
├── docs/
│   ├── gateway.md
│   ├── security-model.md
│   └── adding-a-client.md
├── tests/
├── MEMORY.md
├── PLAN.md
└── README.md
```

The initial migration only needs the shared base plus the Pi client. Empty placeholders for future clients are unnecessary.

## Migration phases

### Phase 1: Inventory and classify

1. Record every current file as `shared`, `Pi-specific`, or `repository-only`.
2. Document dependencies between the wrapper, image, policy, provider, entrypoint, settings sanitizer, session synchronizer, and tests.
3. Capture the current baseline:
   - All repository tests pass.
   - Image builds.
   - Codex model request succeeds.
   - Public HTTP/HTTPS requests succeed.
   - Port 22 remains blocked.
   - Rust, Clippy, Rustfmt, Terraform, uv, Ruff, and SSH client are available.
   - Pi sessions complete a host/sandbox round trip.
4. Tag or record the last pre-migration commit for rollback.

### Phase 2: Create the shared repository

1. Initialize `openshell-environments` with `MEMORY.md`, `PLAN.md`, security documentation, and tests.
2. Move the base Docker/toolchain logic first without changing behavior.
3. Move generic workspace and Git synchronization helpers.
4. Move shared policy content, preserving the existing default-deny behavior outside explicitly allowed public HTTP/HTTPS traffic.
5. Keep all source images/version choices explicit and document which ones intentionally track `latest`.
6. Run the baseline against the new repository before changing `pi-customizations`.

### Phase 3: Establish the Pi client integration

1. Add a Pi client directory in `openshell-environments` that consumes Pi-owned assets from an explicit source.
2. Keep these assets owned by `pi-customizations`:
   - Pi resource directories.
   - Settings sanitizer.
   - Session synchronizer.
   - Codex patch and provider profile.
3. Replace the current large `pi-openshell` wrapper with a thin adapter that calls the versioned shared launcher.
4. Ensure the adapter resolves both repositories safely and fails with a clear message when the shared dependency is missing or incompatible.
5. Preserve existing environment overrides where practical.

### Phase 4: Choose dependency delivery

Prefer one of these versioned approaches:

1. **Published OCI images plus a small versioned launcher package** — preferred when the setup stabilizes.
2. **Pinned Git submodule** — straightforward for local development, but requires explicit submodule update workflow.
3. **Pinned Git dependency installed by a bootstrap script** — avoids nesting repositories but needs integrity/version checks.

Avoid relying on an unversioned sibling checkout such as `../openshell-environments`. If a local checkout override is useful, make it explicit through an environment variable and retain a pinned default.

Record compatibility in both repositories, for example:

```text
pi-customizations release X requires openshell-environments release Y
```

### Post-migration image lifecycle decision

After the ownership migration, stop passing a source directory to
`openshell sandbox create --from` on every client launch. The dedicated
repository must build a deliberately tagged OCI image through an explicit
build command, and launchers must consume a full image reference. Do not
implicitly rebuild the image whenever Pi starts.

- Rebuild only when the shared base, client image layer, baked client assets,
  entrypoint, or pinned tool versions change.
- Prefer immutable version tags or digests for normal use, with an explicit
  local development tag as an override.
- Record the source revision and client compatibility version as image labels.
- Fail with a clear build/pull instruction when the selected image is absent;
  do not silently fall back to an unrelated community image.
- Provide artifact inspection and cleanup commands so old local images and
  build cache can be managed intentionally.
- Docker Compose may orchestrate the gateway and offer a build command, but it
  must not run a redundant long-lived Pi container; OpenShell owns sandbox
  container creation.

### Phase 5: Cut over safely

1. Run old and new launch paths against disposable test projects.
2. Compare effective filesystem and network policies.
3. Verify no credentials, unrelated sessions, host SSH configuration, or ignored files are uploaded.
4. Verify forced termination retains recoverable sandbox state and does not overwrite newer host work.
5. Switch the installed `pi` symlink only after the new path passes the full baseline.
6. Keep the old launcher available for one release or migration window.
7. Remove duplicated shared code only after the new launcher is proven.

### Phase 6: Add future clients

For each new client:

1. Start from the shared base rather than the Pi image.
2. Define a dedicated threat model and minimum permissions.
3. Add only required provider credentials and endpoints.
4. Keep client state/session synchronization isolated from other clients.
5. Add image, policy, credential-isolation, lifecycle, and negative-permission tests.
6. Do not weaken shared defaults to make one client easier to configure.

## Required test matrix

| Area | Required checks |
|---|---|
| Image | Build succeeds; expected tools and versions are present |
| Filesystem | Workspace writes succeed; unauthorized host/home paths remain unavailable |
| Network | HTTP/HTTPS succeeds; undeclared ports and private/special-use addresses remain blocked |
| Credentials | Handles are substituted only for matching client binaries and endpoints |
| Workspace | Tracked edits, deletions, ignored files, and `.git` history synchronize correctly |
| Sessions | Only current-project sessions transfer; cwd paths translate both ways |
| Failure handling | Failed upload/download retains the sandbox and reports recovery instructions |
| Concurrency | Active stale sandboxes cannot silently replace newer host commits without a documented warning/guard |
| Client isolation | One client cannot read another client's credentials or state |

## Risks and mitigations

- **Behavior drift during extraction:** move code without refactoring first; refactor only after parity tests pass.
- **Over-broad shared policy:** keep policies composable and client-specific rather than merging permissions.
- **Repository version skew:** pin releases/commits and add a compatibility check in the launcher.
- **Snapshot rollback:** retain explicit warnings and consider adding host baseline/version checks before download.
- **Session or credential leakage:** transfer only explicitly selected files and validate headers/paths.
- **Larger maintenance surface:** centralize only genuinely shared code; avoid premature abstractions for hypothetical clients.
- **Moving-image changes:** use digests or fixed tags where reproducibility matters; never make per-launch rebuilding the freshness mechanism.

## Rollback plan

1. Keep the final pre-migration commit/tag in `pi-customizations`.
2. Do not delete the current wrapper until the new integration passes all acceptance criteria.
3. Keep installation instructions for restoring the old `pi` symlink.
4. If cutover fails, restore the old launcher and image while preserving sandbox/workspace recovery data.
5. Reattempt extraction in smaller, behavior-preserving commits.

## Completion criteria

The migration is complete when:

- `pi-customizations` contains only Pi-owned behavior and a thin shared integration.
- `openshell-environments` can build and test the base plus Pi client independently.
- The current Pi security and functional baseline passes unchanged.
- Dependency versions and upgrade procedures are documented.
- A new client can be added without modifying Pi-specific code or granting Pi additional permissions.
- Rollback to the pre-migration Pi launcher remains documented and tested.

## Recommended first future action

Create `openshell-environments`, copy (do not immediately delete) the current shared Docker, policy, workspace, and Git lifecycle code, and establish parity tests. Perform deletion and cleanup in `pi-customizations` only after the copied implementation passes the complete baseline.
