# System E2E Agent review scope

- Artifact ID: `TS-SYSTEM-E2E-2026-09-03-01`
- Type: Web, iOS, macOS, backend, and evaluation workspace at one repository
  commit
- Version: `5ba505ae45e3df51b3339427da79c96fde42c137`
- Branch/state: `main`, clean before this review
- Target user: time-constrained independent recruiter / relationship operator
- Environment: local disposable synthetic state; real browser and native
  Simulator/app surfaces where available
- Success condition: resume attention, intentionally capture, inspect exact
  evidence, resolve identity/context, decide fact and action independently,
  observe a truthful result, and recover continuity from primary navigation
- Safety boundary: no production candidate data and no real external write

## Frozen scenario

A relationship operator returns to current work, opens the relevant Agent or
relationship context, captures a supported synthetic signal, resolves identity
and time ambiguity, reviews evidence and uncertainty, confirms or dismisses
state, separately reviews the proposed action, observes the resulting receipt,
and can later find the same governed context from Today, Sessions/Ask, People,
or the relationship workspace. Failure, interruption, stale state, duplicate
retry, and `no_action` must remain safe.

## Selected reviewers

- `recruiter-workflow-reviewer`: core product usefulness and operational fit.
- `evidence-safety-reviewer`: private evidence, identity, state, action, and
  recovery boundaries.
- `mobile-ux-reviewer`: the iOS and responsive parts of the journey.

## Omitted reviewers

- `candidate-experience-guardrail`: no candidate-facing communication is sent.
- `selection-science-auditor`: no candidate assessment or evaluator is changed.
- Sourcing, performance, motivation, potential, and trend lenses: the frozen
  journey does not ask them to decide within their domains.
