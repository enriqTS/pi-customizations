# Memory

- OpenShell isolation is snapshot-based: `bin/pi-openshell` uploads the host repository to `/workspace/<basename>`, runs Pi there, then downloads changes on exit.
- The sandbox is not a live bind mount. Host VS Code can inspect the checkout before/after Pi, but must not edit it concurrently because download may overwrite host changes.
- The image contains the reviewed customizations at `/opt/pi-customizations`; it has no SSH server, code-server, or VS Code integration.
- The image installs Debian `fd-find`; Pi recognizes its `fdfind` executable and will not attempt a network download at startup.
- The Debian Node image is intentionally retained as a small general-purpose base and adds Python, Rust/Cargo/rustfmt, the latest Terraform release, and native-build prerequisites. Ruff and uv are copied from their official Astral container images because they are unavailable from the configured Debian repositories. Tool caches use `/tmp` because the OpenShell filesystem policy does not allow writes to the general home directory. Pin tool images when a project requires reproducible versioning.
- The baked `terraform-guard` extension blocks Pi Bash-tool invocations of `terraform apply`; formatting, validation, and planning remain allowed. It is a guardrail, not a defense against deliberate shell-bypass techniques.
- OpenShell 0.0.102 treats an omitted `network_policies` block as no outbound authorization, not unrestricted internet: its proxy returns HTTP 403 for tunnels and Node surfaces this as `fetch failed`.
- General sandbox egress is intentionally enabled for HTTP/HTTPS only with a hostless endpoint, explicit public IPv4/global-unicast IPv6 CIDRs, ports 80/443, and binary glob `/**`. OpenShell 0.0.102 rejects top-level host wildcards and has no concise all-ports syntax. Codex credential routing remains narrowly scoped by `providers/pi-codex.yaml`. Do not upload secrets in a workspace.
- A sandbox launched from this repository snapshots both the working tree and `.git`; on exit it can overwrite host edits and commits made while that sandbox was active. Finish/close active wrappers before editing this repository, and verify `git status`/`git log` afterward.
- The current filesystem policy grants the sandbox workdir plus selected read-only system/customization paths, not arbitrary host files.
