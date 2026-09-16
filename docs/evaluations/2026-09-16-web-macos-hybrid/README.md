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
| TS-006 | agree | contract | session.unscoped | passed | not_reviewed |
| TS-007 | revise | interaction | composer.mentions | not_run | not_reviewed |
| TS-008 | revise | contract | composer.time | not_run | not_reviewed |
| TS-009 | revise | interaction | session.tabs | not_run | not_reviewed |
| TS-010 | agree | native | voice.final_draft | not_run | not_reviewed |
| TS-011 | pending | interaction | session.navigation_recovery | passed | not_reviewed |
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
| TS-024 | pending | contract | draft.conflict | passed | not_reviewed |
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

### M1 Web Session create, recovery, and conflict

The real local Web/backend/PostgreSQL boundary passed TS-006 and TS-024 using
the isolated public synthetic fixture. The versioned observation, database
readback, limitations, screenshots, and hashes are recorded in
[`web/2026-09-16-session-boundary.md`](web/2026-09-16-session-boundary.md).

The same M1 boundary document records explicit Person selection, evidence
inspection, change review/receipt readback, and return to the same Session.
TS-011 is `passed`; the remaining exceptional cases stay at their individually
observed status.

### M2 Meetings, Plugs, and exceptional-state slice

The versioned local observation for MeetingDraft persistence, exact-intent
recovery, ICS-only handoff, source revocation, truthful Plug state, account
menu, responsive/dark render evidence, fresh PostgreSQL constraints, and final
independent review is recorded in
[`web/2026-09-16-meeting-and-plugs-boundary.md`](web/2026-09-16-meeting-and-plugs-boundary.md).

This is a verified M2 slice, not full M2 acceptance. TS-014, TS-020, TS-021,
TS-023, and TS-030 remain `not_run` because their complete required boundaries
were not executed.

### M3/M4 Hybrid shell and native boundary slice

The versioned packaged-app observation for the local Tauri shell, exact-leaf
pinned HTTPS loopback adapter, Keychain restart recovery, shared Web/native UI
boundary, explicit content-free quick panel, state-only notification request
dedupe, direct local Vision success/failure, bundle facts, and explicit release
gaps is recorded in
[`macos/2026-09-16-hybrid-boundary.md`](macos/2026-09-16-hybrid-boundary.md).

This is a verified feasibility slice, not M3/M4 completion. TS-026 through
TS-030 remain `not_run`: their complete permission, integration, multi-display,
deep-link, denial, connector-ownership, and privilege-escalation boundaries
were not executed. The observed notification result proves request submission,
not system display. Human design acceptance remains `not_reviewed`.

### Post-review recovery and retention hardening

Commit `4e932e60fac5d07ef09e6eafa1ee6f7708959cde` hardens the delivered
slice without rewriting its historical browser or packaged-app observations:

- Web keeps the exact latest draft plus its in-flight predecessor in a
  24-hour, account/user-partitioned local recovery record. Reload can continue
  only an exact canonical predecessor; unrelated server state remains a visible
  conflict. Global workspace and logout boundaries remove other-account data.
- Session pagination now uses owner-scoped, five-minute identity snapshots with
  frozen `(updated_at, id)` order, a 5,000-item ceiling, four active snapshots,
  and first-page-only rate limiting. Physical snapshot cleanup is isolated from
  sensitive-content scrubbing and business transactions.
- Hybrid capture-intent recovery retains UUIDs only, expires after 24 hours,
  prunes on verified scope changes, clears on confirmed disconnect, and remounts
  the native workbench when the verified account/Session changes.
- Backend TLS configuration reads a nonblocking, no-follow file descriptor, so
  a FIFO or symlink cannot block startup or swap the inspected file.

The final local gates passed with 75 migrations, Web 99 files/626 tests
(`1/1` skipped), Backend 59 files/445 tests (`10/139` skipped), Hybrid 2
files/14 tests, 33 Rust tests, an isolated PostgreSQL 2-file/51-test boundary
run, the 39-page Web production build, Tauri bundle build, strict code-signature
verification, documentation/architecture checks, and secret scanning. An
independent review found no unresolved P0/P1/P2 in the hardening diff.

This adds deterministic recovery and safety evidence, not new product
acceptance. The historical screenshots stay bound to their named builds;
TS-026 through TS-030 remain `not_run`, and human design acceptance remains
`not_reviewed`.
