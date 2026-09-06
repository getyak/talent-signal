# 0013: Bundle formal prompts with application code

- Status: accepted
- Date: 2026-09-06

## Decision

Formal Agent prompts are repository-owned source files, packaged and loaded
locally with the application. Opik mirrors versions and supports experiments;
it is not a runtime configuration dependency. Importing a selected experiment
creates a source change that follows the normal build and deployment lifecycle.

## Rationale

The owner prioritizes simple startup, predictable behavior and code/prompt
compatibility over changing a running service without deployment. Tool contracts
and the instructions that use them can evolve and roll back together. A local
immutable snapshot avoids remote loading, cache invalidation and version drift.

The alternative of an Opik-owned live prompt with cache and background refresh
supports faster independent publication, but adds a second release mechanism.
Fetching only during startup still couples startup to registry availability.
Neither is needed for the current owner-operated product.

Opik's official TypeScript guidance recommends keeping prompts versioned beside
code. The choice to mirror explicitly outside startup is this project's design,
not a claim that Opik mandates a single architecture.

## Consequences and reconsideration

Prompt edits require an application release. Opik edits and environment labels
cannot change installed behavior. Existing task snapshots remain historical
execution evidence. No additional permission or inference boundary is created.

Reconsider runtime publication if independent prompt releases become a measured
product need and their operational cost is justified. Keep one authoritative
source and explicit version compatibility in either design.

See [prompt operations](../operations/opik-prompts.md) and the
[official source record](../../_index/sources/2026-09-06-opik-prompt-library.md).
