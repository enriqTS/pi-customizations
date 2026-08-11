# Pi customizations

Personal, version-controlled Pi configuration and Pi-owned OpenShell integration.

## Layout

- `extensions/` — TypeScript extensions, including the Terraform apply guard
- `agents/` — subagent definitions
- `prompts/` — reusable prompts
- `skills/` and `themes/` — Pi resources
- `APPEND_SYSTEM.md` — appended Pi system guidance
- `bin/pi-openshell*` — thin adapter, Pi state synchronization, provider, and entrypoint
- `providers/pi-codex.yaml` — Pi-specific OpenShell credential routing

Keep credentials in `~/.pi/agent/auth.json`; never commit them here. Run `/reload` after changing linked Pi resources. Agent definitions are discovered for each `subagent` call.

## OpenShell

Shared OpenShell infrastructure has moved to [`openshell-environments`](https://github.com/enriqTS/openshell-environments). This repository pins version 0.1.0 and retains only Pi-owned behavior.

See [`OpenShell.md`](OpenShell.md) for dependency installation, explicit image builds, launch/recovery, credentials, and rollback. The launcher transfers only sanitized preferences and current-project sessions; it does not upload the host Pi profile or raw credentials.

## Tests

```bash
npm test
```
