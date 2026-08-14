# Plan

## Objective

Isolate this repository as a generic Pi resource producer.

## Approach

1. Export only the reviewed generic Pi resource allowlist.
2. Remove environment-specific implementation, packaging, tests, workflows, and documentation.
3. Retain deterministic archive generation and generic release automation.
4. Verify tests and the absence of environment-specific references.

## Status

Complete: the exporter, release workflow, documentation, and tests are generic-only; environment-specific implementation and packaging have been removed. `npm test` passes and the required reference scan has no hits. Ready to commit; publishing `pi-assets-v0.2.0` is a separate release action.
