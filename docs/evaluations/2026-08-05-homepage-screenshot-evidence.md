# Homepage screenshot evidence review

Date: 2026-08-05

## Evaluation contract

This review does not assign an absolute taste score. Design judgments come from
fixed-viewport browser screenshots of the rendered page, a pairwise direction
comparison, and one visible interaction state. Functional checks remain
separate from design judgment.

The external critique supplied for this review rated an earlier public page
5.8/10 and identified five material problems: an empty first viewport, unclear
category language, conceptual rather than product proof, missing trust
evidence, repetitive section rhythm, and mobile clipping.

## Current baseline evidence

Rendered baseline artifacts:

- desktop light first viewport:
  `output/playwright/home-baseline-light-desktop.png`;
- desktop dark first viewport:
  `output/playwright/home-baseline-evidence-desktop.png`;
- 390 × 844 mobile first viewport:
  `output/playwright/home-baseline-mobile-390.png`;
- candidate-library section:
  `output/playwright/home-baseline-mid-1.png`;
- evidence-image section:
  `output/playwright/home-baseline-mid-2.png`.

The current baseline screenshots contradict two stale findings in the supplied
critique: the 390-pixel page has no horizontal clipping, and its first useful
content starts immediately below the header. Those issues had already been
fixed.

The screenshots support the deeper critique:

- the first viewport uses a familiar headline-left, product-card-right SaaS
  composition;
- the product card displays a result but does not make the source-to-state
  causal chain visible;
- the candidate library returns to generic CRM category grammar;
- the large still-life image represents evidence symbolically rather than
  proving a product behavior;
- later sections repeat large heading, explanation, and contained visual with
  limited tempo change.

## Direction tree

### Product invariant

- Visitor: an independent recruiter responsible for a high-value candidate
  relationship between conversations.
- Tension: a competing offer, decision window, and unresolved client-owned
  dependency may cause a strong candidate to disappear between notes.
- Required understanding: exact source evidence proposes a relationship
  change; the recruiter can correct it; action requires a separate decision.
- Ownable truth: source, proposed state, confirmed state, action approval, and
  observed outcome remain distinct in one governed relationship record.

### Brand theorem

The Redline won over The Decision Window. A redline makes provenance,
correction, and human disposition visible without turning urgency into a
countdown or a person into a score.

### Architecture

One governed conversation won over a persistent workbench. The broader
workbench re-entered CRM grammar before proving the product wedge.

### Composition A: split evidence ledger

Artifacts:

- desktop: `output/playwright/prototype-redline-a-desktop.png`;
- mobile: `output/playwright/prototype-redline-a-mobile.png`.

Exact source occupies the left pane. Proposed state occupies the right. One
vermilion rule binds the two. Removing a clause retracts dependent state and
action.

### Composition B: transcript with margin decisions

Artifacts:

- desktop: `output/playwright/prototype-redline-b-desktop.png`;
- mobile: `output/playwright/prototype-redline-b-mobile.png`.

The transcript is the dominant object and proposals appear as editorial margin
notes aligned to their clauses.

### Pairwise result

Values range from -2 to +2 and compare A against B. They are relative evidence,
not an absolute design score.

| Criterion | Weight | A vs B | Screenshot evidence |
| --- | ---: | ---: | --- |
| Ownability | 25 | +1 | A's continuous source/change rule remains product-specific without the logo; B can read as a publication annotation system |
| Product truth | 25 | +2 | A shows old value, proposed value, dependency, and review boundary in one scan |
| Five-second clarity | 15 | +1 | A names candidate momentum and exposes the state transition sooner |
| Structural distinction | 15 | +1 | Both depart from card-wall SaaS; A turns the entire first viewport into one causal instrument |
| Emotional precision | 10 | +1 | A feels controlled and operational; B's serif voice adds editorial drama not required by the product |
| Feasibility | 5 | +1 | A maps directly onto the existing evidence toggle and insight logic |
| Accessibility and performance risk | 5 | +1 | A keeps a simpler reading order and collapses source before changes on mobile |

Composition A is implemented. Composition B remains the credible challenger if
future user preference favors a more editorial reading experience.

## Implemented screenshot evidence

- final desktop first viewport:
  `output/playwright/home-redline-refined-desktop.png`;
- final mobile light first viewport:
  `output/playwright/home-redline-refined-mobile.png`;
- final mobile dark first viewport:
  `output/playwright/home-redline-refined-mobile-dark.png`;
- evidence-retracted desktop state:
  `output/playwright/home-redline-retracted-desktop.png`;
- fact/action decision boundary:
  `output/playwright/home-redline-decision-boundary.png`;
- versioned-state section:
  `output/playwright/home-redline-current-mid-1.png`;
- counterfactual section:
  `output/playwright/home-redline-current-mid-2.png`.

Visible changes proven by these artifacts:

1. The first viewport now names the category, states one ownable theorem, and
   exposes a real interactive mechanism rather than a symbolic graphic.
2. Switching off the remote clause visibly retracts its proposed state and
   revises the next action from policy confirmation to clarification.
3. The generic recruiter photograph is replaced by a two-gate decision
   artifact that separates fact confirmation from external-action authority.
4. Mobile preserves a strict source, proposed change, then approval reading
   order with equal document and viewport widths.
5. Dark mode preserves the same hierarchy and restrained vermilion semantics.

## Functional gate

The visual direction is not proof of functional quality. Current independent
evidence:

- every evidence clause is a native button with pressed state and visible
  keyboard focus;
- 390 × 844 browser inspection reports equal scroll and viewport widths;
- light and dark screenshots preserve hierarchy and state semantics;
- evidence removal updates state and action together in the rendered page;
- fact confirmation leaves the external-action control disabled;
- lint, typecheck, all 43 tests, production build, and documentation checks
  pass;
- production Lighthouse reports Performance 96, Accessibility 100, Best
  Practices 100, SEO 100, 1.2 s FCP, 2.8 s LCP, 60 ms TBT, and zero CLS.

The production report is
`output/playwright/lighthouse-home-redline-production-final.json`.

## Honest unresolved evidence

The public page still cannot claim customer trust it does not possess. There
are no authorized customer logos, verified testimonials, case studies, or
measured outcome claims in the repository. The page therefore uses product
mechanism and explicit control boundaries as trust evidence and does not invent
social proof.

The sample candidate scenario is synthetic product demonstration content. It
proves interaction behavior, not market adoption or customer outcomes.
