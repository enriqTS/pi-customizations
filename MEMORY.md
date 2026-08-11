# Memory

- OpenShell isolation is snapshot-based: `bin/pi-openshell` uploads the host repository to `/workspace/<basename>`, runs Pi there, then downloads changes on exit.
- The sandbox is not a live bind mount. Host VS Code can inspect the checkout before/after Pi, but must not edit it concurrently because download may overwrite host changes.
- The image contains the reviewed customizations at `/opt/pi-customizations`; it has no SSH server, code-server, or VS Code integration.
- The current filesystem policy grants the sandbox workdir plus selected read-only system/customization paths, not arbitrary host files.
