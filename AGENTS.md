# Talent Signal

Build quiet, evidence-first relationship intelligence for independent
recruiters. Optimize for trustworthy momentum, not feature volume or agent
theater.

## Start here

Read [`docs/README.md`](docs/README.md) and follow its task-based routing. Do not
front-load every document.

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

## Working agreements

- Inspect the existing state and preserve unrelated user changes.
- Define the outcome, boundaries, and verification before broad edits.
- Keep one task focused on one coherent outcome; isolate independent write work.
- Verify behavior from the user's surface whenever practical, not only from
  successful commands.
- When a correction reveals a repeated failure, use
  `$project-knowledge-steward` to encode the learning at the narrowest durable
  layer.

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

Run the narrowest relevant checks, then `pnpm docs:check` for documentation
changes. Before handoff, inspect the diff and test ambiguity, no-action,
failure, stale state, retry, recovery, and deletion paths when they are in
scope.
