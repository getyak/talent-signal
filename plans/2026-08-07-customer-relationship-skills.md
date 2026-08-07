# Customer relationship skills

Status: complete
Owner: Codex
Started: 2026-08-07

## Outcome

Talent Signal has five source-governed, person-inspired skills that review
customer relationship evidence without turning the product into a generic CRM,
sales autopilot, or person-scoring system.

The skills cover:

1. customer progress and switching dynamics;
2. trust continuity and repair;
3. discovery quality and meaningful advances;
4. buying-group alignment and unresolved consensus;
5. recurring customer impact across sales and post-sale work.

## Why it matters

The existing relationship foundation already preserves a person across distinct
assignment and client contexts. Sales and customer work need the same temporal,
evidence-first discipline, but add multi-stakeholder decisions, commercial
commitments, implementation, renewal, and expansion.

## In scope

- create five project-local skills under `.agents/skills/`;
- provide one narrow review workflow and independent rubric per skill;
- preserve public-source lineage, modeling limits, commercial-method caveats,
  and non-impersonation boundaries;
- create Codex UI metadata for each skill;
- validate skill structure and repository documentation.

## Out of scope

- implementing sales product behavior, storage, UI, connectors, or CRM writes;
- sending customer messages or updating external systems;
- copying books, courses, diagnostics, certification content, or proprietary
  templates;
- predicting close probability, customer worth, personality, honesty, trust,
  influence, or churn from conversational style;
- creating one universal customer-health score;
- adding the skills to a multi-reviewer runtime before real-task evaluation.

## Current evidence

- `docs/product.md` already organizes truth around a person within a scoped
  relationship or assignment and separates evidence, confirmed state,
  interpretation, action, and outcome.
- `docs/principles.md` treats relationship momentum as dependency resolution and
  requires human approval before consequential action.
- Existing person-inspired skills use a compact `SKILL.md` plus
  `persona-profile.md`, `rubric.md`, `sources.md`, and `agents/openai.yaml`.
- Public first-party material is available for Bob Moesta and The Re-Wired
  Group, Charles H. Green and Trusted Advisor Associates, Neil Rackham and
  Huthwaite International, Brent Adamson/Matt Dixon and Challenger, and Jacco
  van der Kooij and Winning by Design.

## Chosen approach

Create five peer review lenses rather than one broad sales methodology skill:

- `customer-progress-evidence`
- `customer-trust-continuity`
- `customer-discovery-advance`
- `buying-group-consensus`
- `recurring-customer-impact`

Use public professional methods as review lenses, not personas. Keep detailed
lineage and score anchors in references so the triggering metadata and active
instructions remain concise.

Reject a general `sales-coach` skill because it would mix distinct decisions,
encourage generic advice, and obscure abstention and safety boundaries.

## Milestones

### 1. Contracts and source boundary

Status: complete

- define the unique question, inputs, outputs, abstention gate, and vetoes for
  each skill;
- verify primary public sources and authorship;
- identify overlap and route each decision to one lens.

Evidence:

- each skill has a non-overlapping one-sentence purpose;
- every named method has a public source and a modeling limit.

### 2. Skill implementation

Status: complete

- initialize each skill with the project-standard generator;
- write `SKILL.md`, persona profile, rubric, sources, and UI metadata;
- keep imperative instructions and progressive disclosure.

Evidence:

- all expected files exist;
- no placeholder or unused file remains.

### 3. Validation and review

Status: complete

- run `quick_validate.py` for every skill;
- inspect triggering descriptions, source links, cross-skill overlap, and
  prohibited inferences;
- run `pnpm docs:check`;
- review the final diff without disturbing unrelated work.

Evidence:

- all five structural validations pass;
- documentation checks pass;
- each skill can abstain and prohibits unsupported person or deal scoring.

Completed evidence:

- `quick_validate.py` passed for all five skill directories.
- No template TODOs, empty files, trailing whitespace, or missing UI invocation
  prompts remain.
- Each directory contains exactly `SKILL.md`, `agents/openai.yaml`, and the
  three intended reference files.
- `pnpm docs:check` passed, including canonical-document, Wiki, and
  architecture-diagram checks.
- An evidence-safety review confirmed that every skill preserves identity,
  speaker, source, time, initiative, purpose, authorization, expiry,
  correction, retraction, and deletion; requires separate approval for
  external effects; and vetoes its relevant unsupported scores and inferences.

## Completion evidence

The work is complete when:

- five validated skills exist in `.agents/skills/`;
- each has a narrow workflow, evidence rules, rubric, public source map,
  modeling limits, vetoes, and UI metadata;
- the set covers pre-sale through recurring impact without duplicate ownership;
- no skill grants execution authority or converts model interpretation into
  customer truth;
- repository documentation checks pass;
- remaining uncertainty is limited to forward-testing on authorized or
  synthetic customer artifacts.

## Decisions that could change the direction

- real customer artifacts show that two lenses are indistinguishable in use;
- the product chooses a narrower pre-sale-only or post-sale-only segment;
- source licensing or trademark guidance requires narrower terminology;
- evaluation shows that a framework creates seller pressure or unsupported
  person labels despite the guardrails.

## Remaining uncertainty

The skills have not yet been independently forward-tested on real customer
artifacts. Use synthetic or explicitly authorized examples first, then compare
overlap, abstention, and finding usefulness before adding them to a combined
runtime.
