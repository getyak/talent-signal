# Root Redline Design

## Outcome

Replace the polished but generic homepage narrative with an ownable product
argument: one recruiter-controlled conversation becomes a source-linked,
correctable relationship change and one separately approved action.

## Boundary

In scope: homepage proposition, information architecture, production copy,
signature interactive proof, responsive composition, visual system, and
verification.

Out of scope: route changes, authentication behavior, workspace contracts,
candidate scoring, or any new external write.

Existing uncommitted work is preserved as the starting state. The branch also
remains compatible with the one remote-only iOS fix on `origin/main`.

## Current evidence

- The current first viewport is polished and functional.
- About 655 changed CSS lines sit above only about 39 changed homepage lines.
- The hero and later sections still use a familiar editorial SaaS grammar.
- The live brief proves interactivity, but not the product's full causal chain.
- Stock and generated imagery symbolize trust instead of proving it.
- A self-authored taste score is not valid evidence of ownability.

## D0 product invariant

- Visitor: an independent recruiter carrying a high-value candidate
  relationship between conversations.
- Tension: a candidate has another offer, a decision deadline, and an
  unresolved remote-work dependency controlled by the client.
- Understand: the product preserves exactly what was said and shows how each
  source changes current understanding.
- Feel: in control of a consequential relationship, not managed by an AI
  command center.
- Do: try one conversation, inspect the evidence, and decide what may advance.
- Ownable truth: Talent Signal separates source evidence, proposed state,
  recruiter confirmation, action approval, and observed outcome in one
  continuous relationship record.

## D1 brand theorem fork

### The Redline

- Position: every meaningful conversation proposes a redline to the current
  relationship record.
- Metaphor: a governed document revision.
- Spatial grammar: source on one side, proposed change on the other, connected
  by one consequential vermilion line.
- Signature mechanic: remove one source clause and the proposed state and next
  action visibly retract.
- Anti-reference: must not resemble a candidate CRM dashboard.

### The Decision Window

- Position: momentum is the dependency that must resolve before a real decision
  window closes.
- Metaphor: a temporal case file.
- Spatial grammar: deadline and dependency lead; evidence recedes into a
  longitudinal path.
- Signature mechanic: changing the deadline or controller reshapes the smallest
  safe next step.
- Anti-reference: must not resemble a pipeline funnel or urgency countdown.

`The Redline` leads because it makes provenance and human control visible
without the logo. `The Decision Window` remains the challenger.

## Reference mechanisms

- GitHub review: a proposed change remains adjacent to exact source context and
  requires human disposition.
- Granola: enhanced notes retain access to the underlying transcript and make
  human versus generated contribution legible.
- Attio: a record keeps activity history beside current state.
- Figma Dev Mode: annotations preserve intent in the same inspection surface as
  the artifact.
- Linear: activity history makes changes inspectable without becoming the
  primary object.

These are mechanism references, not visual identities to copy.

## D2 architecture fork

### A. One conversation, one governed redline

1. State the category-specific theorem.
2. Let the visitor manipulate exact source clauses.
3. Show proposed relationship state beside the source.
4. Reveal the unresolved dependency and its controller.
5. Separate fact confirmation from action approval.
6. Show the counterfactual: removed evidence retracts the proposal.
7. Continue into a compact observed-to-outcome history.
8. End with one trial action.

### B. Persistent recruiter workbench

1. Open on the candidate library.
2. Select a person and assignment.
3. Inspect evidence, relationship state, and activity across tabs.
4. Demonstrate multiple views of the same record.

Architecture A wins. Architecture B is broader but re-enters CRM category
grammar before proving the wedge.

## D3 composition fork

### A. Split evidence ledger

The exact conversation occupies the left side. Proposed state and the smallest
safe action occupy the right. A single vertical redline binds clauses to
changes.

### B. Transcript with margin decisions

The transcript is the dominant reading surface. Proposed changes appear as
editorial margin notes aligned to the exact clauses that caused them.

Render both at identical desktop dimensions. Compare ownability, five-second
clarity, product-mechanic visibility, and mobile collapse. Implement the winner
and preserve the other as the credible challenger.

### Rendered comparison

`Split evidence ledger` wins the homepage fork.

| Criterion | Relative result | Falsifiable reason |
| --- | ---: | --- |
| Ownability | A +2 | Hiding the wordmark still leaves one vertical redline binding source and governed state change. |
| Product truth | A +1 | Before and after state is visible beside the clause that caused it. |
| Five-second clarity | A +1 | Source, proposed change, and review requirement appear in one scan. |
| Structural distinction | A +1 | The causal seam organizes the whole viewport instead of decorating one annotation. |
| Emotional precision | Tie | Both feel controlled and evidence-led. |
| Feasibility | Tie | Both fit the existing Next.js and client-island architecture. |
| Accessibility and performance risk | Tie | Both collapse to source first and avoid scroll-bound JavaScript. |

The transcript-margin challenger has stronger long-form reading rhythm and may
fit a future candidate detail surface. On the homepage it resembles a premium
meeting-note product before it reveals Talent Signal's separate state and
action governance.

Rendered evidence:

- `output/design-prototypes/redline-a.jpg`
- `output/design-prototypes/redline-a-mobile.jpg`
- `output/design-prototypes/redline-b.jpg`
- `output/design-prototypes/redline-b-mobile.jpg`

## Implementation constraints

- Keep `/`, `/demo`, `/login`, `/workspace`, and existing anchors stable.
- Keep the current brand mark, one vermilion accent, system theme toggle, and
  Phosphor icon family.
- Server Components remain the default. Interactivity stays in one client leaf.
- The homepage contains no candidate scores, confidence bars, or implied
  autonomous action.
- Motion only explains evidence removal, state retraction, and review progress.
- Mobile collapses source, proposed state, and approvals into a strict reading
  order.

## D4 system

- Native CSS and the existing type stack preserve the current application
  architecture.
- Warm neutrals carry the reading field; one vermilion accent marks only the
  causal boundary and consequential attention.
- The central redline organizes the source and proposal rather than decorating
  the page.
- Information structure stays sharp and editorial. Depth comes from hierarchy,
  evidence adjacency, and state change rather than glass, glow, or card volume.
- Motion intensity remains low and explains only hover, evidence removal,
  state retraction, and review progress.

## D5 detail

Micro-detail was added only after the structural fork was decided:

- clause buttons expose pressed and keyboard-focus states;
- proposed values change in place when supporting evidence is removed;
- fact confirmation and external-action approval remain separate controls;
- mobile preserves source before interpretation before authority;
- reduced-motion mode removes non-essential transitions.

## Completion evidence

- Before, A, B, final desktop, final mobile, and dark-mode screenshots.
- Logo-off comparison of A and B.
- Evidence removal changes both proposed state and next action.
- Fact confirmation and action approval remain visibly separate.
- Keyboard, reduced-motion, overflow, lint, typecheck, tests, build, and docs
  checks pass.

## Final status

Completed on 2026-08-05.

- Production direction: Split evidence ledger.
- Credible challenger retained: transcript with margin decisions, suitable for
  a future candidate-detail surface.
- Production desktop:
  `output/playwright/home-redline-production-desktop.jpg`.
- Production mobile:
  `output/playwright/home-redline-production-mobile.jpg`.
- Removing the remote-work clause retracts its proposed state and revises the
  next action to clarification before the decision deadline.
- Fact confirmation does not grant external-action authority.
- `pnpm lint`, `pnpm typecheck`, all 43 tests, `pnpm build`, and
  `pnpm docs:check` pass.
- The prior self-authored 98 design score is superseded. Functional measurements
  remain evidence of release quality, not proof of taste or user preference.
