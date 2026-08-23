# Brief contract

Use this contract when a decision brief will persist as structured data,
documentation, a Web page, or an exported report.

## Content object

```text
Brief
├── id, title, question, audience
├── snapshot, status, freshness, scope, exclusions
├── conclusion, significance, recommendation, decision_request
├── headline_finding_ids[]
├── findings[]
├── options[]
├── actions[]
├── outcomes[]
└── evidence[]
```

`status` is one of `draft`, `reviewed`, `accepted`, `superseded`, or
`archived`. A rendered page does not advance the status.

## Finding

```text
Finding
├── id
├── title
├── statement
├── kind: observation | interpretation | recommendation | decision | outcome
├── state: active | needs_evidence | resolved | superseded
├── attention: now | next | watch
├── impact
├── evidence_ids[]
├── counterevidence_ids[]
├── unknowns[]
├── implication
├── recommendation
├── tradeoffs[]
└── verification
```

Use `attention` to order work. It is not a severity judgment about a person,
team, or author.

## Evidence reference

```text
EvidenceRef
├── id
├── type: runtime | test | code | config | decision | canonical | evaluation | research
├── title
├── locator
├── snapshot_or_date
├── supports[]
├── authority
├── freshness: current | dated | stale | unknown
├── summary
└── limitations[]
```

Use commit-pinned remote URLs when the repository and revision are available.
For local-only output, use repository-relative paths plus line or section
locators and render them as links only when the target environment can resolve
them.

## Executive projection

Render in this order:

1. Snapshot and review state.
2. One-sentence conclusion.
3. Why it matters now.
4. At most three headline findings.
5. One recommended sequence.
6. One explicit decision request or `No decision required`.
7. Evidence coverage and known limits.

Do not place inventories, framework names, file paths, scores, or long option
tables above the first depth break.

## Dossier projection

Render stable, deep-linkable sections:

1. What is working and should be preserved.
2. Active findings ordered by attention.
3. Causal chain for each finding.
4. Options and tradeoffs.
5. Staged action sequence.
6. Verification plan.
7. Reconsideration signals.

Keep observation, interpretation, and recommendation labels visible in text,
not only through color or icons.

## Evidence projection

Group evidence by the claim it supports, not only by file type. Show source,
snapshot, authority, freshness, summary, limitations, and an exact locator.
Preserve contradictory evidence next to the claim.

## Language rules

- Use ordinary language at the executive depth.
- Define technical terms at first use in the dossier.
- Use exact implementation names only in the evidence depth.
- Prefer a sectioned editorial rhythm over a grid of equally weighted cards.
- Use diagrams only for a causal, temporal, or ownership relationship that is
  harder to understand in prose.

## Quality gates

Reject or return the brief to draft when:

- a headline observation has no evidence reference;
- an interpretation is written as a confirmed fact;
- a recommendation has no verification condition;
- an accepted decision lacks an owner or canonical record;
- a raw source is copied without authorization or provenance;
- a stale or superseded source is presented as current;
- the executive projection requires the evidence projection to be understood;
- the page duplicates a canonical claim instead of linking to its owner.
