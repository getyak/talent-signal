# Round 3 final integration summary

## Verdict

**Fail / release blocked.** All deterministic local gates pass after the
disclosed corrections, and `XS-RETENTION-01` is resolved. `XS-CAPTURE-01`
remains active because automated Chromium cannot replace a visible user Google
Chrome `chrome://extensions` load, selected-text or toolbar gesture, positive
temporary `activeTab` grant, real pre-Submit trace, and extension-originated
same-account receipt/readback.

The veto is applied before scores. The preserved Web and extension craft scores
remain 95–99 exactly as previously adjudicated, and the iOS reviewer score
remains 3/4. None is raised or averaged into a passing integrated verdict.

## Frozen provenance

- base and retention evidence commit:
  `b8b9382a5d20652da699c2a83db3bc35e3c1aec3`
- retention implementation parent:
  `bf6e1de2892c1d98608ac53d360ff8b0f889626f`
- fixture SHA-256:
  `b776e991861512b0de41a2c130a5f446e0f9f4aa418b26dd948d1f9468274b94`
- final Load unpacked path:
  `/Users/xiongxinwei/.codex/worktrees/b8f2/talent-signal/apps/chrome-extension/dist`
- final extension aggregate SHA-256:
  `a7f69be69a069897a122a7676d12bbd6e9246392d03d05a0c733e4b56deb6314`
- manifest: MV3, version `0.1.0`, `activeTab` + `scripting` + `sidePanel`,
  localhost-only host permissions, incognito disallowed

Frozen overnight, round-two final, and retention before/after evidence were not
modified.

## Corrections accepted during integration

1. **Retention truth blocker.** The backend now accepts
   `reviewed_selected_text` only for one sequence-zero transcript message,
   rejects multi-message minimized-scope claims, and rejects every
   `reviewed_evidence_crop` request because no governed crop asset reaches the
   service. Web selected-text evidence still succeeds.
2. **Historical migration truth blocker.** Migration 002 no longer labels
   unverified legacy rows as full source. Active legacy source and replay caches
   are scrubbed into `legacy_unknown`, with one `source_purged_at` timestamp and
   matching `source_purged / legacy_unverified` lineage; deleted rows retain
   deletion semantics.
3. **iOS deterministic cancellation gate.** The first full UI run passed 11/12
   but completed fixture import before XCUITest could cancel it. A validated
   test-only launch delay was added while the product default stayed at two
   seconds. The targeted rerun and the final 12/12 suite pass.

## Final gate results

- Core: pass — 8 cases, 6 review packets, 9 cross-surface invariants,
  12 craft dimensions, 2 schemas, 4 examples.
- Contracts: pass — contract `2026-08-05.3`, retention policy v2.
- Backend CI: pass — 4 files, 14 tests.
- Fresh Docker: pass — migration, health, 8 cases, 13 boundaries, account
  isolation, duplicate/retry, real receipts, deletion, and no external writes.
- Retention: pass — ephemeral review-completion purge, deadline purge,
  non-restoring retry caches, truthful legacy migration, and rejection of false
  selected-text/crop scopes.
- Web: pass — lint, 28 tests, direct TypeScript check, production build, real
  localhost sign-in, duplicate receipt, and same-account workspace readback.
- iOS: pass — current-source unit 13/13, final UI 12/12, Release build, and
  direct Simulator confirm/edit/dismiss/action-preview/no-external-write path.
  VoiceOver was not executed or claimed.
- Browser extension: pass with manual limitation — source 33/33, validation,
  build, built package 33/33, automated pre-Submit silence, explicit synthetic
  Submit, receipt, and retention UI. User Chrome capture remains unproven.
- Codex plugin: pass — manifest, skill, 11 local-boundary checks, installed and
  enabled state, byte equality, 8 fixtures, and 3 probes.
- Product adjudication: pass structurally — five sequential specialist packets
  and the veto-first panel validate.
- Documentation: recorded in `command-results.json`.

## Same persisted receipt

The authoritative persisted TS-CORE-01 slice is account
`10000000-0000-4000-8000-000000000001`, request
`round3-final-fixed2-001`, and capture/receipt
`acb23f40-ac0f-4a73-98c3-2e2821fd68b6`. Its duplicate reused the same identifiers.
Receipt and workspace readback show `evidence_crop` enforced as
`reviewed_selected_text`, four new proposals, zero newly confirmed facts, no
approval, and no effect.

The plugin, automated extension, and direct iOS evidence use the same frozen
fixture and semantic boundary but do not claim that persisted receipt. The
manual Chrome path must create and read back its own matching account-scoped
receipt.

## Highest-leverage remaining evidence

1. Complete the one visible user Google Chrome selected-text capture trace for
   the exact frozen package and resolve `XS-CAPTURE-01`.
2. Record one truthful VoiceOver traversal of the frozen iOS sequence.
3. Use the Chrome trace as an uncoached first-time recruiter walkthrough and
   capture task comprehension and timing.

No push, PR, deployment, live candidate data, or real contact/calendar/message/
ATS/CRM write occurred.
