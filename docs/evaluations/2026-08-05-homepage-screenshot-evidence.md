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

## 2026-08-06 interaction and story-proof pass

This pass tested whether the live product mechanism was discoverable and
whether the section immediately after it continued the same scenario instead
of returning to abstract principles.

The before state underlined source clauses but placed the instruction at the
bottom of a tall source pane. In the after screenshot, the instruction sits
directly below the source quote and says that an underlined phrase is
selectable. Each native clause button also references that instruction through
`aria-describedby`.

The earlier history section described six generic governance states. The after
screenshots keep the same compact desktop row and 2 × 3 mobile matrix but make
every entry part of the same clearly labeled synthetic Leila scenario:
observed deadline, proposed pressure, unresolved preference, recruiter
confirmation, separate policy request, and a possible reply returning as new
evidence. This improves product-mechanic visibility without presenting
synthetic content as customer proof.

Evidence removal also remounts only the current-dependency callout with a
240 ms opacity and 4-pixel vertical transition. The motion communicates a
causal state change, and the existing reduced-motion media query keeps it
static when reduced motion is preferred.

## 2026-08-06 conversion-integrity pass

This pass tested whether the public calls to action described their actual
destination and whether mobile visitors could distinguish account access from
a new access request.

Before the change, the hero's `Request access` control led to the workspace
sign-in route, and the open mobile menu offered `Sign in` as its only primary
action. The after screenshots preserve sign-in as an ordinary account action
and add a separate vermilion `Request access` action. Every access-request link
now opens a pre-addressed email draft to `hello@talentsignal.ai`; it does not
send a message or perform an external write automatically.

The closing section now keeps the two intentions explicit at both desktop and
mobile widths: `Try one conversation` opens the reversible synthetic demo, and
`Request access` opens the email draft. The mobile controls stack to full width
while the desktop controls remain adjacent.

Source and production-build inspection confirm that every `Request access`
instance resolves to the same mail link while `Sign in` remains
`/login?callbackUrl=/workspace`. The final Vercel preview deployment completed
successfully.

## 2026-08-06 type, material, and sequence pass

This pass compared the current first viewport and relationship-history section
at fixed desktop and 390-pixel mobile viewports. It did not use a numerical
taste score.

The desktop before capture showed a recognizable composition, but the headline
letterforms were packed tightly enough to compete with the evidence panel, and
the large panel read as a flat outlined container. The after capture slightly
reduces the display scale, loosens tracking and line height, narrows the
intro-column gap, and gives the workbench a restrained highlight plus
multi-stage shadow. The hierarchy remains headline first, product mechanism
second; the material treatment is not used as decoration elsewhere.

The history section previously relied on one dark rule and six equal text
columns. The after capture adds ordered `01`–`06` evidence steps and short
vermilion rule segments at the actual column origins. These marks expose the
sequence without adding another card family or changing the content. At
390 pixels the same system collapses to a 2 × 3 matrix, preserves legible cell
spacing, and reports equal document and viewport widths.

Screenshot evidence:

- before desktop:
  `output/playwright/home-refined-2026-08-06-desktop.jpg`;
- after desktop:
  `output/playwright/home-granularity-after-desktop.png`;
- after history:
  `output/playwright/home-granularity-after-history-desktop.png`;
- after mobile:
  `output/playwright/home-granularity-after-mobile.png`;
- after mobile history:
  `output/playwright/home-granularity-after-history-mobile.png`;
- after mobile dark mode:
  `output/playwright/home-granularity-after-mobile-dark.png`.

The dark-mode capture preserves headline, action, border, evidence underline,
and panel-surface contrast. Motion remains limited to causal state changes and
button feedback; this pass did not add ambient or scroll animation.

## 2026-08-06 full-page rhythm pass

This pass used a 1440-pixel full-page screenshot to evaluate page tempo rather
than judging another isolated first viewport. The capture showed that the
evidence, retraction, and decision-boundary sections formed a distinct causal
sequence, but the Research, Questions, and Closing sections returned to three
successive large-heading-and-whitespace compositions. The strongest visible
drop occurred in Research.

Two structural branches were considered:

1. Keep Research and Questions separate, then turn Research into an editorial
   index with a fixed method introduction and evidence-like article rows.
2. Merge Research and Questions into one knowledge section.

The first branch won the rendered comparison because it changes the layout
family without weakening Questions as a dedicated trust boundary. The earlier
Research capture placed the introduction above two equal article columns and
left most of the upper viewport empty. The after capture places the method
introduction in the left column and uses the right side for two stacked rows.
Each row separates metadata, proposition, explanation, and action into an
inspectable editorial structure.

Pairwise evidence:

- before full desktop:
  `output/playwright/home-rhythm-before-full-desktop.png`;
- before Research crop:
  `output/playwright/home-rhythm-before-research-desktop.png`;
- after Research:
  `output/playwright/home-rhythm-after-research-desktop.png`;
- after full mobile:
  `output/playwright/home-rhythm-after-full-mobile.png`.

The 390-pixel full-page screenshot shows an explicit single-column fallback
for Research, full-width closing actions, and no horizontal overflow. Browser
inspection reports equal 390-pixel document and viewport widths.

## 2026-08-06 closing-boundary pass

This pass inspected the final Questions-to-Closing transition at a fixed
1440 × 1000 viewport after the Research restructure. The before screenshot
showed a large headline and two actions on the same neutral background used
throughout the page. Its sentence, “Start with the conversation that cannot be
lost,” was emotionally clear but did not recall the evidence and authority
mechanism demonstrated above it.

Two closing structures were compared:

1. A decision-boundary closure that restates source, proposed state, and
   separate action authority.
2. Another product panel beside the actions.

The first structure won because a repeated product panel would compete with
the hero and decision ledger. The after capture introduces one same-theme
contrast event: a vermilion top rule, a lightly tinted surface, the direct
headline “See what changes before anything leaves,” and a three-part boundary
summary. It closes the page with product mechanics rather than a generic
marketing promise.

Screenshot evidence:

- before desktop:
  `output/playwright/home-closing-before-desktop.png`;
- after desktop:
  `output/playwright/home-closing-after-desktop.png`;
- after mobile:
  `output/playwright/home-closing-after-mobile.png`;
- after mobile dark mode:
  `output/playwright/home-closing-after-mobile-dark.png`;
- after full mobile:
  `output/playwright/home-closing-after-full-mobile.png`.

At 390 pixels, the actions become full width and the three boundary statements
stack with sparse dividers. Browser inspection reports equal document and
viewport widths. The dark screenshot preserves the tint as a warmer surface
inside the existing theme rather than inverting the page.

## 2026-08-06 causal-feedback and keyboard pass

This pass tested the hero workbench as a causal interface rather than a static
composition. The before capture showed that removing a source clause correctly
retracted the dependent state and revised the recommended action, but required
the reviewer to infer how much evidence remained in scope. It also exposed the
external-action boundary only through a disabled control and pointer tooltip.

The revised workbench now:

- announces and displays whether all four clauses or only a subset remain in
  scope;
- links every evidence control to the proposed-change list, current dependency,
  and approval boundary with `aria-controls`;
- keeps the recalculated scope and dependency in polite live regions;
- shows “Separate review required” beside the disabled external action;
- adds a check-circle confirmation signal so confirmed facts do not depend on
  color alone.

Screenshot evidence:

- before default:
  `output/playwright/home-interaction-before-default.png`;
- before retracted:
  `output/playwright/home-interaction-before-retracted.png`;
- after retracted:
  `output/playwright/home-interaction-after-retracted.png`;
- after confirmed:
  `output/playwright/home-interaction-after-confirmed.png`;
- after keyboard focus:
  `output/playwright/home-interaction-after-focus.png`;
- after mobile:
  `output/playwright/home-interaction-after-mobile.png`;
- after mobile dark mode:
  `output/playwright/home-interaction-after-mobile-dark.png`.

The 1440-pixel retracted-state capture preserves the source/change redline,
shows “3 of 4 evidence clauses remain in scope,” and keeps the disabled action
visibly separate from fact confirmation. The 390 × 844 capture stacks the
approval decisions without crowding and reports equal 390-pixel document and
viewport widths. The focus capture retains a visible outline on the inline
evidence control, while the dark capture preserves the same state hierarchy.

## 2026-08-06 relationship-authority pass

### D0 product invariant

- Visitor: an independent recruiter or boutique-search operator assessing
  whether the product can preserve candidate context without taking over the
  relationship.
- Tension: the page claims evidence-first trust, but the previous Questions
  section rendered that claim as a conventional FAQ.
- Intended understanding: the system may remember evidence and propose a
  change, while fact confirmation, work attention, and external effects remain
  human decisions.
- Product truth: a redline separates supported context from execution
  authority; confirmation never grants permission to act.

Current reference review used mechanisms rather than visual identities:
Attio exposes transcript-to-record product behavior, Metaview pairs product
scope with explicit controls, Common Room makes signals business-readable,
and Clay demonstrates strong contrast events. None supplies Talent Signal's
evidence-to-authority boundary.

### D1–D3 branch record

Two rendered branches replaced the previous generic accordion-led
composition:

1. **A · Control ledger:** three equal columns for evidence, proposal, and
   authority, contained in one rounded ledger.
2. **B · Authority field:** an asymmetric editorial statement beside a
   system-scope field, cut horizontally by a vermilion decision boundary
   before the recruiter-owned decision.

Branch B won the pairwise comparison. With the logo hidden, its spatial
argument remains identifiable: system capability sits above the causal seam
and human authority sits below it. It also avoids repeating the rounded-panel
language already used by the hero and decision ledger. Branch A remains the
credible challenger, but its equal columns repeat a familiar feature-card
rhythm and compress the authority explanation.

Prototype evidence:

- prior rendered Questions section:
  `output/playwright/home-next-before-trust.png`;
- branch A:
  `output/playwright/home-trust-prototype-a-ledger.png`;
- branch B:
  `output/playwright/home-trust-prototype-b-field.png`.

### Implemented evidence

The selected direction now leads with “The system can hold context. It cannot
hold authority.” Its field distinguishes:

- remembered evidence with provenance;
- a reviewable proposed change;
- a visible decision boundary stating that confirmation grants no execution
  authority;
- recruiter-owned fact confirmation, work attention, and exact external
  effect.

The practical FAQ remains available below the field in a quieter two-column
desktop grid and a one-column mobile disclosure list.

Rendered evidence:

- desktop section:
  `output/playwright/home-trust-after-desktop-section.png`;
- mobile section:
  `output/playwright/home-trust-after-mobile-section.png`;
- mobile dark section:
  `output/playwright/home-trust-after-mobile-dark-section.png`.

At 390 pixels, the sequence collapses explicitly from Remember to Propose to
Decision boundary to Decide. Browser inspection reports equal 390-pixel
document and viewport widths. The dark capture retains the same order,
contrast, and authority seam without introducing a section-level theme
inversion.

## 2026-08-06 public-proof closing pass

### D0 product invariant

- Visitor: an independent recruiter deciding whether a relationship product's
  trust language is supported by inspectable behavior.
- Tension: the repository contains a working prototype and synthetic evidence,
  but no authorized customer outcomes, production-adoption claims, logos, or
  testimonials.
- Intended understanding: the visitor can distinguish what the page
  demonstrates, what remains unclaimed, and what can be verified next.
- Product truth: public claims should follow the same evidence discipline as
  relationship state inside the product.

Current reference review compared the proof mechanisms of Attio's trust center,
Metaview's privacy and security page, Linear's security page, and Vanta's trust
center positioning. Established products can lead with certifications,
customer scale, and operational claims. Talent Signal cannot honestly copy
that evidence structure yet.

### D1-D3 branch record

Two rendered closing directions replaced a competent but repetitive
source/state/action summary:

1. **A - Public proof register:** distinguish demonstrated behavior, withheld
   claims, current prototype status, and the next verification action.
2. **B - Evaluation brief:** give the visitor a three-part rehearsal of the
   synthetic evidence-review workflow before the final action.

Branch A won. Branch B improves conversion clarity, but repeats the hero and
history sequence without adding proof. Branch A turns the absence of customer
evidence into an inspectable claim boundary instead of hiding it or filling it
with invented social proof. It therefore produces a more ownable logo-off
composition and more directly extends the evidence-first product theorem.

Screenshot evidence:

- previous closing:
  `output/playwright/home-closing-proof-before.png`;
- branch A:
  `output/playwright/home-closing-proof-prototype-a.png`;
- branch B:
  `output/playwright/home-closing-proof-prototype-b.png`.

### Implemented evidence

The selected closing now leads with “Every promise needs a source” and exposes:

- current status: working prototype using synthetic evidence;
- demonstrated behavior: evidence retraction recalculates dependent state and
  action;
- demonstrated authority separation: fact confirmation does not authorize an
  external effect;
- withheld claims: customer outcomes, production adoption, and autonomous
  execution are not asserted;
- one direct verification action through the synthetic evidence review.

The post-selection anti-template pass removed a decorative closing eyebrow and
the uninformative `01-04` register numbering. Semantic labels remain:
Demonstrated, Not claimed, and Verify next.

Rendered evidence:

- desktop section:
  `output/playwright/home-closing-proof-after-desktop-section.png`;
- mobile section:
  `output/playwright/home-closing-proof-after-mobile-section.png`;
- mobile dark section:
  `output/playwright/home-closing-proof-after-mobile-dark-section.png`.

At 390 pixels, the proof register becomes one column and both actions become
full width. Browser inspection reports equal 390-pixel document and viewport
widths. The dark capture preserves the withheld-claim tint, green inspectable
status, vermilion unasserted status, and CTA hierarchy.

## 2026-08-06 intermediate-breakpoint pass

This pass tested the responsive interval between the previously verified
390-pixel mobile and 1440-pixel desktop states. Fixed 900-pixel and 1024-pixel
captures exposed a real hierarchy failure despite reporting no horizontal
overflow: the split hero compressed the headline to three lines and forced the
explanation and actions into a narrow secondary column.

Two rendered corrections were compared:

1. **A - Compact split:** preserve the two-column hero, widen the headline
   column, and reduce its type scale.
2. **B - Stacked introduction:** keep the full display scale, stack the thesis
   across the available width, and place the explanation and actions together
   on the next row.

Branch B won. Branch A keeps more product pixels above the fold, but visibly
demotes the product theorem and leaves excess whitespace above the workbench.
Branch B restores the headline to two lines at both widths, keeps both actions
on one line, and still reveals the top of the real workbench inside the first
900-pixel viewport.

Pairwise evidence:

- before 768/900/1024/1180 montage:
  `output/playwright/home-breakpoint-before-first-montage.png`;
- compact-split versus stacked-introduction montage:
  `output/playwright/home-breakpoint-prototype-montage.png`;
- after 768/900/1024/1180 montage:
  `output/playwright/home-breakpoint-after-first-montage.png`.

The implemented range is explicit from 821 through 1080 pixels. At 820 pixels
and below, the existing narrow-layout rule still controls the hero and
workbench. At 1081 pixels and above, the wide desktop split remains unchanged.

Regression evidence:

- trust section across all four widths:
  `output/playwright/home-breakpoint-after-trust-montage.png`;
- public-proof closing across all four widths:
  `output/playwright/home-breakpoint-after-closing-montage.png`.

Browser inspection reports equal document and viewport widths at 768, 900,
1024, and 1180 pixels. The trust and closing captures retain their own layout
families and do not inherit the hero-only breakpoint rules.

## 2026-08-06 navigation-integrity pass

The breakpoint montage exposed a discoverability defect that layout metrics
alone did not reveal: from 768 through 1024 pixels, the fourth primary
navigation item, Principles, was silently removed even though the header had
enough room for it.

Two rendered directions were compared:

1. **A - Compact complete navigation:** retain all five primary links, reduce
   the gap responsively, and use a slightly smaller label size in the
   constrained desktop range.
2. **B - Early menu transition:** replace the complete navigation with the
   mobile menu before the links begin to wrap.

Branch A won. It preserves direct access to Product, Method, Blog, Principles,
and Questions at every tested desktop width without changing the information
architecture. Branch B made the header quieter, but hid all primary navigation
and Sign in; its open menu also occupied roughly half of the 900-pixel
viewport.

Pairwise and implemented evidence:

- compact navigation versus early menu:
  `output/playwright/home-navigation-prototype-montage.png`;
- implemented navigation at 768/900/1024/1180:
  `output/playwright/home-navigation-after-montage.png`;
- mobile menu keyboard focus:
  `output/playwright/home-navigation-after-mobile-focus.png`;
- mobile state after Escape:
  `output/playwright/home-navigation-after-mobile-escape.png`.

Browser inspection reports all five primary links visible and equal document
and viewport widths at 768, 900, 1024, and 1180 pixels. On mobile, Escape closes
the expanded navigation and restores keyboard focus to the menu trigger.

## 2026-08-06 relationship-history tempo pass

The current 1440-pixel full-page capture showed that the relationship history
lost visual authority immediately after the product workbench. Six equal
columns reduced every state to small text, while six short red marks acted as
decoration rather than explaining how evidence moves through the product.

Two rendered structures were compared:

1. **A - Continuous redline:** place the six semantic states above and below
   one uninterrupted evidence line so the causal sequence becomes the section's
   visual argument.
2. **B - Case folio:** place the six states in a two-column bordered ledger
   beside a sticky section introduction.

Branch A won. With the logo removed, its continuous redline remains tied to the
product theorem and makes the state sequence readable without introducing
another card grid. Branch B improved text size, but its six bordered cells were
interchangeable with a generic process or feature matrix.

The implemented version removes the prototype's `01-06` labels. The remaining
nodes carry sequence meaning rather than acting as decorative status dots. At
1024 pixels and below, the section retains the denser responsive evidence grid
and removes the numbering there as well.

Pairwise and implemented evidence:

- previous section:
  `output/playwright/home-history-prototype-before.png`;
- branch A, continuous redline:
  `output/playwright/home-history-prototype-a-redline.png`;
- branch B, case folio:
  `output/playwright/home-history-prototype-b-folio.png`;
- implemented light desktop:
  `output/playwright/home-history-pass-after-1440.png`;
- implemented dark desktop:
  `output/playwright/home-history-pass-after-dark-1440.png`;
- implemented 1024-pixel state:
  `output/playwright/home-history-pass-after-1024.png`;
- implemented mobile full page:
  `output/playwright/home-history-pass-full-390.png`.

The light and dark captures preserve the same hierarchy and single vermilion
accent. The new desktop composition adds no animation, new dependency, card
surface, or horizontal overflow. Browser inspection reports equal document and
viewport widths at 390, 1024, and 1440 pixels.

## 2026-08-06 retraction-causality pass

The latest fixed 1440-pixel full-page capture showed a mismatch between
product importance and visual weight in the counterfactual section. Evidence
retraction is one of the product's most distinctive mechanisms, but the
desktop composition reduced it to three short horizontal rules, small type,
and disconnected arrows inside a large empty zone.

Two rendered structures were compared:

1. **A - Continuous causal spine:** place source removal, state retraction, and
   action revision on one vertical vermilion seam with three semantic nodes.
2. **B - Before-and-after profile:** isolate the removed source in one bordered
   panel and place the two dependent results in a second stacked panel.

Branch A won. It turns the section into one inspectable dependency path while
reinforcing the same redline grammar used by the source-and-change workbench.
Branch B increased legibility, but its paired bordered panels were
interchangeable with a common before-and-after feature layout and introduced
more container chrome than the content needed.

The implemented direction uses only two group rules and sparse internal
dividers. The vermilion nodes represent actual dependency states rather than
decorative status dots. The removed source receives the only tinted field;
dependent state and revised action remain on the neutral surface. At 820
pixels and below, the same causal spine collapses into one compact column
instead of changing metaphor.

Pairwise and implemented evidence:

- previous desktop composition:
  `output/playwright/home-retraction-before-1440.png`;
- branch A, continuous causal spine:
  `output/playwright/home-retraction-a-causal-spine-1440.png`;
- branch B, before-and-after profile:
  `output/playwright/home-retraction-b-before-after-1440.png`;
- implemented light desktop:
  `output/playwright/home-retraction-after-light-1440.png`;
- implemented dark desktop:
  `output/playwright/home-retraction-after-dark-1440.png`;
- implemented mobile:
  `output/playwright/home-retraction-after-mobile-390.png`;
- implemented mobile full page:
  `output/playwright/home-retraction-after-full-mobile-390.png`.

Browser inspection reports equal 390-pixel document and viewport widths. The
change introduces no animation, dependency, interactive control, new color,
or elevated card surface.

## 2026-08-06 research-material and tempo pass

Fixed 1440-pixel captures of the judgment, research, and authority sections
showed that the research section was the weakest transition in the later page.
The judgment ledger and authority boundary had distinct material and contrast,
while the two research articles repeated a generic white-background blog row.
Their small titles and disconnected hairlines made the method feel secondary.

Two rendered structures were compared:

1. **A - Redline annotations:** connect the two articles to one vertical
   vermilion line, enlarge their method claims, and preserve the unboxed
   editorial layout.
2. **B - Research folios:** turn both articles into overlapping, rotated paper
   sheets with borders and object shadows.

Branch A won. The vertical line makes research part of the product's evidence
language without requiring another card family. Branch B created stronger
object depth, but its rotated paper cards were visually interchangeable with a
common portfolio or editorial-marketing treatment.

The implemented version uses the node fill only as link feedback: hovering or
keyboard-focusing an article link fills its associated method node. There is
no automatic animation. Below 1081 pixels, the structure returns to the
existing stacked editorial layout so the line does not consume mobile reading
width.

Pairwise and implemented evidence:

- previous research section:
  `output/playwright/home-research-depth-before.png`;
- branch A, redline annotations:
  `output/playwright/home-research-depth-a-annotations.png`;
- branch B, research folios:
  `output/playwright/home-research-depth-b-folios.png`;
- implemented light desktop:
  `output/playwright/home-research-depth-after-1440.png`;
- implemented keyboard focus:
  `output/playwright/home-research-depth-after-focus-1440.png`;
- implemented neutral dark desktop:
  `output/playwright/home-research-depth-after-dark-neutral-1440.png`;
- implemented 1024-pixel state:
  `output/playwright/home-research-depth-after-1024.png`;
- implemented clean mobile section:
  `output/playwright/home-research-depth-after-mobile-clean-390.png`.

Browser inspection reports equal document and viewport widths at 390, 1024,
and 1440 pixels. The direction adds no new dependency, card surface, section
theme inversion, or scroll-driven effect.

## 2026-08-06 FAQ independent-flow pass

The latest 1440-pixel interaction capture exposed a layout defect that was not
visible in the default state. The FAQ used one row-major two-column grid, so
opening the upper-right answer increased the height of the shared row and left
a large empty zone below the upper-left answer.

Two rendered structures were compared:

1. **A - Independent disclosure columns:** split the four questions into two
   vertical flows. Each side expands without changing the other side's row
   rhythm.
2. **B - Single disclosure ledger:** place all four questions in one vertical
   sequence.

Branch A won. It removes the false whitespace while keeping the questions
compact beside the authority boundary. Branch B also removed the defect, but
made the page ending substantially longer and weakened the transition into the
public-proof closing section.

The implemented structure preserves native `details` and `summary` semantics.
Its DOM order follows the visible reading order down the left column and then
down the right. Each column has one group rule, while the center rule supplies
depth without turning the questions into cards. Below 821 pixels, both columns
collapse into one explicit disclosure flow.

Pairwise and implemented evidence:

- defective shared-row state:
  `output/playwright/home-faq-flow-before.png`;
- branch A, independent columns:
  `output/playwright/home-faq-flow-a-independent-columns.png`;
- branch B, single ledger:
  `output/playwright/home-faq-flow-b-single-ledger.png`;
- implemented default desktop:
  `output/playwright/home-faq-flow-after-default-1440.png`;
- implemented left-column expansion:
  `output/playwright/home-faq-flow-after-left-open-1440.png`;
- implemented simultaneous independent expansion:
  `output/playwright/home-faq-flow-after-both-columns-open-1440.png`;
- implemented keyboard focus:
  `output/playwright/home-faq-flow-after-keyboard-focus-1440.png`;
- implemented dark desktop:
  `output/playwright/home-faq-flow-after-dark-1440.png`;
- implemented mobile:
  `output/playwright/home-faq-flow-after-mobile-390.png`.

The keyboard capture follows a pointer-opened question with `Tab`, then the
browser snapshot confirms that `Enter` opens the newly focused summary. Mobile
inspection reports equal 390-pixel document and viewport widths. The change
adds no dependency, automatic animation, card surface, or new color.

## 2026-08-06 footer-colophon pass

The current fixed 1440-pixel page-ending capture showed a final hierarchy
regression. The public-proof closing section ended with clear evidence and two
actions, but the footer returned to a generic two-column sitemap with a large
empty lower field. The strongest brand boundary, “Built for judgment, not
surveillance.”, appeared only as small muted metadata.

Two rendered structures were compared:

1. **A - Manifesto colophon:** retain the brand and two navigation groups, then
   use the existing judgment boundary as the final large typographic line.
2. **B - Evidence index:** compress both navigation groups into two horizontal
   ledger rows and retain the judgment boundary as small footer metadata.

Branch A won. It gives the page a memorable final position without inventing a
new claim or competing with the closing section's calls to action. Branch B
reduced height more aggressively, but remained visually interchangeable with
a compact corporate sitemap.

The implemented desktop footer gives navigation one group rule and separates
the colophon with one final rule. The statement uses the existing sans family,
ink color, and page display rhythm rather than a new effect. On mobile, the
layout collapses to one column and presents the statement before the copyright
line so the page ends quietly after the larger assertion.

Pairwise and implemented evidence:

- previous page ending:
  `output/playwright/home-ending-before-1440.png`;
- previous isolated footer:
  `output/playwright/home-footer-before-1440.png`;
- branch A, manifesto colophon:
  `output/playwright/home-footer-a-manifesto-colophon-1440.png`;
- branch B, evidence index:
  `output/playwright/home-footer-b-evidence-index-1440.png`;
- implemented clean light desktop:
  `output/playwright/home-footer-after-light-clean-1440.png`;
- implemented clean dark desktop:
  `output/playwright/home-footer-after-dark-clean-1440.png`;
- implemented clean mobile:
  `output/playwright/home-footer-after-mobile-clean-390.png`.

The clean captures hide only the Next.js development-tools portal, which does
not exist on the production surface. Browser inspection reports equal
390-pixel document and viewport widths. The change preserves all footer links,
destinations, copy, and semantic navigation and adds no dependency, animation,
new color, or card surface.

## 2026-08-06 mobile-navigation-state pass

The real 390-pixel open-menu capture exposed one remaining interaction-level
hierarchy defect. The menu ended as a short generic dropdown while the hero
action and product preview remained visible beneath it. This made navigation
feel like one more layer on the homepage instead of the page's single active
state.

The redesign preserves the editorial product-folio language, existing
information architecture, navigation labels, green accent, and restrained
motion. Two rendered directions were compared:

1. **A - Full folio:** a single-column index fills the viewport below the
   header, gives each primary destination one generous line, treats sign-in as
   secondary, and anchors the access request at the bottom.
2. **B - Compact index sheet:** a two-column index sits over a dimmed page and
   keeps more of the homepage visible.

Branch A won. It creates one unambiguous navigation state and a clearer reading
order. Branch B was denser, but its two-column scan order was less certain and
the visible homepage action continued to compete with the menu.

The implemented state locks background scrolling, makes the main content and
footer inert, retains the 220 ms state-transition animation, and restores the
previous state on close. Escape closes the menu and returns focus to the menu
button. Choosing a destination closes the menu before navigating.

Rendered and runtime evidence:

- previous open state:
  `output/playwright/home-mobile-nav-before-390.png`;
- branch A, full folio:
  `output/playwright/home-mobile-nav-a-full-folio-390.png`;
- branch B, compact index sheet:
  `output/playwright/home-mobile-nav-b-index-sheet-390.png`;
- implemented clean light state:
  `output/playwright/home-mobile-nav-after-light-clean-390.png`;
- implemented clean dark state:
  `output/playwright/home-mobile-nav-after-dark-clean-390.png`;
- implemented dark state at 320 × 568:
  `output/playwright/home-mobile-nav-after-dark-short-320.png`.

Browser inspection reports equal document and viewport widths at 390 and 320
pixels. While open, body overflow is locked and both background landmarks have
the inert attribute. Escape restores all three values and returns focus to
“Open navigation”. At 320 × 568 the access action remains fully visible, with
its lower edge at 543 pixels. The clean captures hide only the Next.js
development-tools portal, which does not exist on the production surface.

## 2026-08-06 intermediate research-continuity pass

New full-page captures at 1440, 1024, and 390 pixels showed that the homepage's
product proof, retraction, and decision-boundary sections now share a
recognizable causal language. The research section lost that language between
821 and 1080 pixels. At 1024 pixels it became a conventional title beside two
blog rows, with every article split again into title and summary columns.

Two real 1024-pixel structures were compared:

1. **A - Stacked editorial rows:** preserve the existing intermediate layout
   with a two-column intro and two title-summary article rows.
2. **B - Continuous research redline:** preserve the desktop causal seam,
   attach each article to one semantic node, and use a single reading column
   inside the narrower article rail.

Branch B won. It retains the product's evidence grammar at a common laptop and
tablet-landscape width, while the single-column article body removes the
uncertain left-right scan. Branch A remains a credible low-density editorial
layout, but it is more interchangeable and breaks the redline motif before the
authority section.

The implemented breakpoint keeps the prior desktop and mobile compositions
unchanged. From 821 through 1080 pixels, the intro stays in the left field and
the two method articles follow one vertical vermilion seam in the right field.
The seam has no decorative animation. A node fills only when its article link
receives hover or keyboard focus.

Rendered and runtime evidence:

- current complete light page before this pass, 1440 pixels:
  `output/playwright/home-continuation-current-full-1440.png`;
- current complete page before this pass, 1024 pixels:
  `output/playwright/home-continuation-current-full-1024.png`;
- current complete mobile page before this pass:
  `output/playwright/home-continuation-current-full-390.png`;
- branch A, stacked editorial rows:
  `output/playwright/home-research-intermediate-a-stacked-1024.png`;
- branch B, continuous research redline:
  `output/playwright/home-research-intermediate-b-redline-1024.png`;
- implemented clean light state:
  `output/playwright/home-research-intermediate-after-light-1024.png`;
- implemented clean dark state:
  `output/playwright/home-research-intermediate-after-dark-1024.png`;
- implemented keyboard-focus state:
  `output/playwright/home-research-intermediate-after-keyboard-focus-1024.png`;
- implemented 821-pixel boundary:
  `output/playwright/home-research-intermediate-after-boundary-821.png`;
- implemented 820-pixel mobile-collapse boundary:
  `output/playwright/home-research-intermediate-after-boundary-820.png`;
- implemented unchanged desktop composition:
  `output/playwright/home-research-intermediate-after-desktop-1440.png`;
- implemented complete 1024-pixel page:
  `output/playwright/home-research-intermediate-after-full-1024.png`;
- implemented complete clean mobile page:
  `output/playwright/home-research-intermediate-after-full-mobile-clean-390.png`.

At 1024 pixels, keyboard navigation moves from “Browse all research” to the
first article title and fills its node with the existing accent color. At 820
and 390 pixels, browser inspection reports document width equal to viewport
width. No URL, article, copy, dependency, card surface, shadow, or automatic
motion changed.

## 2026-08-06 header attention and color-semantics pass

The latest fixed first-viewport captures exposed a semantic hierarchy defect
in the desktop header. “Sign in” used the only filled vermilion button in the
header, so a returning-user utility drew attention before the new visitor
could read the product promise or inspect the source-to-change mechanism. It
also assigned the consequential-change color to an ordinary account action.

Two real first-viewport directions were compared:

1. **A - Quiet account utility:** retain sign-in at the right edge, remove the
   filled container, and use a text treatment with a generous interaction
   target and an underline only on hover.
2. **B - Workspace button:** retain a compact filled button but change it to
   the page's ink color so vermilion remains product-semantic.

Branch A won. It preserves the familiar separation between marketing
navigation and account access without competing with “Try one conversation”.
Branch B corrected the color misuse, but the second filled black action still
made the returning-user path appear equal to the new visitor's primary task.
It remains the challenger if authenticated workspace traffic later becomes the
homepage's dominant entry condition.

The implementation changes no label, destination, information architecture,
or mobile-menu behavior. The desktop sign-in link keeps a 38-pixel interaction
height, uses the existing strong-muted text token, reveals a restrained
underline on hover, and retains the global two-pixel focus ring.

Rendered and runtime evidence:

- previous light first viewport at 1440 pixels:
  `output/playwright/home-header-conversion-before-1440.png`;
- previous light first viewport at 1024 pixels:
  `output/playwright/home-header-conversion-before-1024.png`;
- branch A, quiet account utility at 1440 pixels:
  `output/playwright/home-header-conversion-a-quiet-utility-1440.png`;
- branch A at 1024 pixels:
  `output/playwright/home-header-conversion-a-quiet-utility-1024.png`;
- branch B, workspace button:
  `output/playwright/home-header-conversion-b-workspace-button-1440.png`;
- implemented clean light state:
  `output/playwright/home-header-conversion-after-light-1440.png`;
- implemented clean dark state:
  `output/playwright/home-header-conversion-after-dark-1440.png`;
- implemented dark 1024-pixel state:
  `output/playwright/home-header-conversion-after-dark-1024.png`;
- implemented 768-pixel desktop boundary:
  `output/playwright/home-header-conversion-after-boundary-768.png`;
- implemented 767-pixel mobile boundary:
  `output/playwright/home-header-conversion-after-boundary-767.png`;
- implemented keyboard-focus state:
  `output/playwright/home-header-conversion-after-keyboard-focus-1440.png`.

Browser inspection reports document width equal to viewport width at 768 and
767 pixels. At 768 pixels all five primary destinations, the theme control,
and sign-in remain on one line. At 767 pixels the desktop navigation and
account utility are hidden and the mobile-menu control is visible. Keyboard
navigation reaches the unchanged `/login?callbackUrl=/workspace` destination.
The sign-in text has an 8.11:1 contrast ratio against the actual light page
background.

## 2026-08-06 mobile history-causality pass

The current 390-pixel section capture showed that the six relationship states
were legible but no longer read as one causal history. The two-column layout
made its central gray divider more prominent than the short vermilion segments
and encouraged parallel-column scanning. Computed browser styles showed that
the issue was not simply small type: titles were 14.72 pixels and detail text
was 13.12 pixels.

Two real mobile structures were compared:

1. **A - Compact two-column ledger:** retain the six states in three short rows
   for minimum page height.
2. **B - Continuous vertical redline:** place all six states in source order on
   one vermilion causal seam, with one semantic node for each state.

Branch B won. It makes the product's longitudinal behavior visible rather than
presenting six independent explanations. The single reading order is also
clearer for the sequence from observed evidence through proposed, corrected,
confirmed, approved, and observed-again state. Branch A remains the
high-density challenger for contexts where overview speed matters more than
causal inspection.

The implemented mobile direction has no numbering, animation, card surface, or
new color. State titles increase to 16 pixels and detail text to 13.76 pixels.
After spacing refinement, the section grows from about 1053 pixels to about
1113 pixels, substantially less than the 1253-pixel first prototype. At 561
pixels the existing compact three-column tablet composition remains intact;
at 560 pixels the sequence deliberately becomes one column.

Rendered and runtime evidence:

- previous 390-pixel structure:
  `output/playwright/home-history-mobile-before-390.png`;
- branch B, first continuous-redline prototype:
  `output/playwright/home-history-mobile-b-continuous-redline-390.png`;
- implemented clean light mobile state:
  `output/playwright/home-history-mobile-after-light-isolated-390.png`;
- implemented clean dark mobile state:
  `output/playwright/home-history-mobile-after-dark-isolated-390.png`;
- implemented 320-pixel state:
  `output/playwright/home-history-mobile-after-light-320.png`;
- implemented 560-pixel boundary:
  `output/playwright/home-history-mobile-after-boundary-560.png`;
- preserved 561-pixel compact boundary:
  `output/playwright/home-history-mobile-after-boundary-561.png`;
- preserved desktop composition:
  `output/playwright/home-history-after-desktop-1440.png`.

Browser inspection reports document width equal to viewport width at 320, 390,
560, 561, and 1440 pixels. The final 390-pixel inspection also reports zero
computed top and left borders on all six mobile items, proving that the prior
grid rules no longer leak gray table lines into the redline sequence.

## 2026-08-06 intermediate history-continuity pass

The 1024-pixel baseline showed the six relationship states as two independent
rows of three columns. All copy was legible, but gray row and column dividers
carried more structural weight than the short vermilion marks. The transition
from the third state, corrected, to the fourth state, confirmed, was therefore
visually weaker than the boundaries between adjacent cells.

Two rendered structures were compared at the same viewport and scroll
position:

1. **A - Two-row evidence grid:** preserve the compact three-column tablet
   arrangement.
2. **B - Continuous horizontal redline:** arrange all six states in source
   order on one vermilion seam, alternate explanation above and below it, and
   use one semantic node per state.

Branch B won at 1024 pixels. It represents one causal record rather than six
adjacent claims, removes non-semantic table borders, and retains enough
breathing room for every explanation. Runtime inspection measured six columns
of about 157 pixels with document width equal to the 1024-pixel viewport.

Boundary testing rejected an earlier 821-pixel activation point because each
state narrowed to about 126 pixels and produced excessive orphaned lines.
Testing at 900 pixels still showed unnecessary fragmentation. The implemented
threshold is therefore 960 pixels, where each state receives about 147 pixels.
From 561 through 959 pixels the more readable three-column structure remains;
at 560 pixels and below the previously verified vertical causal redline
remains.

Rendered and runtime evidence:

- 1024-pixel baseline:
  `output/playwright/home-history-intermediate-before-1024.png`;
- continuous-redline prototype at 1024 pixels:
  `output/playwright/home-history-intermediate-b-continuous-1024.png`;
- implemented 1024-pixel light state:
  `output/playwright/home-history-after-light-1024.png`;
- implemented 1024-pixel dark state:
  `output/playwright/home-history-after-dark-1024.png`;
- preserved 820- and 821-pixel states:
  `output/playwright/home-history-after-boundary-820.png` and
  `output/playwright/home-history-after-boundary-821.png`;
- final 959- and 960-pixel activation boundary:
  `output/playwright/home-history-after-boundary-959.png` and
  `output/playwright/home-history-after-boundary-960.png`;
- continuous 1080- and 1081-pixel states:
  `output/playwright/home-history-after-boundary-1080.png` and
  `output/playwright/home-history-after-boundary-1081.png`;
- preserved 1440-pixel desktop state:
  `output/playwright/home-history-after-desktop-1440.png`.

Browser inspection reports document width equal to viewport width at 820, 821,
899, 900, 959, 960, 1024, 1080, 1081, and 1440 pixels. Light and dark
1024-pixel captures preserve the same type hierarchy, node semantics, and
single-accent color system.

## 2026-08-06 evidence-affordance pass

Fresh full-page captures at 1440, 1024, and 390 pixels showed that the earlier
critique's empty hero, abstract product graphic, missing mobile navigation, and
horizontal overflow no longer describe the rendered page. The live
source-to-change workbench is visible directly below the hero and the 390-pixel
document width equals its viewport width.

The new screenshot-level weakness was interaction discovery. The four source
phrases had accurate pressed state and vermilion underlines, but the only
instruction appeared below the full quotation in small muted text. A static
first view could therefore be mistaken for an annotated screenshot even though
the workbench is a functional component.

The actual interaction was verified before changing the composition. Removing
the phrase "remote flexibility is important" sets its native button to
`aria-pressed="false"`, changes Work mode to "No supported change", and revises
the current dependency to "Ask what must be true". This proves that the
interaction is the product mechanism, not a decorative hover.

Two rendered affordance directions were compared at the same 1440-pixel
viewport:

1. **A - Pre-quote instruction rail:** retain the source-linked editorial
   underline and place one explicit operation and its consequence before the
   quotation.
2. **B - Evidence selection blocks:** turn every source phrase into a lightly
   filled rectangular control for stronger immediate clickability.

Branch A won. Branch B made the controls obvious but fragmented the candidate's
original sentence into UI tokens and weakened exact-context reading. Branch A
preserves the product theorem that evidence remains attached to its original
words while making the action discoverable before the evidence itself.

The implemented rail says "Remove one underlined phrase" and "Dependent state
and action retract with it." It uses one semantic vermilion edge and two
organizing hairlines, adds no new card, accent, icon, or automatic motion, and
keeps the live scope count below the quotation. At 390 pixels the rail is
visible at the bottom of the first 844-pixel viewport. The total mobile
document height changes by only about 10 pixels, while the 1440-pixel workbench
remains about 812 pixels high.

Rendered and runtime evidence:

- current 1440-pixel full-page baseline:
  `output/playwright/continuation-current-full-light-1440.png`;
- current 390-pixel full-page baseline:
  `output/playwright/continuation-current-full-light-390.png`;
- verified removed-evidence state before refinement:
  `output/playwright/continuation-interaction-after-1440.png`;
- branch A instruction-rail prototype:
  `output/playwright/continuation-affordance-a-instruction-rail-1440.png`;
- branch B selection-block prototype:
  `output/playwright/continuation-affordance-b-selection-blocks-1440.png`;
- implemented 1440-pixel light state:
  `output/playwright/continuation-affordance-after-light-1440.png`;
- implemented 390-pixel light and dark states:
  `output/playwright/continuation-affordance-after-light-390.png` and
  `output/playwright/continuation-affordance-after-dark-390.png`;
- implemented 320-pixel state:
  `output/playwright/continuation-affordance-after-light-320.png`;
- implemented removed-evidence state:
  `output/playwright/continuation-affordance-after-interaction-1440.png`;
- implemented keyboard-focus state:
  `output/playwright/continuation-affordance-after-keyboard-focus-1440.png`.

Browser inspection reports document width equal to viewport width at 320, 390,
and 1440 pixels. The first evidence clause retains a visible two-pixel keyboard
focus outline, and the removed preference retains `aria-pressed="false"` while
its dependent state and action update.

## 2026-08-06 mobile decision-tempo pass

The latest clean 390-pixel full-page capture measured 10,684 pixels high.
Section-level browser measurements showed that the decision-authority section
occupied 1,633 pixels, the second-largest section after the combined
relationship-authority and questions block.

The screenshot exposed a content-level repetition rather than a typography
problem. The full decision ledger already showed the relationship-state
decision, external-action decision, exact target, effect, timing, and the
authority boundary. Below it, the page repeated the same distinction with the
headline "Two decisions. Never one permission." and two explanatory rows.

Two rendered mobile architectures were compared at the same 390-pixel
viewport:

1. **A - Claim followed by full ledger:** move the headline and short
   explanation before the ledger, preserve every inspectable ledger row, and
   remove the two repeated explanatory articles in the single-column layout.
2. **B - Claim followed by prose summary:** preserve the two explanatory
   articles and collapse the ledger to its two stage titles and authority
   boundary.

Branch A won. It reduces repetition while placing concrete product evidence
immediately after the claim. Branch B was about 60 pixels shorter, but the
first viewport contained only abstract principles and delayed the actual
target, timing, and effect until the next screen. That reintroduced the
original evaluation's weakness of explaining ideas before proving behavior.

The implemented structure applies through 960 pixels because the prior
821-pixel dual-column composition narrowed the ledger to about 300 pixels and
forced its metadata and authority boundary to wrap. At 768, 820, and 960
pixels, the full ledger is capped at 640 pixels. At 961 pixels the original
dual-column composition returns with a 327-pixel ledger and remains readable.
The 1440-pixel desktop composition is unchanged.

At 390 pixels the section height falls from 1,633 to 1,164 pixels, a reduction
of 469 pixels or about 28.7 percent. The complete mobile page falls from 10,684
to 10,215 pixels without reducing ledger font sizes or hiding product facts.
Document width remains equal to viewport width.

Rendered and runtime evidence:

- 390-pixel full-page baseline:
  `output/playwright/continuation-tempo-before-full-390.png`;
- isolated 390-pixel baseline:
  `output/playwright/continuation-tempo-before-judgment-390.png`;
- branch A full-ledger prototype:
  `output/playwright/continuation-tempo-a-full-ledger-390.png`;
- branch B summary-ledger prototype:
  `output/playwright/continuation-tempo-b-summary-ledger-390.png`;
- branch A tablet prototype:
  `output/playwright/continuation-tempo-a-full-ledger-768.png`;
- implemented 390-pixel light and dark states:
  `output/playwright/continuation-tempo-after-light-390.png` and
  `output/playwright/continuation-tempo-after-dark-390.png`;
- implemented clean 390-pixel full page:
  `output/playwright/continuation-tempo-after-full-light-390.png`;
- implemented 768-pixel state:
  `output/playwright/continuation-tempo-after-light-768.png`;
- implemented 820- and 821-pixel intermediate evidence:
  `output/playwright/continuation-tempo-after-boundary-820.png` and
  `output/playwright/continuation-tempo-after-boundary-821.png`;
- final 960- and 961-pixel structure boundary:
  `output/playwright/continuation-tempo-after-boundary-960.png` and
  `output/playwright/continuation-tempo-after-boundary-961.png`;
- preserved 1440-pixel desktop composition:
  `output/playwright/continuation-tempo-after-desktop-1440.png`.

## 2026-08-06 mobile relationship-authority pass

The clean 390-pixel baseline measured the relationship-authority and questions
section at 1,771 pixels. Its authority block repeated the desktop card heights
after collapsing to one column, so three short statements occupied more than
half of the section. The practical questions themselves measured only about
489 pixels and were not the source of the excess length.

Two rendered architectures preserved the same Remember, Propose, decision
boundary, and Decide content:

1. **A - Vertical causal rail:** compact all three stages into one sequence
   with a continuous accent rail.
2. **B - System pair and human decision:** keep Remember and Propose together
   as the system's two limited capabilities, then give Decide the full-width
   terminal row below the execution-authority boundary.

Branch B won at 390 pixels. It makes the product boundary legible from shape:
two system-side capabilities share equal status, while human authority remains
the only full-width outcome. It also avoids adding a decorative line and
reduces the boundary to about 376 pixels, compared with about 490 pixels for
branch A. Below 340 pixels the pair returns to a compact single column so the
two headings and provenance lines do not become cramped.

At 390 pixels the full section falls from 1,771 to about 1,506 pixels and the
complete page falls from 10,215 to 9,950 pixels. Every authority statement and
all four FAQ questions remain present. Browser measurements report document
width equal to viewport width at 320, 339, 340, 390, 560, 561, 820, 821, and
1440 pixels. The 1440-pixel composition remains unchanged.

Rendered and runtime evidence:

- 390-pixel baseline:
  `output/playwright/continuation-questions-before-light-390.png`;
- branch A vertical-rail prototype:
  `output/playwright/continuation-questions-prototype-a-390.png`;
- branch B paired-system prototype:
  `output/playwright/continuation-questions-prototype-b-390.png`;
- implemented 390-pixel light and dark states:
  `output/playwright/continuation-questions-final-light-390.png` and
  `output/playwright/continuation-questions-final-dark-390.png`;
- implemented 320-pixel narrow fallback:
  `output/playwright/continuation-questions-after-light-320.png`;
- clean implemented 390-pixel full page:
  `output/playwright/continuation-home-final-light-390.png`.

## 2026-08-06 research-hierarchy pass

Fresh 1440- and 390-pixel full-page captures showed that the research section
had become the clearest remaining example of the original review's evenly
weighted late-page rhythm. Both essays used the same title scale, row height,
body weight, and redline treatment even though the candidate-momentum essay is
the more direct category explanation.

Two rendered structures were compared:

1. **A - Primary paper and further reading:** preserve the existing
   research spine, enlarge the first title and excerpt, and reduce and inset
   the second paper.
2. **B - Horizontal research canvas:** stack the section introduction above a
   wide asymmetric two-paper spread.

Branch A won. Branch B created a stronger poster-like silhouette, but increased
the desktop section from about 758 to 1,081 pixels and introduced a large empty
upper-right field. That repeated the original evaluation's problem of mistaking
unoccupied space for useful breathing room. Branch A reaches the intended
hierarchy while keeping the causal spine, article order, summaries, links, and
desktop compactness.

The implemented type scale is fluid above 1080 pixels. At 1081 pixels the
primary title now occupies four lines instead of the five produced by a fixed
desktop size; it grows smoothly to the larger 1440-pixel composition. Through
820 pixels the first paper receives the consequential red top rule and the
second paper is inset by 32 pixels. At 320 pixels the inset still leaves a
268-pixel reading measure with no horizontal overflow.

The resulting research section measures about 835 pixels at 1440 pixels and
1,238 pixels at 390 pixels, compared with about 758 and 1,195 pixels before.
The modest added height buys a visible primary-versus-secondary hierarchy
rather than another equal row. Document width remains equal to viewport width
at 320, 390, 560, 561, 820, 821, 1080, 1081, and 1440 pixels.

Rendered and runtime evidence:

- current 1440- and 390-pixel full-page baselines:
  `output/playwright/continuation-audit-current-1440.png` and
  `output/playwright/continuation-audit-current-390.png`;
- isolated baseline at both target widths:
  `output/playwright/continuation-research-before-1440.png` and
  `output/playwright/continuation-research-before-390.png`;
- branch A hierarchy prototypes:
  `output/playwright/continuation-research-prototype-a-1440.png` and
  `output/playwright/continuation-research-prototype-a-390.png`;
- branch B horizontal-canvas prototypes:
  `output/playwright/continuation-research-prototype-b-1440.png` and
  `output/playwright/continuation-research-prototype-b-390.png`;
- final light 390-, 820-, 821-, 1081-, and 1440-pixel states:
  `output/playwright/continuation-research-after-light-390.png`,
  `output/playwright/continuation-research-after-light-820.png`,
  `output/playwright/continuation-research-after-light-821.png`,
  `output/playwright/continuation-research-after-fluid-1081.png`, and
  `output/playwright/continuation-research-after-fluid-1440.png`;
- final dark 390-pixel state:
  `output/playwright/continuation-research-after-dark-390.png`;
- clean 320-pixel fallback:
  `output/playwright/continuation-research-final-clean-320.png`;
- clean final 1440- and 390-pixel full pages:
  `output/playwright/continuation-research-final-clean-full-1440.png` and
  `output/playwright/continuation-research-final-clean-full-390.png`.

Runtime inspection also confirms that the desktop spine node changes from the
page background to a muted vermilion fill on article hover, and title-link
keyboard focus retains a visible two-pixel solid outline.

## 2026-08-06 causal-state motion pass

Fresh 1440-, 1024-, 390-, and 320-pixel initial-viewport captures confirmed
that the original hero failures remain resolved: the desktop headline occupies
two lines, mobile occupies three, both calls to action are visible, the product
surface begins inside the first mobile viewport, and document width equals the
viewport. The remaining weakness was behavioral rather than structural.
Removing an evidence phrase changed the supported state and dependency, but
the changed row had no transition distinct from the whole dependency panel.

Two rendered transition directions were compared at the same 1440-pixel
workbench state:

1. **A - Targeted row recalculation:** briefly wash only the state row governed
   by the selected evidence and settle its new value into place.
2. **B - Central seam pulse:** expand the vertical redline and re-enter the
   complete proposed-change pane.

Branch A won. Its transition frame visibly identifies Work mode as the state
affected by removing the remote-flexibility phrase. Branch B is more dramatic
but does not identify which fact changed and makes stable content appear to
move. The implemented transition therefore uses the existing accent-soft
surface, one two-pixel consequential rule, and opacity and transform only.

The row feedback runs for 720 milliseconds, while its value settles in 360
milliseconds. It replays when evidence is restored as well as removed.
Decision-window, current-pressure, and work-mode evidence each target only
their governing row. Availability has no direct state row and correctly
recalculates only the dependency. The existing live-region messages remain the
screen-reader explanation of the resulting state.

Rendered and runtime evidence:

- current 1440-pixel state before and after evidence removal:
  `output/playwright/continuation-causal-motion-before-1440.png` and
  `output/playwright/continuation-causal-motion-current-after-1440.png`;
- targeted-row prototype transition and settled frames:
  `output/playwright/continuation-causal-motion-prototype-a-1440.png` and
  `output/playwright/continuation-causal-motion-prototype-a-settled-1440.png`;
- seam-pulse prototype transition and settled frames:
  `output/playwright/continuation-causal-motion-prototype-b-1440.png` and
  `output/playwright/continuation-causal-motion-prototype-b-settled-1440.png`;
- implemented evidence-removal and restoration transition frames:
  `output/playwright/continuation-causal-motion-after-removal-1440.png` and
  `output/playwright/continuation-causal-motion-after-restoration-1440.png`;
- clean 390-pixel light and dark transition frames:
  `output/playwright/continuation-causal-motion-clean-light-390.png` and
  `output/playwright/continuation-causal-motion-clean-dark-390.png`;
- latest initial-viewport evidence at desktop, intermediate, and mobile sizes:
  `output/playwright/continuation-hero-audit-light-1440.png`,
  `output/playwright/continuation-hero-audit-light-1024.png`,
  `output/playwright/continuation-hero-audit-light-390.png`, and
  `output/playwright/continuation-hero-audit-light-320.png`.

Browser inspection confirms that keyboard Enter activation produces the same
transition, preserves the evidence button's two-pixel focus outline, and
retains equal document and viewport widths at 320, 390, 820, 821, and 1440
pixels. Under `prefers-reduced-motion: reduce`, both the row wash and value
settle report `animation-name: none`; the content and live-region update still
occur immediately.

## 2026-08-06 mobile-navigation refinement

The original critique classified the missing mobile menu and primary call to
action as a completion failure. The menu now existed functionally, but a fresh
390-pixel open-state capture showed a generic divided link list, an excessive
empty interval before the call to action, and no visual continuity with the
page's evidence-to-decision grammar.

Three rendered directions were compared:

1. the existing plain link list;
2. a numbered evidence-rail directory;
3. a restrained redline context statement followed by the navigation.

The third direction won. The numbered rail was precise but read like a design
system index. The selected direction uses one consequential red rule, a short
plain-language context statement, calmer 58-pixel navigation rows, a demoted
Sign in link, and a Request access action placed directly after the choices.
It preserves the existing navigation labels and destinations.

Rendered evidence:

- original 390-pixel menu:
  `output/playwright/mobile-nav-390-light-before.png`;
- numbered rail comparison:
  `output/playwright/mobile-nav-390-prototype-b.png`;
- selected redline comparison:
  `output/playwright/mobile-nav-390-prototype-c.png`;
- implemented 390-pixel light state:
  `output/playwright/mobile-nav-390-light-after.png`;
- implemented 320-pixel final state:
  `output/playwright/mobile-nav-320-dark-final.png`.

Browser inspection at 320 pixels reports document width equal to viewport
width, five 58-pixel primary targets, and 48-pixel Sign in and Request access
targets. While open, body scrolling is locked and main and footer are inert.
Escape closes the menu, restores body scrolling, removes inert state, and
returns focus to the menu button. The mobile menu is present at 767 pixels and
the desktop navigation replaces it at 768 pixels.

## 2026-08-06 long-page orientation pass

Fresh full-page captures at 1440 and 390 pixels confirmed that the page now has
distinct section rhythms and strong local hierarchy. They also exposed a
long-page navigation weakness: the sticky header looked identical at the hero,
relationship-authority section, FAQ, and closing proof register. The mobile
page measures about eleven initial viewports, yet reopening its menu gave no
indication of the reader's current section.

Two rendered orientation directions were compared at the Questions section:

1. **A - Full-width redline progress:** a two-pixel vermilion line advances
   across the header with document scroll.
2. **B - Current-section marker:** only the relevant navigation label and its
   short redline become current.

Branch B won. The full-width line read as loading progress and made the
consequential redline decorative. The current-section marker answers the
navigation question directly, retains the header's calm hierarchy, and also
works when the mobile menu is reopened.

The implemented state uses `IntersectionObserver`, not a continuous scroll
listener. Product, Method, Principles, and Questions receive
`aria-current="location"` when their section owns the reading position. Blog
receives the same current state on the blog route. The visual treatment reuses
the existing hover redline on desktop and the menu's two-pixel red rule on
mobile.

Rendered and runtime evidence:

- current full-page baselines:
  `output/playwright/continuation-full-audit-1440.png` and
  `output/playwright/continuation-full-audit-390.png`;
- orientation baseline and full-width progress comparison:
  `output/playwright/nav-orientation-baseline-1440.png` and
  `output/playwright/nav-orientation-prototype-a-progress-1440.png`;
- selected current-section comparison:
  `output/playwright/nav-orientation-prototype-b-active-1440.png`;
- final Product and Questions desktop states:
  `output/playwright/nav-orientation-final-product-1440.png` and
  `output/playwright/nav-orientation-final-questions-1440.png`;
- final reopened mobile menu at Questions:
  `output/playwright/nav-orientation-final-questions-mobile-390.png`.

Browser inspection confirms the current state changes from Product to Method,
Principles, and Questions at the corresponding reading positions. Exactly one
desktop link carries `aria-current` at a time. At 390 pixels the reopened menu
marks Questions with the same accent and 26-pixel left inset while preserving
the 58-pixel target height. The `/blog` route marks only Blog as current.

## 2026-08-06 dark-surface depth pass

Fresh dark-theme full-page captures at 1440 and 390 pixels showed that the
typography, vermilion state language, and closing proof register retained their
hierarchy. The remaining weakness was material depth. The workbench, decision
ledger, and other evidence surfaces sat very close to the page's warm-black
background and depended heavily on their borders to remain legible as objects.

Two rendered dark-surface directions were compared at the 1440-pixel hero:

1. **A - Raised paper surfaces:** increase only the three dark surface levels
   and the inset edge highlight.
2. **B - Stronger outlines:** keep the original surface values while increasing
   line opacity and shadow depth.

Branch A won. Stronger outlines made the interface feel like a dark
administration console. Raised surfaces preserved the professional-notebook
character and made the product evidence feel like physical paper without
introducing glow, gradients, or another accent color.

The implemented dark tokens move `surface` from `#1c1c19` to `#21211d`,
`surface-muted` from `#242420` to `#292924`, and `surface-strong` from
`#30302b` to `#34342e`. The inset edge highlight increases from 6.5% to 8.5%.
Background, typography, accent, semantic colors, layout, and all light-theme
tokens remain unchanged.

Rendered and runtime evidence:

- original dark full pages:
  `output/playwright/dark-audit-current-full-1440.png` and
  `output/playwright/dark-audit-current-full-390.png`;
- original dark hero, decision, authority, and mobile states:
  `output/playwright/dark-audit-current-hero-1440.png`,
  `output/playwright/dark-audit-current-judgment-1440.png`,
  `output/playwright/dark-audit-current-authority-1440.png`, and
  `output/playwright/dark-audit-current-hero-390.png`;
- raised-surface and stronger-edge comparisons:
  `output/playwright/dark-depth-prototype-a-surface-1440.png` and
  `output/playwright/dark-depth-prototype-b-edge-1440.png`;
- final dark desktop and mobile states:
  `output/playwright/dark-depth-final-hero-1440.png`,
  `output/playwright/dark-depth-final-hero-390.png`, and
  `output/playwright/dark-depth-final-full-390.png`.

Calculated contrast against the final dark surface is 13.80:1 for primary ink,
6.11:1 for muted text, and 4.74:1 for the vermilion accent. Browser inspection
reports equal document and viewport widths at 320 and 390 pixels. Switching
back to light reports the original `#fcfbf7`, `#eceae4`, and 72% white edge
highlight values, confirming the light theme did not change.

## 2026-08-06 tablet-navigation pass

Fresh 768-, 820-, and 1024-pixel screenshots exposed a responsive gap that
overflow checks had not found. At 768 pixels the brand, five navigation links,
theme control, and Sign in all technically fit, but the navigation had fallen
to about 11.5-pixel text with compressed gaps. The header looked like a desktop
navigation forced into a tablet width. The page content already uses its
single-column workbench through 820 pixels.

Two rendered breakpoint directions were compared:

1. **A - Align at 820:** use the complete menu through 820 pixels and restore
   desktop navigation at 821 pixels, matching the product-workbench breakpoint.
2. **B - Extend through 900:** retain the menu through 900 pixels.

Branch A won. The 900-pixel screenshot has sufficient room for the full
desktop navigation and split hero, so hiding it there reduces discoverability.
At 820 pixels the menu gives the header a clear brand/action composition and
retains the full-size navigation labels and targets.

The implemented tablet range is 768 through 820 pixels. It reuses the same
64-pixel header, full-height navigation, current-section marker, Sign in
demotion, and Request access action as the narrower mobile menu. At 821 pixels
the 72-pixel desktop header and full navigation return.

Rendered and runtime evidence:

- original 768-, 820-, and 1024-pixel states:
  `output/playwright/tablet-audit-current-768.png`,
  `output/playwright/tablet-audit-current-820.png`, and
  `output/playwright/tablet-audit-current-1024.png`;
- 900-pixel desktop direction and the two menu-threshold comparisons:
  `output/playwright/tablet-nav-direction-a-desktop-900.png`,
  `output/playwright/tablet-nav-direction-a-menu-820.png`, and
  `output/playwright/tablet-nav-direction-b-menu-900.png`;
- final closed and open 820-pixel states:
  `output/playwright/tablet-nav-final-closed-820.png` and
  `output/playwright/tablet-nav-final-open-820.png`;
- final 821-pixel desktop state:
  `output/playwright/tablet-nav-final-desktop-821.png`.

Browser inspection reports equal document and viewport widths at 820 and 821
pixels. The open tablet menu preserves five 58-pixel primary targets and
48-pixel Sign in and Request access targets, locks body scrolling, and makes
main inert. Resizing an open menu from 820 to 821 pixels now closes it through
`matchMedia`, restores body scrolling, removes inert, hides the menu button,
and reveals the desktop navigation.

## 2026-08-06 workbench-breakpoint pass

The tablet-navigation screenshots exposed a second, independent breakpoint
problem. At 821 pixels the desktop navigation had enough room, but the product
workbench also switched immediately from one column to a 46/54 split. Fresh
821-, 860-, 880-, and 900-pixel screenshots showed that the source quotation
became a stack of short lines while the proposed changes and dependency card
competed for a narrow right pane. There was no overflow, but the evidence was
materially harder to scan.

Two rendered directions were compared at 880 pixels:

1. preserve the evidence sequence as full-width source followed by proposed
   change;
2. retain the split while reducing quotation size, pane padding, and dependency
   density.

The sequential direction won because it preserves evidence weight and readable
line length instead of making the primary product proof smaller to satisfy a
layout breakpoint. Navigation and product-evidence breakpoints are now
independent: desktop navigation returns at 821 pixels, while the workbench
remains sequential through 899 pixels and returns to the side-by-side redline
at 900 pixels.

Rendered evidence:

- original split states:
  `output/playwright/workbench-audit-821.png`,
  `output/playwright/workbench-audit-860.png`, and
  `output/playwright/workbench-audit-880.png`;
- final sequential boundary:
  `output/playwright/workbench-final-821.png` and
  `output/playwright/workbench-final-899.png`;
- final split boundary:
  `output/playwright/workbench-final-900.png` and
  `output/playwright/workbench-final-960.png`.

At 821 and 899 pixels the source identity, time, provenance, removal
instruction, quotation, and evidence count remain visible as one calm reading
surface. At 900 and 960 pixels both panes remain legible, the dependency window
stays contained, and the redline divider again communicates direct comparison.

## 2026-08-06 practical-questions ledger pass

Fresh full-page screenshots at 1440 and 390 pixels identified the questions
area as the weakest remaining transition in the lower half of the page. The
desktop two-column accordion was compact, but opening the first answer created
unequal column heights and separated the answer from the page's evidence-ledger
language.

Two rendered desktop directions were compared:

1. retain two independent accordion columns;
2. render each question as a full-width ledger row, with the open answer
   occupying a distinct evidence column.

The ledger direction won at desktop width. It connects question and answer
without adding cards, shadows, or invented proof, and lets the border describe
an inspectable relationship. It is enabled from 1081 pixels upward. The
existing tablet and mobile accordion remains unchanged because it has the
clearer reading order at narrower widths.

Rendered evidence:

- original desktop direction:
  `output/playwright/questions-current-crop-1440.png`;
- temporary ledger comparison:
  `output/playwright/questions-direction-b-ledger-crop-1440.png`;
- final breakpoint states:
  `output/playwright/questions-final-1080.png`,
  `output/playwright/questions-final-1081.png`, and
  `output/playwright/questions-final-1440.png`;
- preserved mobile composition:
  `output/playwright/questions-final-390.png`.

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
