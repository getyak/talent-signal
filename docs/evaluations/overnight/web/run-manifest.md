# Web overnight run manifest

## Run identity

- Surface: authenticated Web evidence-review workspace
- Owner: `apps/web/**` and `docs/evaluations/overnight/web/**`
- Base commit: `f66581cbf8a1b1154156fc25231a6ff82f11c61f`
- Branch: `codex/overnight-web-slice`
- Fixture suite: `talent-signal-candidate-momentum-v1`
- Fixture version: `2026-08-05.1`
- Started: `2026-08-05`, Asia/Singapore
- Result implementation commit: `0978eba253e95ce275d6458622e3012f8e24dcdc`

## Outcome and boundary

Build one authenticated review transaction that lets a recruiter reach all
eight frozen cases, inspect exact evidence, resolve identity or time ambiguity,
review every proposed fact independently, approve no more than one action, and
observe an honestly labeled result.

The Web app may read an explicitly configured localhost backend. Its
deterministic fixture fallback is always labeled as sample data. This run does
not connect to production systems, use real candidate data, or perform an
external write.

## Canonical objects and attention

- Canonical entity: a person inside one assignment context, or an unbound
  episode while identity is unresolved.
- Governed objects: source episode, evidence message, proposed assertion,
  reviewed fact state, action proposal, exact approval, and observed outcome.
- Derived views: case rail, review progress, current dependency, and timeline.
- Dominant attention: the next unresolved dependency in the selected case.

## Baseline

The worktree was clean and detached at the requested base. The existing
authenticated workspace contained four sample candidate records. It did not
expose the frozen eight-case suite, identity/time resolution, atomic fact
review, independent action approval, or pending/verified/failed/unknown
outcomes. Its action-review path lived on a separate public demo.

Baseline commands:

```text
pnpm --filter @talent-signal/web test       PASS, 11 tests
pnpm --filter @talent-signal/web lint       PASS
pnpm --filter @talent-signal/web typecheck  PASS
pnpm --filter @talent-signal/web build      PASS
```

## Milestones

- [x] Confirm clean base, ownership, routed product context, and baseline checks.
- [x] Implement fixture contract, localhost adapter, and review state machine.
- [x] Implement the authenticated review workspace and complete responsive states.
- [x] Exercise all eight cases and directly record `TS-CORE-01`.
- [x] Run up to three evidence-driven correction loops.
- [x] Freeze final checks, artifact locators, gaps, and diff.
- [x] Record the local result commit.

## Correction loops

| Loop | Evidence | Correction | Result |
| --- | --- | --- | --- |
| 1 | Development hot-reload origin refreshed client state during browser interaction. | Moved direct surface verification to the production build. | Full click state persisted; `TS-CORE-01` passed. |
| 2 | Localhost adapter accepted a complete ID set without checking semantic case bodies. | Required exact frozen context, messages, and expected contract; added rejection coverage. | Altered case payloads now fail validation and use the visible fixture fallback. |
| 3 | Final surface and preflight review found no additional in-scope failure. | No product patch. | Retained the smaller complete implementation. |

## Artifact locators

- Craft rubric: `docs/evaluations/overnight/web/craft-rubric.md`
- Deterministic and surface results: `docs/evaluations/overnight/web/surface-results.md`
- Desktop light screenshot: `docs/evaluations/overnight/web/artifacts/workspace-desktop-light.png`
- Desktop dark and reduced-motion screenshot: `docs/evaluations/overnight/web/artifacts/workspace-desktop-dark-reduced.png`
- Narrow mobile screenshot: `docs/evaluations/overnight/web/artifacts/workspace-mobile-light.png`
- `TS-CORE-01` sequence: `docs/evaluations/overnight/web/artifacts/ts-core-01-first-fact.yml`,
  `docs/evaluations/overnight/web/artifacts/ts-core-01-facts-reviewed.yml`,
  `docs/evaluations/overnight/web/artifacts/ts-core-01-pending.png`, and
  `docs/evaluations/overnight/web/artifacts/ts-core-01-verified.png`
- Backend recovery: `docs/evaluations/overnight/web/artifacts/backend-unavailable.yml`
- Local fixture backend: `docs/evaluations/overnight/web/artifacts/backend-fixture.yml`
- Final command log: `docs/evaluations/overnight/web/surface-results.md`

## Untested behavior

Production synchronization, OCR accuracy, external connectors, real candidate
value, privacy compliance, and field outcomes are outside this fixture-bound
evaluation. A manual screen-reader session and production backend concurrency
were not tested.
