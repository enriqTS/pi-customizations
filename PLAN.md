# Plan

Objective: add Rust formatting, Python linting, and Terraform validation/formatting support while preventing Pi from running Terraform applies.

Approach:
- Install Debian `rustfmt` and `ruff`; copy a pinned official Terraform binary into the image.
- Add a baked Pi extension that blocks Bash tool commands invoking `terraform apply`, plus a system instruction.
- Add focused unit coverage for the command detector, update documentation and durable notes, review, test, and commit.

Status: complete; command-detector coverage and the repository test suite pass, and the focused changes were reviewed.
