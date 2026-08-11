# Pi customizations

Personal, version-controlled Pi configuration source.

## Layout

- `extensions/` — TypeScript extensions
- `agents/` — subagent definitions (linked directly into Pi; Pi packages do not discover these)
- `prompts/` — prompt templates
- `skills/` — Agent Skills
- `themes/` — themes

## Active links

The setup links the subagent extension, agent definitions, and workflow prompts into `~/.pi/agent/`.

- Edit files here, then run `/reload` in Pi for extensions, prompts, and other resources.
- Agent definitions are discovered anew for every `subagent` call.
- Keep credentials in `~/.pi/agent/auth.json`; never commit them here.

## OpenShell

`Dockerfile.openshell` builds an image with these customizations baked in, and
[`OPEN SHELL.md`](OPEN%20SHELL.md) documents running it in OpenShell without
mounting this repository or the host pi profile into the sandbox.

## Subagents

The included `subagent` extension originates from Pi's bundled example. `scout` uses `openai-codex/gpt-5.6-luna` for repository investigation. Its model and permitted tools are defined in `agents/scout.md`.

The child Pi processes use your normal Pi authentication and model configuration. Configure a model in each agent's YAML frontmatter before invoking it.
