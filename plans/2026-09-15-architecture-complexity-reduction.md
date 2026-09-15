# Architecture complexity reduction

## Outcome

Reduce the structural risk identified in the iOS, backend, and Agent code without changing product behavior or weakening evidence, authorization, provenance, and runtime-observation boundaries. Leave each step independently reviewable and reversible.

## Boundary

This is an incremental refactor, not a rewrite or service split. Preserve public API contracts, stored data, migration history, provider behavior, TestFlight routing, and human approval requirements. Do not absorb the uncommitted System Health work in the primary checkout; start from the current `origin/main` baseline where GET-28 is already merged.

## Current evidence

- iOS concentrates orchestration, state, networking, and presentation in a few very large files. `RelationshipAskView.swift` is the highest-risk coordinator, and HTTP clients repeat request and error handling.
- Backend composition remains centralized in `app.ts`, while recurring maintenance jobs are registered ad hoc across route modules with inconsistent overlap, failure logging, and shutdown behavior.
- Agent runners duplicate budget validation, usage accounting, and limit evaluation, which can drift across governed run types.
- Architecture documentation already defines the correct authority boundaries. The problem is physical ownership and repeated implementation, not a missing conceptual model.

## Chosen approach

Use behavior-preserving seams before moving domain logic. Extract one shared Agent run-budget kernel and one backend recurring-job lifecycle primitive with focused tests. Then isolate iOS orchestration state and transport in separate changes. Add narrow architecture ratchets only after the new seams exist, so checks encode a demonstrated direction instead of freezing the current shape.

Rejected alternatives:

- A repository-wide rewrite or microservice split increases deployment and data-consistency risk without addressing ownership inside each domain.
- Moving code only to reduce line counts hides coupling and provides no enforceable boundary.
- Renaming historical migrations can invalidate applied checksums; migration improvements must be forward-only validation.

## Milestones

1. [complete] Extract shared Agent budget/usage policy and centralize backend recurring-job lifecycle; prove equivalent behavior with focused tests and full TypeScript checks.
2. [active] Split `RelationshipAskView` orchestration into focused state/coordinator units and introduce a shared iOS HTTP transport through a small set of clients; prove with storage-guarded unit and UI checks.
3. [pending] Add contract-version generation/drift validation, migration-manifest integrity checks, and dependency/hotspot ratchets with explicit baselines.
4. [pending] Run independent review, current-head repository gates, deployment checks required by affected surfaces, and merge only verified slices.

## Verification

- Agent: focused run-kernel tests, complete Agent tests, typecheck, and build; Agent Host tests/typecheck/build because it consumes Agent exports.
- Backend: focused recurring-job lifecycle tests, complete Backend tests and typecheck; shutdown, failure, overlap, and disabled scheduling must be covered.
- iOS: run `dev-storage-guard audit` before tests, allocate one managed artifact directory, exercise focused unit/UI coverage on an allowlisted simulator, and remove the artifact only after durable evidence is recorded.
- Repository: `pnpm docs:check`, current-head CI/Security, diff review for authority and privacy regressions, and readback of the merged revision.

## Completion evidence

Each merged slice must name the exact revision, tests and gates, any deployment/readback required by nested repository instructions, and remaining milestones. Local green output or a created PR is intermediate evidence, not completion.

Milestone 1 implementation is on PR #194. At commit `b1a2b675`, Agent reported 243 passed and 1 skipped, Backend reported 416 passed and 130 skipped, Agent Host reported 58 passed, all three relevant typechecks/builds passed, and the PR's applicable CI, Security, CodeQL, and Vercel checks passed. Merge and backend deployment readback remain part of the slice handoff.
