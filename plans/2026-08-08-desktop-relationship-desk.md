# Desktop relationship desk

Status: complete
Owner: Codex
Started: 2026-08-08

## Outcome

The public relationship product view includes a production-shaped desktop
workspace that is more legible, ownable, and interactive than the supplied
Today and account-workspace references. It must make the current dependency,
exact evidence, and one separately controlled next action clear within five
seconds.

## Boundary

In scope:

- the desktop interactive product view on `/relationships`;
- Today, People, and Searches navigation using synthetic fixtures;
- an exact-evidence review with visible state change and independent action
  staging;
- light, dark, reduced-motion, keyboard, desktop, and responsive behavior;
- preserving the existing mobile relationship concept below the desktop
  breakpoint.

Out of scope:

- changing authenticated workspace authority or backend contracts;
- real candidate data, connectors, notifications, or external writes;
- candidate, stakeholder, fit, culture, or acceptance scoring;
- replacing the existing route, marketing copy, URLs, or legal boundaries.

## Product invariant

- Visitor: an independent recruiter returning between live conversations.
- Tension: several relationships changed, but only a few deserve judgment now.
- Understand: which dependency matters, why it returned, and what evidence
  supports it.
- Feel: calm, oriented, and in control of consequence.
- Do: inspect one evidence-backed change and decide whether to stage the
  smallest safe next step.
- Ownable truth: removing or contesting exact evidence retracts the proposed
  relationship state and dependent action; fact review never grants effect
  authority.

## Recursive design tree

### D1: brand theorem

- Question: What metaphor makes the product recognizable without the logo?
- Parent invariant: evidence, change, dependency, and action must remain one
  governed chain.
- Branch A: **Editorial evidence desk**. A well-edited relationship brief with
  a vermilion causal seam joining source and proposed state.
- Branch B: **Relationship atlas**. A one-hop map that reorganizes the desk
  around people, assignments, and typed connections.
- Evidence needed: five-second clarity, product-mechanic visibility, and
  keyboard-safe interaction at 1440px and 390px.
- Expected visible difference: A is linear and decision-led; B is spatial and
  connection-led.
- Failure signal: the result looks like a CRM dashboard or a decorative graph.
- Winner: Branch A.
- Why: Today asks one linear question and exact evidence is clearer beside the
  current dependency than behind a graph gesture.
- Challenger retained: Branch B for a future question-specific relationship
  graph, not the default return surface.
- Backtrack condition: recruiters cannot recover broader context from People
  and Searches without opening several screens.

### D2: workspace architecture

- Question: How should the editorial desk distribute context and consequence?
- Parent invariant: the current dependency leads; evidence and action remain
  one click away.
- Branch A: **Four-part desk**. Stable icon rail, contextual list, living brief,
  and consequence rail with one bottom intent composer.
- Branch B: **Stacked dossier**. Daily briefs first, evidence ledger below, and
  a slide-over action review.
- Evidence needed: first-viewport comparison with real synthetic content.
- Expected visible difference: A supports persistent comparison; B creates a
  quieter reading page but hides cross-relationship context.
- Failure signal: repeated cards or an action rail that implies approval.
- Winner: Branch A.
- Why: it preserves the reference images' strongest spatial rhythm while the
  causal seam and consequence language make it specific to Talent Signal.
- Challenger retained: Branch B as the narrow-screen collapse model.
- Backtrack condition: the central brief falls below 520px or the right rail
  crowds exact evidence at supported desktop widths.

## Reference mechanisms

- Things: sparse Today hierarchy and progressive disclosure, without reducing
  relationships to checkboxes.
- Granola: quiet document reading and preparation before an event, without
  turning a source transcript into an authoritative summary.
- Linear: Agent state stays attached to the owned work object and humans keep
  final approval.
- Attio: coherent people and assignment records across views, without adopting
  generic CRM breadth.
- Raycast: one compact intent threshold, without opaque tool execution.

## Milestones

### 1. Audit and A/B composition

Status: complete

- capture the current desktop relationship surface;
- render the editorial desk and relationship-atlas challenger at low fidelity;
- compare pairwise and retain screenshots under `output/playwright/`.

Evidence:

- both branches are visibly different without relying on palette swaps;
- the selected branch makes the dependency and provenance path clearer.

Observed evidence:

- `output/playwright/prototype-a-editorial-desk.png` keeps the dependency,
  source quote, owner, due date, and action boundary in one reading path;
- `output/playwright/prototype-b-relationship-atlas.png` is more spatially
  novel but spends too much of the first viewport on connection geometry and
  makes the next judgment slower;
- pairwise result: editorial desk leads on product truth (+2), five-second
  clarity (+2), feasibility (+1), and accessibility risk (+1); the atlas leads
  on raw ownability (+1), but not enough to outweigh its weaker default-task
  fit.

### 2. Complete desktop slice

Status: complete

- implement the four-part shell and responsive fallback;
- add Today, People, and Searches states;
- add evidence review, state dismissal/restoration, and action staging;
- make synthetic and draft-only boundaries visible.

Evidence:

- every consequential control has a visible state transition;
- no action is sent, scheduled, or silently approved;
- no-action and unresolved states remain first-class.

Observed evidence:

- Today, People, and Searches share one selected relationship state rather than
  presenting disconnected dashboard cards;
- the evidence dialog supports keep, revise, dismiss, focus return, and Escape,
  while the next action remains a separately staged draft;
- quiet and unresolved-identity fixtures remove the action instead of creating
  urgency, and switching objects resets staged authority;
- the public route declares that its records are synthetic and persists no
  candidate data.

### 3. Functional and visual proof

Status: complete

- verify desktop, dark, reduced-motion, keyboard, and mobile behavior;
- run lint, typecheck, tests, build, and `pnpm docs:check`;
- capture final Today, Searches, evidence, and mobile screenshots.

Evidence:

- real browser screenshots demonstrate hierarchy and state changes;
- relevant repository checks pass;
- no unrelated user changes are overwritten.

Observed evidence:

- final browser captures cover Today, Searches, evidence review, revised
  wording, unresolved identity, 1024-pixel layout, dark mode, and the existing
  390-pixel mobile concept under `output/playwright/`;
- the route was exercised with keyboard focus, Escape dismissal, focus return,
  reduced motion, 200 percent root text, and horizontal-overflow checks;
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
  `pnpm docs:check` pass on the completed slice;
- four independent review artifacts preserve recruiter, candidate, evidence
  safety, and mobile limitations without converting synthetic proof into a
  production claim;
- a clean production build generated all 25 static pages; final Lighthouse
  scores were 97/100/100/100 on desktop and 92/100/100/100 on mobile for
  performance/accessibility/best-practices/SEO;
- the final panel validated with all four applicable reviewers at 3/4 and no
  vetoes; its `needs_evidence` release gate preserves the remaining field,
  assistive-technology, provenance, and mobile-performance gaps.

## Completion evidence

- `/relationships` renders the desktop relationship desk above 900px and the
  existing mobile product concept below that breakpoint;
- Today identifies at most three evidence-supported dependencies;
- one decision-relevant fact opens exact source metadata and visible before
  and proposed values;
- dismissing the fact retracts the dependent action, and restoring it recovers
  the proposal without an external effect;
- People and Searches preserve semantic parity with the same synthetic
  relationship state;
- light, dark, reduced-motion, keyboard, desktop, and mobile checks pass.
