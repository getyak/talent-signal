# V1 experience correction — V10 frozen delta

## Review object

- Artifact ID: `TS-V1-EXPERIENCE-2026-08-25-10`
- Type: narrow iOS evidence-review recovery correction
- Source base: commit `5fa53ecf272eef6722b46698a14c3bc8c22f0b4a`
- Frozen delta: the four source hashes in
  [`runtime-evidence.json`](runtime-evidence.json), frozen at
  2026-08-25 05:22 CST
- UI baseline: the hash-matched V9 Simulator artifact
  [`../2026-08-25-v1-experience-correction-v9/artifact.md`](../2026-08-25-v1-experience-correction-v9/artifact.md)

## Outcome and boundary

This delta addresses the two correctable V9 review findings without widening
the product surface:

1. A live evidence-review task is owned by the account-scoped
   `AgentSessionStore`, so dismissing and reopening Ask in the same process does
   not expose a competing recovery action. Process relaunch intentionally starts
   with no live owner while retaining the protected pending operation, which is
   the safe recovery boundary.
2. `EVIDENCE_REVIEW_AUTHORITY_STALE` is now a persisted terminal
   `superseded` state. It says a newer source decision is current, removes the
   obsolete-key retry, and offers a fresh Ask with current evidence.

The change does not execute an external action, make an old Agent answer
current, or change canonical evidence authority. Canonical authority remains in
the V9 backend chain and PostgreSQL constraints.

## Verification

- 98/98 iOS unit tests pass, including session-owned live-task and persisted
  superseded-state tests.
- The unsigned generic iOS Release build succeeds.
- `pnpm check` succeeds, including documentation and architecture checks,
  133/133 backend tests, Web tests/build, and repository type/lint checks.
- `git diff --check` succeeds.

The V9 visual and full-stack evidence remains the only frozen UI baseline. Two
post-freeze attempts to rerun the concurrently edited canonical UI test are
explicitly excluded: the current test and orchestration sources are outside the
frozen boundary, and the resulting UI failure conflicts with a server log that
shows successful Chat creation, readback, and evidence review. This delta does
not treat that contradiction as passing evidence.

## Proof limit

This closes the two findings in source and unit evidence only. A delayed
close/reopen recording, kill/relaunch recording, real stale-authority UI
journey, complete AX5 critical path, physical VoiceOver/Switch Control,
production Apple authorization, physical microphone boundaries, and field
outcomes remain missing. It is not a 99/100 experience or production-release
claim.
