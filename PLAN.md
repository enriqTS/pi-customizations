# Plan

Objective: stop previously tracked `.pi` files from being versioned now that `.pi` is ignored.

Approach:
- Preserve the existing `.gitignore` rule.
- Remove `.pi` from Git’s index without deleting local files.
- Review the diff and commit the focused cleanup.

Status: complete; `.pi` remains locally present but is no longer tracked.
