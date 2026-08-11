# Plan

Objective: ensure Pi's Docker image provides `fd` locally, avoiding startup downloads.

Approach:
- Install Debian's `fd-find` package; Pi recognizes its `fdfind` executable.
- Review the focused diff and commit it.

Status: complete; the Dockerfile change was reviewed and is ready to rebuild.
