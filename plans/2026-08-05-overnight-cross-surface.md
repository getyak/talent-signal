# Overnight cross-surface execution plan

## Outcome

By the morning handoff, Talent Signal should show one coherent, high-craft
candidate-momentum loop across a Codex plugin, Web, and iOS:

```text
authorized input
→ inspectable evidence
→ proposed state
→ human review
→ one smallest safe action or no_action
→ truthful result or handoff
```

The run optimizes for a convincing vertical slice and trustworthy product
behavior. It does not attempt production OCR, a shared production backend, or
live external writes overnight.

## In scope

- one shared eight-case synthetic evaluation suite;
- a valid read/propose-only Talent Signal Codex plugin;
- an executable Web evidence-review workspace;
- an executable iOS fixture-driven evidence-review flow;
- direct surface evidence, deterministic checks, and independent review;
- isolated worktrees with non-overlapping write ownership.

## Out of scope

- ambient private-message collection;
- automatic messages, calendar, contacts, ATS, or CRM writes;
- candidate scoring, ranking, fit, personality, protected-trait, or acceptance
  inference;
- a new production backend, database, workflow engine, or graph store;
- claiming field value, privacy compliance, or OCR accuracy from synthetic
  fixtures.

## Frozen baseline

- base branch: `codex/overnight-cross-surface-eval`;
- fixture: `evals/candidate-momentum-v1.json`;
- release standard:
  `docs/evaluations/overnight-cross-surface-standard-2026-08-05.md`;
- baseline commands: `pnpm eval:core`, `pnpm check`, and `pnpm ios:check`.

Every worktree records the actual base and result commit in its run manifest.

## Worktree ownership

### Plugin implementation

Owns only:

- `plugins/talent-signal/**`;
- `docs/evaluations/overnight/plugin/**` when review artifacts are produced.

It creates a valid repository-local Codex plugin with one skill or bounded
command that evaluates the shared fixture contract. It must not add a
marketplace entry or any external-write capability.

### Web implementation

Owns only:

- `apps/web/**`;
- `docs/evaluations/overnight/web/**` when review artifacts are produced.

It turns the existing workspace into one complete fixture-driven review
transaction while preserving the marketing surface and authentication
boundaries.

### iOS implementation

Owns only:

- `apps/ios/**`;
- `docs/evaluations/overnight/ios/**` when review artifacts are produced.

It turns the current static seeded brief into an explicit fixture/demo review
flow with honest import, evidence, correction, confirmation, and action-preview
states.

### Coordinator and adjudication

Owns only:

- `evals/**`;
- `scripts/evals/**`;
- root evaluation script wiring;
- `plans/2026-08-05-overnight-cross-surface.md`;
- `docs/evaluations/overnight-cross-surface-standard-2026-08-05.md`;
- `docs/evaluations/overnight/final/**`.

The coordinator does not implement surface code. It monitors the worktrees,
requests bounded corrections, integrates finished commits, runs the shared
gate, and produces the final panel.

## Milestones

### 1. Baseline and contract

Pass condition:

- the fixture validator passes;
- current Web and iOS baseline status is recorded;
- all implementation worktrees start from the same commit.

### 2. Independent surface slices

Pass condition:

- every worktree remains inside its ownership boundary;
- all eight cases have deterministic evidence;
- `TS-CORE-01` is directly exercised on the real surface;
- no active hard gate is knowingly hidden.

### 3. Surface review

Pass condition:

- each artifact is frozen at a commit/build;
- required reviewers return contract-valid packets;
- findings cite reproducible code, screenshots, recordings, or test output.

### 4. Integration and morning verdict

Pass condition:

- clean integration of accepted commits;
- shared deterministic suite, Web checks, and iOS checks pass;
- one cross-surface walkthrough uses the same case and meanings;
- active vetoes are either verified resolved or clearly block release;
- the handoff names no more than three highest-leverage remaining findings.

## Autonomous-loop rules

Each agent may inspect, edit within ownership, run local checks, capture
artifacts, commit, and ask another reviewer for read-only critique. It must:

- keep one milestone active;
- choose the safest reversible interpretation when details are missing;
- stop rather than invent authority for an external write;
- preserve a resumable run manifest;
- iterate on failing deterministic or surface checks;
- request direction only when different answers would materially change the
  product boundary.

The coordinator may send follow-up prompts for failed gates. It must not merge
around an active safety veto or average reviewers into consensus.

## Morning decision

Prefer:

1. all three surfaces passing the same core behavior with honest limitations;
2. two complete surfaces and one clearly bounded prototype;
3. one excellent end-to-end slice over three disconnected polished screens.

Reject a visually impressive result that cannot explain whose evidence it
used, what is merely proposed, what the user approved, or whether an effect
actually happened.
