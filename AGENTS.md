# Talent Signal

Build quiet, evidence-first relationship intelligence for independent
recruiters. Optimize for trustworthy momentum, not feature volume or agent
theater.

## Retrieve context

Read [`docs/README.md`](docs/README.md) and follow its task-based routing. Do not
front-load every document or ask the user to repeat context the repository can
provide.

For substantial or uncertain work, use [`PLANS.md`](PLANS.md). Review completed
work through [`REVIEW.md`](REVIEW.md).

## Product invariants

- Treat candidate conversations and screenshots as sensitive, purpose-bound
  evidence.
- Keep observed evidence, confirmed state, interpretation, action, and outcome
  distinct.
- Require a human decision before consequential external writes.
- Preserve identity, provenance, time, scope, and reversibility.
- Rank work attention, never a person's worth, personality, protected traits,
  culture fit, or acceptance probability.
- Prefer one smallest useful next step over a broad autonomous plan.
- A generated page, summary, or memory is never execution authority.

## Default loop

1. Define one outcome, its boundaries, and observable proof of completion.
2. Inspect the existing state, retrieve only relevant context, and preserve
   unrelated user changes.
3. Expose unknowns, then choose the smallest complete slice that can test the
   direction.
4. Work until evidence demonstrates the outcome, not merely until edits exist.
5. When evidence invalidates the approach, stop and re-plan instead of stacking
   patches.
6. Before handoff, inspect the result, record remaining uncertainty, and route
   any durable learning.

## Compound learning

Treat a correction as a possible system defect, not only a prompt adjustment.
Fix the instance first. When the failure is repeated or consequential, use
`$project-knowledge-steward` to encode the narrowest durable prevention:

- prefer a test, check, schema, or tool for deterministic behavior;
- use a Skill for a reusable method;
- reserve `AGENTS.md` for repository-wide invariants and recurring gotchas.

Add a way to verify the prevention and remove superseded guidance. Do not grow
always-on context after one ambiguous incident.

## Long and parallel work

- Keep resumable progress in plans and inspectable artifacts, not only in chat.
- Isolate independent write work with worktrees or non-overlapping ownership.
- Never let multiple agents mutate the same source or external state; keep one
  owner for synthesis and final verification.
- More time or agents does not broaden authorization, evidence access, or the
  definition of done.

## Documentation

- Keep canonical repository documentation in English; conversation may follow
  the user, and source research may preserve its original language when that
  improves fidelity.
- Foundational docs express stable decisions and judgment, not implementation
  inventories, API shapes, parameters, or code walkthroughs.
- Put reusable method in a Skill, decision rationale in an ADR, temporary state
  in a plan, and executable detail in code, tests, schemas, or tooling.
- Maintain one canonical home for each claim and link to it instead of
  repeating it.
- Follow [`docs/documentation.md`](docs/documentation.md).

## Verification

A successful edit, model response, connector call, or build is not the outcome.
Verify the state that matters from the user's surface whenever practical.

Run the narrowest relevant checks, then `pnpm docs:check` for documentation
changes. Inspect the diff before handoff. When relevant, test ambiguity,
no-action, failure, stale state, retry, recovery, and deletion paths.
