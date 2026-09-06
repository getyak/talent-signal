# Lab CI receipt verification — 2026-09-04

## Outcome and boundary

Case-specific GitHub CI consumption now has a backend verifier, immutable
scoped receipts, and a native readback/recovery page. This milestone is local
source and Simulator work. No current branch was pushed, no hosted workflow
was dispatched, and no actual hosted case consumption is claimed.

The verifier checks the repository's immutable identity, admitted branch and
exact workflow content, completed run attempt/job/step, archive hash, report
revision and timestamps. It recomputes the report against the actual saved
case and product rerun, then rechecks run/artifact identity. A pinned trusted
workflow is independent evidence of consumption; it still does not establish
semantic quality or release enforcement.

Receipts distinguish origin verification from integrity outcome. A verified
report may contain failing integrity checks. Product and CI revisions stay
separate. Backend database time limits current verification to at most 15
minutes and source/rerun/artifact lifetime. Changing the trust policy or
removing its configuration invalidates current status. Source deletion wins
against in-flight verification and scrubs receipt payloads.

## Focused verification

- Ten GitHub adapter/archive tests passed: honest successful and failed
  reports; changed trust, wrong source revision/case, forged self-hashed report,
  skipped step, old attempt, concurrent rerun/expiry; token-free signed download;
  archive digest, CRC, traversal, entry count and expansion limits.
- [Database lifecycle checks](backend-checks.json) passed against an owned
  disposable PostgreSQL 18 database migrated through 044. Eight fixture model
  requests and four fixture verifier calls exercised the recorded groups.
  No external model or GitHub request was made by that fixture.
- Eleven signed native unit tests passed: five CI input/binding/recovery/
  authority checks and six existing saved-regression recovery checks.
- Nine shared evaluation-consumer tests and backend typecheck passed.
- Localization passed with 1,634 catalog keys. Actionlint and fourteen existing
  CI release policy tests passed.
- The complete native UI journey passed on iPhone 17 Pro / iOS 26.5:
  save, relaunch, exact rerun selection, verified passing and failing integrity
  receipts, export and deletion. The final journey used four fixture calls;
  its server counter is eight after two successful UI iterations. All model
  and CI providers in this milestone are fixtures, not live proof.
- Release Simulator build passed; this is neither a signed device archive nor
  TestFlight delivery.

The first native UI attempt exposed a test-harness assumption: a refresh can
insert a recovered result section and move the history row below its prior
position. The helper now searches both directions for lazy cells and selects
the exact source ID. This was a navigation-harness failure before CI execution,
not a passing CI verification. A later attempt found a stale compiled contract
in the proof server after source changes; restarting with the current contracts
resolved the detail-response serialization failure. The database evaluator now
asserts authenticated HTTP detail/list serialization after verification.
Screenshot review then caught truncated picker metadata. Compact time and
full selected-run identity now replace the clipped timestamp; the final UI
test asserts that the selected identity matches the exact product rerun.

## Native artifacts and review

- [Verified record](ci-native-verified.png)
- [Verified record with failing integrity](ci-native-failed-integrity.png)
- [Deletion receipt](regression-native-deleted.png)
- [Synthetic UI/API readback](regression-native-proof.json)
- [Focused safety and mobile review](review.json)

The native proof covers the English default-size critical path. Chinese,
accessibility text sizes and VoiceOver remain part of the full Lab review;
localization checking does not substitute for that device evidence.

## Data lifecycle

| Material | Scope and retention | Effect authority |
| --- | --- | --- |
| Case and rerun readback | Existing authenticated account/user; existing case and job lifetimes | None |
| Pending native CI intent | Environment/account/user protected file, excluded from backup, up to seven days; cleared after matching readback | Read-only verification request |
| Backend CI receipt | Scoped metadata; current for at most 15 minutes; payload scrubbed with case deletion/expiry; non-content replay tombstones remain | None |
| GitHub report artifact | Metadata only, seven-day independent expiry; raw input/answer/review excluded | None |

## Implementation and rollout

The shared consumer lives in `packages/evaluation`; backend, runner, Docker
and CI build paths include that dependency. The automatic synthetic artifact
is separate from the optional case-specific workflow artifact. Only bounded
metadata is uploaded; source input, answers and reviews remain outside the
artifact. iOS stores only scoped verification intent for recovery, clears it
after matching readback, and does not claim output or release approval.

See the [operator playbook](../../operations/lab-ci-verification.md) for trust
configuration and the [full implementation plan](../../../plans/2026-09-04-lab-complete-runtime.md)
for remaining Lab scope. Image/Agent batches, expanded device tools, guided
diagnostics, durable resets, observation controls and Web review remain open.

Temporary logs and result bundles are under `/tmp/talent-signal-lab-v2/ci-*`.
The owned API on 4329 was stopped and the tmpfs PostgreSQL container
`ts-lab-ci-proof-20260904` was removed after capture. No database volume remains;
shared development services were untouched. Final UI evidence is in
`ci-native-ui-delivery.xcresult`; unit evidence is in `ci-native-unit.xcresult`.
