# Talent Signal Evaluation v2

This directory is the repository-owned, vendor-neutral source for the initial
evaluation-first case bank. It contains 36 synthetic scenarios:

- 6 capture and perception cases;
- 8 identity cases;
- 6 temporal-memory cases;
- 8 agent-trajectory cases;
- 8 proposal, action, and recovery cases.

The cases are dense regression evidence, not a claim that 36 examples represent
production traffic. They score Talent Signal behavior and recruiter workflow;
they never score a candidate.

## Authority and materialization

`scenarios/` contains semantic scenario documents. A scenario references, but
does not embed, three physically separate fixtures:

1. `fixtures/model-inputs/` is the only case material a model-visible builder may
   resolve.
2. `fixtures/initial-state/` is injected by the runner and remains product-owned
   state, not model ground truth.
3. `fixtures/oracles/` is evaluator-only expected behavior. It must never be
   loaded into a prompt, tool result, or model-visible trace input.

`profiles/` declares the execution mode, the actual system under test, frozen
dependencies, live dependencies, and budgets. A scenario therefore contains no
tool mode and can run through more than one compatible profile.

`suites/` contains only `evaluation-suite.v1` documents so registry discovery
cannot confuse a mapping with a runnable suite. `mappings/` separately contains
the eight-case legacy adaptation matrix and the twelve existing P0 journey
oracle landing points.

`rubrics/` contains versioned deterministic, human, model, and outcome criteria.
`review/` binds human-feedback labels to the repository rubric, documents the
review boundary, and defines explicit adjudication. Imported annotations remain
unreviewed proposals until that adjudication creates a human-gold record.

The repository scenario and the local deterministic gate remain authoritative.
An external experiment system may receive only a policy-approved projection.

## Digests

Every reference uses a repository-relative path and `sha256:<hex>` content
identity. Fixture digests are calculated from canonical JSON (UTF-8, recursively
sorted object keys, arrays preserved). A document's own `contentDigest` is
calculated with that field omitted. Whitespace and object-key order therefore do
not change semantic identity.

## Dataset axes

The following axes are deliberately independent:

- lifecycle: `draft`, `active`, or `retired`;
- adjudication: `unreviewed`, `human_gold`, or `disputed`, derived from atomic
  criterion decisions rather than assigned to a Scenario by assertion;
- partition: mutually exclusive `p0`, `dev`, `held_out`, or `red_team`;
- data class: `synthetic_shareable` or `synthetic_restricted` in this initial
  bank.

Each atomic adjudication names the criterion, reviewer decision, evidence
locator, and time. A Scenario is `human_gold` only when every adjudicable
criterion has that evidence; mixed or incomplete review remains `unreviewed`,
and any unresolved conflict is `disputed`. This initial synthetic bank is
truthfully `unreviewed` because no named human gold was fabricated. Held-out,
red-team, and P0 oracle files remain evaluator-only.

`initial-coverage-36` is an inventory across the four partitions, not a
development set. `p0-release` contains only the disjoint `p0` partition. The
repository scan rejects cross-partition scenario IDs, content or fixture
digests, source lineage, and conservative semantic near-duplicates.

## Safety rules

- P0 and P1 scenarios have explicit forbidden outcomes.
- A model judge is informational only and has no P0 authority.
- A missing credential is `not_run`, never `pass`.
- A P0 deterministic pass without required recruiter-workflow evidence is
  `needs_review`, never a claim of workflow usefulness or field readiness.
- `pass` means every required evaluator is present; it is not an aggregate
  score and cannot be inferred from an Opik feedback average.
- A profile is invalid if a frozen dependency replaces a declared system under
  test.
- A Scenario may run only through an explicitly declared compatible Profile.
- No fixture contains a real name, email, phone number, account slug, private
  screenshot, resume, absolute local path, secret, or hidden chain-of-thought.
- Effects are proposals unless an independent executor receives exact current
  approval and verifies destination readback.
