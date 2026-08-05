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
  `output/playwright/home-final-production-98.png`;
- full desktop journey:
  `output/playwright/home-desktop-full.png`;
- full mobile dark journey:
  `output/playwright/home-final-mobile-dark-scrolled.png`;
- product section:
  `output/playwright/home-product.png`.

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

- desktop: `output/design-prototypes/redline-a.jpg`;
- mobile: `output/design-prototypes/redline-a-mobile.jpg`.

Exact source occupies the left pane. Proposed state occupies the right. One
vermilion rule binds the two. Removing a clause retracts dependent state and
action.

### Composition B: transcript with margin decisions

Artifacts:

- desktop: `output/design-prototypes/redline-b.jpg`;
- mobile: `output/design-prototypes/redline-b-mobile.jpg`.

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
  `output/playwright/home-redline-production-desktop.jpg`;
- final mobile light first viewport:
  `output/playwright/home-redline-production-mobile.jpg`;
- final mobile dark first viewport:
  `output/playwright/home-redline-mobile-dark.jpg`;
- evidence-retracted desktop state:
  `output/playwright/home-redline-evidence-retracted.jpg`;
- fact/action decision boundary:
  `output/playwright/home-redline-principles-v2.jpg`;
- versioned-state section:
  `output/playwright/home-redline-method.jpg`;
- revised two-column research rhythm:
  `output/playwright/home-redline-research.jpg`;
- revised stacked questions rhythm:
  `output/playwright/home-redline-questions-v3.jpg`;
- revised 2 × 3 mobile history:
  `output/playwright/home-redline-mobile-history-grid.jpg`;
- CSS-pruned mobile first viewport:
  `output/playwright/home-redline-css-pruned-mobile.jpg`.

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
6. Full-page inspection exposed two later-page rhythm defects: an empty lazy
   research image and another repeated left-copy/right-content split. Research
   is now a compact two-story field and Questions uses a stacked introduction
   over the FAQ.
7. The six-step mobile history is now a 2 × 3 matrix, reducing excessive
   vertical repetition without changing its chronological reading order.

## 2026-08-06 rhythm and depth pass

This pass began from new rendered artifacts rather than the earlier design
judgment:

- final desktop first viewport:
  `output/playwright/home-refined-2026-08-06-desktop.jpg`;
- final stacked Questions section with one visible answer:
  `output/playwright/home-refined-2026-08-06-questions.jpg`;
- current mobile first viewport:
  `output/playwright/home-redline-css-pruned-mobile.jpg`;
- current dark mobile first viewport:
  `output/playwright/home-redline-mobile-dark.jpg`;
- evidence-retracted state:
  `output/playwright/home-redline-evidence-retracted.jpg`.

Full-page inspection showed a desktop-only rhythm problem that was not visible
in the fixed first viewport. History, Research, and Questions consumed more
vertical space than their content justified, making the later page feel like a
sequence of equally sparse canvases.

The after screenshot provides three relative improvements:

1. Desktop section spacing is tighter without compressing the 390-pixel
   layout.
2. Questions keeps the stacked introduction that breaks the page's repeated
   left-copy/right-content rhythm. The first answer is visible by default, so
   the section shows an actual trust boundary rather than four closed prompts.
3. The interactive workbench and decision ledger gain a restrained,
   background-tinted depth treatment on desktop. Mobile removes the shadow so
   the narrow layout remains crisp and avoids unnecessary paint.

The 390-pixel after capture reports equal document and viewport widths. Dark
mode preserves the same hierarchy, and retracting the remote-work clause still
changes the dependency to clarification before the decision deadline.

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
- the final CSS-pruned production Lighthouse run reports Performance 96,
  Accessibility 100, Best Practices 100, SEO 100, 1.0 s FCP, 2.7 s LCP,
  60 ms TBT, and zero CLS;
- homepage global CSS fell from 150,974 bytes to 118,140 bytes (about 21.7%);
  Lighthouse now reports zero bytes of unused CSS for the audited page, down
  from about 14 KiB before the pruning pass;
- the 2026-08-06 production run reports Performance 97, Accessibility 100,
  Best Practices 100, SEO 100, 0.9 s FCP, 2.5 s LCP, 10 ms TBT, zero CLS,
  and zero bytes of unused CSS.

The latest production report is
`output/playwright/lighthouse-home-refined-2026-08-06.json`.

## Honest unresolved evidence

The public page still cannot claim customer trust it does not possess. There
are no authorized customer logos, verified testimonials, case studies, or
measured outcome claims in the repository. The page therefore uses product
mechanism and explicit control boundaries as trust evidence and does not invent
social proof.

The sample candidate scenario is synthetic product demonstration content. It
proves interaction behavior, not market adoption or customer outcomes.
