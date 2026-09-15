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
2. [complete] Introduce a shared iOS HTTP transport through multiple real clients while preserving their domain-specific validation and error semantics; prove with storage-guarded unit checks.
3. [complete] Isolate `RelationshipAskView` Ask-operation ownership and repeated lifecycle transitions in a focused state unit, with behavior-preserving unit and UI checks.
4. [complete] Add contract-version generation/drift validation, migration-manifest integrity checks, and dependency/hotspot ratchets with explicit baselines.
5. [complete] Run independent review, current-head repository gates, deployment checks required by affected surfaces, and merge only verified slices.

## Verification

- Agent: focused run-kernel tests, complete Agent tests, typecheck, and build; Agent Host tests/typecheck/build because it consumes Agent exports.
- Backend: focused recurring-job lifecycle tests, complete Backend tests and typecheck; shutdown, failure, overlap, and disabled scheduling must be covered.
- iOS: run `dev-storage-guard audit` before tests, allocate one managed artifact directory, exercise focused unit/UI coverage on an allowlisted simulator, and remove the artifact only after durable evidence is recorded.
- Repository: `pnpm docs:check`, current-head CI/Security, diff review for authority and privacy regressions, and readback of the merged revision.

## Completion evidence

Each merged slice must name the exact revision, tests and gates, any deployment/readback required by nested repository instructions, and remaining milestones. Local green output or a created PR is intermediate evidence, not completion.

Milestone 1 was reviewed at PR #194 head `ba456ac544d8b7668c18a58c0226ed4300248972` and merged as `d2bfae017e2ed82126234abd4ab4c03f9b95332e`. Agent reported 243 passed and 1 skipped, Backend reported 416 passed and 130 skipped, Agent Host reported 58 passed, all three relevant typechecks/builds passed, and the latest PR commit's applicable CI, Security, CodeQL, and Vercel checks passed. The merged backend image was built but failed the pre-activation Opik deletion readback with `PRODUCT_OBSERVATION_DELETE_READBACK_REQUIRED`; the runtime was restored to the previously registered `9b803fa2e5d06ed2e13a6c9f08277192385c1db0` image/revision and its direct readiness, Tailnet live, authentication, Apple-key, voice, and chat-provider probes passed. Infisical and the backend release pointer were not advanced at that milestone; the accumulated backend change was later activated by Milestone 5 after the deletion readback passed.

Milestone 2 was reviewed at PR #195 head `cdd92ba4853d1b0f720675f9918c91b2b8c01c2c` and merged as `46c57e71153e301d8eee5942f3dec1ae6dbf6877`. It moved request construction and governed network execution into `TalentSignalHTTPTransport` for Agent Task, Lab Workspace, and Pursuit Proposal Review clients while leaving authentication preconditions, HTTP error meaning, contract validation, and review-conflict handling in their domain owners. It also replaced Agent Task's path-embedded query text with encoded `URLQueryItem` values. On an allowlisted iPhone 17 Pro Simulator, 13 focused transport/client tests and 569 non-Keychain unit tests passed, the Release Simulator build passed, and signed current-head CI verified the complete suite. Six existing secure-storage tests could not run in the unsigned local test host and consistently reported Keychain `-34018`; signed CI retained their coverage.

Milestone 3 was reviewed at PR #196 head `2686f41ec57de46bc1f8ec903b2af6d68b36d13f` and merged as `4c4d5ee62b20c7c38987979fc71d56bdcbce3c66`. It replaced seven independent `RelationshipAskView` operation fields with one `RelationshipAskOperationState`, centralized operation replacement/cancellation, assigned every screenshot, person-research, unscoped, and scoped operation a non-optional ownership token, and rejected stale finish/cancel callbacks before they can release newer UI state. It also consolidated repeated return-to-idle transitions without changing evidence, retry, or authorization behavior. Review then exposed that screenshot cancellation shared the Ask task lane and could clear a newer Ask's in-memory or persisted objective; cancellation now has per-screenshot ownership, records task state without completing an unrelated Ask context, and remains alive after dismissal or session navigation so an accepted stop command still reaches the backend. On the allowlisted iPhone 17 Pro Simulator, the final focused run passed 12 operation-state and 31 Session-continuity tests; the earlier slice also passed 574 non-Keychain unit tests and 3 focused Relationship Ask UI tests. The Release Simulator build, documentation checks, architecture diagrams, localization checks, and exact-head CI/Security gates also passed. The same six unsigned-host Keychain tests remained excluded locally and passed in signed CI.

Milestone 4 was reviewed at PR #197 head `ae46e919b8568ad33940be4ae2339cc223e607f1` and merged as `dc4210d3f11a96258104c3665f490383c3507e40`. It made the TypeScript contract declaration and generated iOS mirror an exact, unique checked pair, with the Swift block fixed as the first declaration after imports and active declarations screened outside comments and strings; moved the backend runtime migration sequence to one JSON manifest shared with the architecture check; froze all 73 migration names, order, and SQL digests, requiring a reviewed baseline advance for each append-only migration; and rejected unlisted SQL, new numeric-prefix collisions, undeclared or renamed workspaces, duplicate package identities, forbidden manifest dependencies, static source imports or TypeScript aliases that cross workspace ownership, and growth across nine named source hotspots. The source gate covers import, re-export, dynamic import, import types, TypeScript import-equals, triple-slash path/type references, and static-string `require` while leaving runtime-computed module targets to runtime/typecheck coverage. The aggregate `architecture:check` command now runs both boundary and diagram checks, and CI installs the pinned parser dependency before running the twelve failure-path tests plus the production check. Backend typecheck/build passed and emitted a readable 73-entry manifest into `dist/database`; the contract generator was byte-for-byte idempotent, all 78 repository script tests passed, and repository documentation and diagram checks passed.

Milestone 5 closed with independent review reporting no P0-P3 findings on the final implementation, no unresolved GitHub review threads, and all exact-head repository and Security checks passing. PR #197's iOS Release smoke completed in 33 minutes 36 seconds. The exact PR head was then deployed as `talent-signal-backend-local:architecture-ae46e919`; the mandatory Opik probe proved persistent destination write and deletion readback, and the Apple authentication, voice, Claude Relationship Ask, loopback readiness, and Tailnet live probes passed. After merge, Infisical registered the image and full revision together, the backend release pointer advanced atomically to a clean detached checkout of that revision, the resident keeper returned success, the running API reported the same revision, and PostgreSQL read back all 73 migrations through `069_account_access_event_details`. PR #193 remains separate screenshot-preprocessing work and was not absorbed into these architecture changes.
