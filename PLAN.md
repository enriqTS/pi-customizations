# Plan

Objective: add the OpenSSH client to the sandbox without permitting outbound SSH.

Approach:
- Install Debian's `openssh-client` package in the image.
- Keep the network policy restricted to HTTP/HTTPS ports 80 and 443.
- Build the image, verify the client, run tests, and commit.

Status: complete; the image builds with OpenSSH client 10.0p2, port 22 remains absent from policy, and all tests pass.
