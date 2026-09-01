# RC8 build 6 verification

## Frozen identity

| Item | Value |
| --- | --- |
| Release archive | `TalentSignalMac-0.1.0-build6.zip` |
| Release SHA-256 | `59bac7af006b5bd40e5f1926203c671143c36b10b757f95ed77350dd108632c6` |
| Release binary SHA-256 | `76b73c84c48ade5a442354ed608f9c13c4c0ba5bbc7492e183b9d39263bcbe81` |
| Architectures | `x86_64 arm64` |
| Version/build | `0.1.0 (6)` |
| Source archive | `TalentSignalMac-source-0.1.0-build6.tar.gz` |
| Source SHA-256 | `97c70441bde0d9bf332c1fec2e78a9956fb752bf44ce3989ba4b1b44177aab98` |

The archive is an unsigned local Release verification artifact, not a notarized
App Store submission.

## Checks

| Check | Result |
| --- | --- |
| `pnpm backend:check` | Passed: agent 49/49, backend 216/216, fresh PostgreSQL runtime/evaluation checks passed, migration readiness at `037_source_retention_derivative_lineage` |
| `pnpm macos:check` | Passed: native unit/integration tests passed and the UI-test target compiled; runtime UI automation is not claimed |
| Native live E2E | Passed 5/5 on macOS 26.4 against a fresh loopback PostgreSQL backend |
| Focused menu-bar privacy test | Passed 1/1; source and binary expose no system-notification sink |
| Direct build 6 clarification surface | Captured from the frozen Release app with screenshot SHA-256 `31cb66dc9f4e6c61c444541a63829a09d61b8ec492db9b5f6bdf814d1070c60f` and AX-tree SHA-256 `3114903934eaa3fdf8d6274fde7c4bf6800e75d98a20c4c049b847b78b21c790` |

The final native live bundle is
`system/live-e2e-20260831T182318Z-98136`. Its five tests cover: reviewed Capsule
to no-action readback with existing-owned-action projection; relative-time
clarification; proposal to explicit decision and receipt; revocation between
preview and decision; and immutable Capsule version separation. All asserted
external-effect arrays are empty.

## Temporal clarification and owned-action continuity

Build 6 renders the exact clarification question: calendar date, timezone,
duration, and meeting consent. It states that no calendar write or message send
occurred and directs the recruiter to provide a new reviewed Capsule instead of
letting the agent infer authority.

The current cross-surface proof binds native Task
`a0813b86-4198-4747-972d-1910ca08c797` to Pursuit
`81ca9cec-cdbd-4ab2-a162-d84c8b7d72f1`. The Web pursuit workspace reads the
same task revision 2, event count 6, zero external effects, and the already-owned
action `Prepare the exact client policy question`. It states that no duplicate
action was created. The Web screenshot SHA-256 is
`11911ae667800e6de7c57f21e57060a6021a411089e80a3ad535e799dc13859c`;
the API readback SHA-256 is
`74873e75b460217f87a0fa9f899e086cfc167fbc149c7e65bf124cd1b3ac2dd9`.

## Manual deletion and TTL

The exact build 6 source was used against the RC8 loopback backend.

- Manual deletion: 40 lineage entries across 22 required entity types; 14
  `content_removed`, 25 `audit_reference_retained`, and 1 `access_revoked`.
  Before and after relaunch normalize to SHA-256
  `92735288e0b30a5dfcc4bf0920399b001e52d595e5f2188b818fb658ff7be137`.
  Both scans cover all 93 public base tables with zero private-sentinel matches.
- TTL expiry: 43 derivative entries across 25 entity types. Before and after
  relaunch normalize to SHA-256
  `230d249cfdc73cc3ba05474453dcddc939971c28b41904427260e6b5842cf797`.
  Both scans cover all 93 public base tables with zero private-sentinel matches.
- In both paths the task is `needs_rebase`, source-derived artifact content is
  redacted or stale, the decision bundle is cancelled, run evidence/input is
  empty, and external effects remain empty after process restart.

## Evidence boundaries

The direct clarification image is a deterministic synthetic fixture clearly
labelled as such. The live and cross-surface proofs are synthetic and
loopback-only. Older keyboard, VoiceOver, zoom, decision-control, and menu-bar
media are admitted only through the scoped source-delta audit; they do not prove
the new clarification or owned-action paths.
