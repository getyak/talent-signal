---
name: engineering-decision-brief
description: Compile repository, product, delivery, incident, or architecture evidence into a sectioned decision brief with a plain-language executive view, an engineering dossier, and exact source links. Use when analyzing project problems or bugs, preparing an upward technical report, explaining what an issue reveals about CI/CD, testing, architecture, product capability, or team workflow, comparing remediation options, or rendering a traceable project-health page.
---

# Engineering Decision Brief

Turn a broad technical question into one decision-oriented knowledge object
that different readers can inspect at different depths without duplicating the
underlying claims.

## Establish the brief

1. State one decision question in ordinary language.
2. Name the primary audience and the decision they can make.
3. Freeze the repository, product, or incident snapshot being assessed.
4. State what is out of scope and what evidence would change the conclusion.
5. For substantial work, create or update the repository execution plan.

Read repository instructions and its smallest relevant canonical documentation
branch before scanning implementation detail. Preserve unrelated worktree
changes.

## Build a claim ledger

Record each material claim as exactly one of:

- **Observation**: directly present in code, tests, runtime behavior, a dated
  artifact, or an authoritative source.
- **Interpretation**: a causal or comparative reading of observations.
- **Recommendation**: a proposed response with a stated tradeoff.
- **Decision**: an accepted choice owned by an authorized human or canonical
  project record.
- **Outcome**: a result observed after an action.

Never let confidence, repetition, model agreement, or polished prose promote
an interpretation into an observation or a recommendation into a decision.

Prefer evidence in this order:

1. behavior observed on the relevant real surface;
2. deterministic checks and focused tests;
3. current code, configuration, schemas, and version-pinned source;
4. accepted decisions and canonical project documentation;
5. dated evaluations and research;
6. working notes and generated analysis.

Use current, official sources for framework or platform claims. Use immutable
commit and line links when a stable remote is available; otherwise use exact
repository paths and line locators. Expose missing, stale, contradictory, and
inaccessible evidence.

## Diagnose at matching levels

Follow the causal ladder only as far as evidence supports it:

```text
visible symptom
→ immediate mechanism
→ enabling system condition
→ capability gap
→ product or organizational consequence
```

Inspect only relevant domains:

- user or product outcome;
- delivery and CI/CD;
- test strategy and feedback quality;
- architecture and recoverability;
- developer workflow and coordination;
- knowledge continuity and decision ownership;
- privacy, authorization, and safety.

Do not pad the brief so every domain appears. Do not turn one local bug into a
strategic transformation without evidence. Separate immediate containment,
system improvement, and longer-term capability investment.

For every active finding, provide:

- a plain-language statement;
- claim type and current status;
- user or delivery impact;
- exact supporting and contradicting evidence;
- important unknowns;
- the smallest proportionate recommendation;
- tradeoffs and rejected alternatives;
- an observable verification condition.

Use attention labels to rank work, never people. Avoid unsupported numeric
scores and generic maturity grades.

## Compile three reading depths

Maintain one claim ledger and compile three projections:

### Executive brief

Answer within one screen:

- What is the conclusion?
- Why does it matter now?
- What should happen next?
- What needs a decision?
- How strong and fresh is the evidence?

Use at most three headline findings. Lead with the answer. Keep framework names
and implementation terminology out of the default reading path.

### Engineering dossier

Explain the causal chain, affected capabilities, options, tradeoffs, staged
response, and verification. Use short sections and comparison structures. Make
each decision-relevant finding link directly to its evidence.

### Evidence trail

Expose source type, locator, snapshot or date, claim supported, authority,
freshness, and relevant excerpt or result. Link to the original artifact
instead of copying it into another narrative.

Do not hide required content inside nested accordions. Prefer stable sections,
separate deep-linkable routes, and optional disclosure only for genuinely
secondary detail.

Read [references/brief-contract.md](references/brief-contract.md) before
creating a persistent brief, typed data model, or Web page.

## Verify the result

Check all of the following:

- A leader can repeat the conclusion, impact, and requested decision after a
  short read.
- An engineer can find the causal mechanism, proposed response, and proof of
  completion without reconstructing the investigation.
- Every material observation resolves to evidence in no more than two steps.
- Contradictions and missing proof remain visible.
- Recommendations are proportionate to the demonstrated problem.
- Current, superseded, resolved, and unknown states are distinguishable
  without relying on color.
- The rendered page works with keyboard navigation, narrow viewports, and
  reduced motion when those surfaces are in scope.
- Relevant repository checks and the real product surface have been verified.

## Route durable learning

Treat the brief as a dated projection, not a new system of record.

- Put stable current judgment in one canonical document.
- Put the rationale for a consequential accepted choice in an ADR.
- Put repeated method in a Skill.
- Put dated observations in research or evaluation.
- Put deterministic behavior and prevention in code, tests, schemas, or CI.
- Remove or mark superseded projections instead of preserving competing truth.

Report the snapshot assessed, the decision the page supports, what remains
uncertain, and the exact checks used to verify the brief.
