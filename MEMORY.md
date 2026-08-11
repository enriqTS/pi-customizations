# Memory

- OpenShell isolation is snapshot-based: `bin/pi-openshell` uploads the host repository to `/workspace/<basename>`, runs Pi there, then downloads changes on exit.
- The sandbox is not a live bind mount. Host VS Code can inspect the checkout before/after Pi, but must not edit it concurrently because download may overwrite host changes.
- The image contains the reviewed customizations at `/opt/pi-customizations`; it has no SSH server, code-server, or VS Code integration.
- The image installs Debian `fd-find`; Pi recognizes its `fdfind` executable and will not attempt a network download at startup.
- The Debian Node image is intentionally retained as a small general-purpose base and adds Python/uv, Rust/Cargo, and native-build prerequisites. Tool caches use `/tmp` because the OpenShell filesystem policy does not allow writes to the general home directory.
- `openshell-policy.yaml` deliberately has no network allowlist: sandboxes have outbound internet access while filesystem isolation remains enforced. Do not upload secrets in a workspace.
- The current filesystem policy grants the sandbox workdir plus selected read-only system/customization paths, not arbitrary host files.
