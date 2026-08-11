# Plan

Objective: make failed OpenShell workspace downloads recoverable and prevent ignored build artifacts from overwhelming transfers.

Approach:
- Prune Git-ignored files in the sandbox before workspace download, while preserving tracked and untracked non-ignored work.
- Add explicit wrapper recovery modes for re-entering or immediately re-downloading a retained sandbox.
- Document recovery commands and add lifecycle tests with a fake OpenShell CLI.

Status: complete. The wrapper now excludes ignored sandbox artifacts from downloads, supports `--recover` and `--recover-download`, documents both flows, and has integration coverage. Retained sandbox `pi-dothoard-313599` remains available for the user to recover from `/home/henrique/Projetos/dothoard`.
