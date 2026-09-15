# Web and macOS Hybrid implementation evaluation

## Evidence identity

- Implementation base: `origin/main@46c57e71153e301d8eee5942f3dec1ae6dbf6877`
- Fixed design input:
  `talent-signal-design-handoff@2d1af8983d23fb584d4086bfa894bcb9b5fa706a`
- Fixture policy: synthetic or explicitly isolated development data only
- Production deployment: not authorized
- Human design acceptance: `not_reviewed`

The handoff annotations are preserved as design input, not converted into
production results: 12 `revise`, 2 `agree`, 16 `pending`. Prototype screenshots
and its seven Node checks are mock evidence only.

## Status vocabulary

- `passed`: observed at the real required boundary with linked evidence.
- `failed`: executed at that boundary and did not meet the contract.
- `blocked`: a named external input, credential, source, or product decision is
  required and safe alternatives are exhausted.
- `not_run`: implementation or execution has not reached the required boundary.

## Execution matrix

| ID | Snapshot | Layer | Contract | Production | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| TS-001 | revise | visual | navigation.secondary | not_run | not_reviewed |
| TS-002 | revise | visual | navigation.brand_row | not_run | not_reviewed |
| TS-003 | revise | interaction | session.participants | not_run | not_reviewed |
| TS-004 | revise | interaction | navigation.hover | not_run | not_reviewed |
| TS-005 | revise | visual | person.current_dependency | not_run | not_reviewed |
| TS-006 | agree | contract | session.unscoped | not_run | not_reviewed |
| TS-007 | revise | interaction | composer.mentions | not_run | not_reviewed |
| TS-008 | revise | contract | composer.time | not_run | not_reviewed |
| TS-009 | revise | interaction | session.tabs | not_run | not_reviewed |
| TS-010 | agree | native | voice.final_draft | not_run | not_reviewed |
| TS-011 | pending | interaction | session.navigation_recovery | not_run | not_reviewed |
| TS-012 | revise | scope | group.deferred | not_run | not_reviewed |
| TS-013 | revise | contract | memory.relationship_scope | not_run | not_reviewed |
| TS-014 | revise | interaction | meeting.prepare | not_run | not_reviewed |
| TS-015 | pending | model | attention.no_action | not_run | not_reviewed |
| TS-016 | revise | contract | identity.ambiguity | not_run | not_reviewed |
| TS-017 | pending | model | evidence.recollection | not_run | not_reviewed |
| TS-018 | pending | model | evidence.speaker | not_run | not_reviewed |
| TS-019 | pending | contract | evidence.history | not_run | not_reviewed |
| TS-020 | pending | security | evidence.revocation | not_run | not_reviewed |
| TS-021 | pending | interaction | account.menu | not_run | not_reviewed |
| TS-022 | pending | security | account.isolation | not_run | not_reviewed |
| TS-023 | pending | contract | operation.idempotency | not_run | not_reviewed |
| TS-024 | pending | contract | draft.conflict | not_run | not_reviewed |
| TS-025 | pending | security | approval.separation | not_run | not_reviewed |
| TS-026 | pending | native | capture.cancel | not_run | not_reviewed |
| TS-027 | pending | native | ocr.no_cloud_fallback | not_run | not_reviewed |
| TS-028 | pending | native | session.quick_panel | not_run | not_reviewed |
| TS-029 | pending | native | notification.private | not_run | not_reviewed |
| TS-030 | pending | security | plug.fail_closed | not_run | not_reviewed |

## Evidence index

Add one immutable row here only after a result is observed. Each entry must
name the build/commit, platform, fixture, exact boundary, evidence file, and any
known gap. Screenshots alone cannot prove domain, security, model, or native
behavior.

### M0 comparable design render

Observed on 2026-09-16 in the local in-app Chromium browser using identical
synthetic Person, Session, evidence, and change-review content:

| Evidence | Viewport | SHA-256 |
| --- | --- | --- |
| `design-comparison/screenshots/direction-a-1440.png` | 1440 × 1000 | `63b9eb3fceaa865ae5a9c485a58f93ce2ca7627279ae8b7f610370cf895f8e51` |
| `design-comparison/screenshots/direction-a-390.png` | 390 × 1287 full page | `f2ec2633e6951684d4a951b1c3c895dbfce516c5deaa105cbcfc126b1f216652` |
| `design-comparison/screenshots/direction-b-1440.png` | 1440 × 1000 | `a395281425d050e7d8ec12ac2614cfaf1c61810a7b6d9debabd97d44796bcd49` |
| `design-comparison/screenshots/direction-b-390.png` | 390 × 1386 full page | `40408c7281ddcb5e2555f7722115ed7f4c76e7c0d7ad825c4b694a4c107bb9cf` |

Direction A is the implementation champion. It kept the relationship question,
evidence link, change review, and approval boundary in one continuous reading
path at both widths. Direction B made the revision boundary more spatially
stable at 1440 px, but its inspector became a second dominant page segment at
390 px and added 99 px to the full-page decision journey. B remains an equally
scaled challenger and the human acceptance result remains `not_reviewed`.

This record proves only rendered hierarchy and responsive composition. It does
not prove backend truth, authorization, model behavior, native behavior, or
production effectiveness; no TS case changes status from `not_run` here.
