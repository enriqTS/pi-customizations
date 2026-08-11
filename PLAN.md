# Plan

Objective: fix the Docker build failure caused by unavailable Debian `ruff` and `uv` packages.

Approach:
- Source uv and Ruff from their official container images instead of APT.
- Build the image, review the focused diff, and commit it.

Status: complete; the image builds successfully and uv, uvx, and Ruff execute in the final image.
