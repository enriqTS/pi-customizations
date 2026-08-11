# Plan

Objective: provide Rust >=1.88 with Rustfmt and Clippy in the sandbox image.

Approach:
- Source the current official Rust toolchain instead of Debian's older Rust packages.
- Keep Cargo caches writable under `/tmp` while using the baked read-only toolchain.
- Build the image, verify Rust/Cargo/Rustfmt/Clippy versions, run tests, and commit.

Status: complete; the image builds with Rust/Cargo 1.97.1, Rustfmt 1.9.0, and Clippy 0.1.97, and all repository tests pass.
