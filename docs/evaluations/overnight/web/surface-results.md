# Web surface results

## Verdict

The authenticated Web slice passes the frozen eight-case behavior gate. The
surface keeps observed evidence, proposed state, recruiter decisions, action
approval, and fixture outcomes distinct. No production synchronization or
external effect is claimed.

This result proves only the deterministic fixture behavior and the observed
localhost surface. It does not prove OCR quality, field value, privacy
compliance, external connector safety, or production reliability.

## Direct case evidence

| Case | Surface exercise | Observed result |
| --- | --- | --- |
| `TS-CORE-01` | Confirmed four source-linked facts, observed the action remain locked until all four decisions, approved one local handoff separately, and inspected pending, verified-in-fixture, failed, and unknown outcomes. | Action target, local effect, reason, due time, and exact source remained visible. No send, meeting, contact, or ATS effect was claimed. |
| `TS-CORE-02` | Opened the friendly catch-up source. | No fact change and no action were proposed. |
| `TS-CORE-03` | Observed confirmation disabled, supplied an exact date, time, and timezone, then resolved the source time. | The relative date stayed ambiguous until explicit resolution. The result remained clarification only, with no meeting action. |
| `TS-CORE-04` | Inspected the prior remote requirement, exact conditional evidence, and reporting-line action; edited the proposed value. | Before, proposed, and edited values remained distinct. The action unlocked only after the fact decision. |
| `TS-ID-01` | Opened the same-name source and selected one explicit candidate and assignment option. | No fact or deadline action appeared before or after binding. The binding stayed local to the fixture session. |
| `TS-ID-03` | Inspected the forwarded hiring-manager statement and candidate reply, then dismissed the proposed attributed fact. | The relocation statement remained attributed to the hiring manager. Candidate agreement was not inferred and no action was created. |
| `TS-ACT-01` | Confirmed availability and inspected the one action proposal without approving it. | Availability did not become meeting consent. The action remained a question for exact date and timezone, and the preview stated that nothing would be sent or scheduled. |
| `TS-BOUND-01` | Opened the requested culture-fit percentage case. | The scoring request was blocked. No assertion, candidate assessment, ranking, or action was created. |

## Critical path sequence

`TS-CORE-01` was exercised on the production build through the existing local
account flow:

1. Sign in using the configured local fixture account.
2. Inspect the exact candidate source and four contiguous evidence quotes.
3. Confirm each fact independently.
4. Observe the action approval remain unavailable through the first three
   decisions.
5. Observe the action become available after the fourth decision.
6. Inspect exact target and effect, then approve the local handoff separately.
7. Inspect pending, verified-in-fixture, failed, and unknown result language.

Direct artifacts:

- `artifacts/ts-core-01-first-fact.yml`
- `artifacts/ts-core-01-facts-reviewed.yml`
- `artifacts/ts-core-01-pending.png`
- `artifacts/ts-core-01-verified.png`

## Backend and fixture boundary

The server adapter accepts only `http` or `https` origins whose hostname is
`localhost`, `127.0.0.1`, or `::1`. It requests
`/v1/candidate-momentum/cases` and requires:

- the exact suite and version;
- all eight frozen case contracts without semantic alteration;
- an explicit `data_mode` of `fixture` or `synchronized`.

Observed states:

- No backend configured: `Frozen sample cases`, `sample only`.
- Configured backend unavailable: visible fallback to frozen synthetic
  fixtures with refresh recovery.
- Valid localhost fixture response: `Local fixture backend`, with an explicit
  statement that no external system is implied.

Direct artifacts:

- `artifacts/backend-unavailable.yml`
- `artifacts/backend-fixture.yml`

## Responsive, theme, motion, and accessibility evidence

- Desktop light: 1440 x 1000, no clipped primary action at the review position.
- Desktop dark: system dark mode preserved hierarchy and state contrast.
- Narrow mobile: 390 x 844, deliberate case selector, single-column review,
  and zero measured horizontal overflow.
- Reduced motion: the browser reported
  `prefers-reduced-motion: reduce`; the workspace used the static path.
- Keyboard: the skip link was first, its focus outline was non-zero, case
  selection by Enter moved focus to the new case heading, and the next focus
  target remained visible.
- Accessibility snapshot: all eight cases, source regions, fact controls,
  ambiguity inputs, independent action, outcome control, theme, recovery, and
  sign-out exposed roles and accessible names.

Direct artifacts:

- `artifacts/workspace-desktop-light.png`
- `artifacts/workspace-desktop-dark-reduced.png`
- `artifacts/workspace-mobile-light.png`

## Correction loops

1. The development hot-reload origin repeatedly refreshed browser state.
   Verification moved to the production build, where the full interaction path
   persisted and passed.
2. The first localhost dataset guard verified suite identity and case IDs but
   did not reject a semantically altered case body. The guard now requires the
   complete frozen contract, with a deterministic rejection test.
3. No third product correction was required. Final preflight and command gates
   found no additional in-scope failure.

## Final command evidence

Frozen run:

```text
pnpm --filter @talent-signal/web test
PASS, 5 files and 18 tests

pnpm --filter @talent-signal/web lint
PASS

pnpm --filter @talent-signal/web typecheck
PASS

pnpm --filter @talent-signal/web build
PASS, production workspace route built as dynamic

pnpm docs:check
PASS, documentation and compiled wiki checks
```

## Remaining uncertainty

- No real external destination was connected or observed.
- No manual screen-reader session or browser accessibility-tree scoring tool
  was run; the direct evidence is keyboard behavior plus Playwright semantic
  snapshots.
- The local backend check covers the frozen response contract, unavailable
  recovery, and labeling. It does not cover authentication, retry queues,
  persistence, or multi-user concurrency.
