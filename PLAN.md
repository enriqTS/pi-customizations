# Plan

Objective: make host Pi sessions for the current project resumable inside its OpenShell sandbox.

Approach:
- Map the host and sandbox project-specific session directories without exposing the rest of `~/.pi`.
- Stage relevant sessions into the sandbox and synchronize updated/new sessions back safely on exit.
- Add tests for path mapping and transfer behavior, document the privacy/concurrency constraints, and commit.

Status: complete; a full sandbox round trip resumed the staged project scope and merged both the existing fixture and a new sandbox session back with host cwd headers.
