# GET-11: Opik phase-one improvement loop

## Outcome and boundary

Implement the connected correction → frozen case → paired evaluation → bounded
candidate generation → independent verification → delegated release/readback →
observation loop described by [GET-11](https://linear.app/getyak/issue/GET-11).
Local execution remains authoritative when the optional Opik projection fails.
Prompts continue to ship with code; an Opik label never changes running code.

The issue permits private complete-content evaluation and Codex release review
within the owner's delegated scope. This does not grant candidate generators or
judges business-action authority, access to independent holdouts, credentials, or
release signing authority. No per-case privacy gate is added. Credentials stay
out of evaluation content. Monetary limits and environment/exposure scope are
still missing in GET-12; paid execution and actual deployment depend on those
parameters, while implementation and deterministic proof proceed.

## Current evidence

- GET-11 and all ten children were read in the authenticated Linear UI on
  2026-09-07. Scope: GET-13 local-first export; GET-14 private runtime observation;
  GET-15 correction cases; GET-16 paired comparisons and splits; GET-17 budget;
  GET-18 candidate worker; GET-19 independent CI; GET-20 release/readback;
  GET-21 post-release learning; GET-12 execution parameters.
- Isolated worktree: `/Users/cubxxw/data/talent-signal-get11`, branch
  `codex/get-11-opik-phase-one`, base `9041aaa3`. Concurrent GET-8 changes in the
  original worktree are outside this task's ownership.
- Existing private Opik at `http://localhost:5173/api` responds with version
  `2.2.45`. Existing containers and volumes are reused, not redeployed.
- Node dependencies installed with the frozen lockfile. Opik SDK is pinned to
  `2.2.45`; repository minimum Node version is `22.19.0`.
- GET-13 failure is confirmed in code: remote dataset preflight precedes local
  evaluation; transport conflates failures with a missing dataset.
- Existing GET-5 feedback and Lab reruns will be extended, not replaced.
- Projection recovery and deletion were exercised against the existing private
  instance with synthetic data and zero model calls. The backend's pre-existing
  unhealthy state was repaired by restarting only that process, preserving volumes.
- Native correction entry, authenticated feedback/Lab integration, source
  invalidation, SQLite budget and shared production candidate configuration are
  implemented. Simulator and isolated PostgreSQL tests cover their state transitions.
- Independent review found deletion/late-write races, crash remnants, a cross-device
  feedback retry deadlock, and private-example source distribution. Owners are
  repairing and retesting each finding; the dated review is the status authority.

## Ownership

One shared isolated worktree has non-overlapping owners. Root owns integration,
CLI coordination, dependency/CI edits, docs, real-surface verification and final
synthesis. Workers own projection recovery, feedback/Lab, SQLite budget ledger,
optimizer/product adapter, paired/independent release contracts, and observation
outbox/runtime integration respectively. Independent review follows integration.

## Milestones

1. **Complete:** retrieve scope, preserve concurrent work, identify instance and
   missing execution parameters.
2. **Active:** implement each bounded slice with real entry-point tests and
   durable failure/retry/deletion evidence; integrate shared contracts.
3. **Active:** task-level CLI is connected; complete semantic/release controllers,
   source-lifecycle bridge, credential-free CI and private runtime-content readback.
4. **Active:** independent correctness and safety reviews, repair P0/P1 issues,
   run focused regression/type/build/documentation checks.
5. **Pending:** funded real optimization and scoped release/rollback once GET-12
   parameters arrive; report any unavailable external proof honestly.

## Completion evidence

Require immutable local results during Opik outages, export-only replay without
new model calls, complete source/attempt/version lineage, atomic concurrent
budget reservations, unknown billed outcomes retained, frozen and independent
validation, critical-regression vetoes, stale-decision rejection, loaded-version
readback for release/rollback, and feedback deletion winning late results.
Synthetic provider checks prove plumbing; they do not prove paid-model semantic
quality or a production release. Record reviewed evidence under
`docs/evaluations/2026-09-07-get-11-opik/` and run `pnpm docs:check`.
