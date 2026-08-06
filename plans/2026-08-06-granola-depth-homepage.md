# Granola-depth homepage evolution

## Outcome

Evolve the public Talent Signal site from a strong but mostly click-driven
evidence demonstration into a tactile, recruiter-specific relationship
instrument. The page should borrow Granola's interaction principles without
copying its visual identity: working product proof in the first viewport,
continuous spatial context, spring-like direct manipulation, and calm
state-aware feedback.

The result must also make every primary navigation destination useful and
clickable, improve the recruiting narrative through the project's specialist
lenses, and keep `/sitemap.xml` accurate, canonical, and verifiable.

## Boundary

In scope:

- public homepage narrative and production copy;
- homepage evidence interaction, including pointer drag and equivalent click,
  keyboard, touch-scroll, and reduced-motion behavior;
- public header and footer navigation;
- public sitemap generation and deterministic coverage tests;
- responsive, dark-mode, accessibility, performance, and browser verification;
- durable evaluation packets and a final adjudicated release decision.

Out of scope:

- product workspace behavior or current uncommitted workspace implementation;
- new authentication behavior;
- candidate scoring, assessment, ranking, or acceptance prediction;
- any external message, calendar, ATS, contact, or notification write;
- invented customer logos, testimonials, adoption, or outcome claims;
- route removal or changing legal/privacy claims.

## Frozen baseline

- Repository commit: `80cdb51da817bcc4ebcb923df50129624df1816f`.
- The review object is the current local public homepage and its related
  marketing files, including existing user changes in `globals.css`.
- Baseline rendered evidence:
  `output/playwright/home-current-full-1440.png` and
  `output/playwright/home-current-full-390.png`.
- Existing interaction: four exact source clauses are native pressed-state
  buttons; changing one recalculates dependent state and action.
- Existing public sitemap: production returns HTTP 200 and `application/xml`
  with eight canonical public URLs. It is not broken, but it includes
  search-engine-ignored priority/change-frequency hints and relies on a
  manually repeated site date without a focused contract test.

## Design read

Public B2B product narrative for independent recruiters and boutique search
teams, with a quiet evidence-instrument language and more tactile spatial
behavior.

- `DESIGN_VARIANCE: 7`
- `MOTION_INTENSITY: 7`
- `VISUAL_DENSITY: 4`
- System: existing Next.js, native CSS, Manrope/mono, Phosphor icons, warm
  neutrals, and one restrained vermilion accent.
- Redesign mode: targeted evolution. Preserve the brand mark, routes, anchors,
  evidence/action boundary, dark mode, and existing accessibility wins.

## Granola mechanism translation

Use the current Granola public site as a mechanism reference, not a style kit.
Its useful qualities are:

- the core product works in the first viewport;
- state changes use compact spring feedback rather than broad reveal theater;
- one product object persists through a before/during/after narrative;
- sticky spatial continuity reduces the feeling of separate feature slides;
- concrete product language precedes abstract capability lists.

Talent Signal translation:

- an exact evidence clause can be physically picked up and moved;
- a thresholded release changes whether that clause is in scope;
- the clause springs back into its source position so provenance is never
  visually detached;
- dependent state, deadline, and next action recompose together;
- ordinary click and keyboard activation produce the same state;
- touch keeps vertical page scrolling available;
- reduced motion keeps state change immediate and static.

## Specialist lens TODO

### Recruiter workflow reviewer

- [ ] Replace the metaphor-first hero copy with a recruiter job and result that
  can be understood in five seconds.
- [ ] Keep one complete `conversation -> reviewed change -> next move` loop
  visible before broad principles.
- [ ] Make the direct manipulation instructional text explicit but brief.
- [ ] Keep `no_action` as a legitimate output and avoid manufactured urgency.
- [ ] Keep the access request, live demo, and returning-user sign-in as three
  distinct intents.

### Evidence safety reviewer

- [ ] Never move or copy a clause in a way that implies provenance was severed.
- [ ] Treat drag as a proposal-scope change, not fact confirmation or execution
  authority.
- [ ] Preserve source, speaker, time, assignment context, uncertainty, before
  and after state, and separate action approval.
- [ ] Keep all generated examples explicitly synthetic.
- [ ] Keep privacy and deletion claims within what the repository supports.

### Mobile UX reviewer

- [ ] Preserve the strict source-before-interpretation reading order.
- [ ] Keep vertical touch scrolling while horizontal clause drag is available.
- [ ] Provide click, keyboard, focus, pressed-state, and textual status
  equivalents.
- [ ] Verify 320, 390, 820, 821, 900, 1024, and 1440-pixel layouts as relevant.
- [ ] Verify light, dark, reduced motion, long text, and zero horizontal
  overflow.

### Candidate experience guardrail

- [ ] Describe the product as protecting attentive follow-through rather than
  increasing outreach volume.
- [ ] Keep candidate silence and ambiguity as unknown, not disengagement.
- [ ] Keep client-owned delay visible instead of pushing the candidate again.
- [ ] Avoid faux empathy, automated pressure, or hidden personalization claims.

### Selection science auditor

- [ ] Keep attention priority separate from candidate quality.
- [ ] Remove or reject any fit, potential, personality, culture, acceptance, or
  engagement score.
- [ ] Keep the marketing claim at the operational fact/action level.
- [ ] Add deterministic sitemap and interaction-contract checks rather than a
  decorative overall score.

### Inclusive sourcing recall

- [ ] Record sourcing as out of scope for this homepage loop.
- [ ] Ensure site search/SEO language does not imply candidate matching,
  ranking, or profile completeness as quality.
- [ ] Keep a future sourcing expansion separate from candidate momentum.

### Recruiting trend radar

- [ ] Use current sources for competitive and platform assumptions.
- [ ] Treat Granola's tactile website and bot-free positioning as mechanism
  signals, not product-market proof for Talent Signal.
- [ ] Prefer a falsifiable recruiter field test over copying trend language.

### Performance outcome fit

- [ ] Do not imply the sample candidate is a strong performance fit.
- [ ] Frame the next action as resolving one decision uncertainty, not merely
  advancing a stage.
- [ ] Keep role outcomes marked unknown unless direct evidence exists.

### Executive potential evidence

- [ ] Explicitly abstain from person-level potential judgment in the
  single-conversation demonstration.
- [ ] Preserve the distinction between current facts, readiness, and potential.
- [ ] Do not infer traits from writing style, urgency, or the sample name.

### Candidate decision motivation

- [ ] Treat remote flexibility and decision timing as candidate-owned,
  revisable evidence.
- [ ] Show unknowns and contradictions rather than a close-probability model.
- [ ] Direct the next action to the owner who can resolve the condition.

## Implementation TODO

- [ ] Rework hero copy around the recruiter's immediate question while keeping
  the redline as the visual causal seam.
- [ ] Add thresholded spring drag to exact evidence clauses with no continuous
  React state updates.
- [ ] Add visible grab/drag affordance and an equally clear non-drag path.
- [ ] Recompose dependent rows and action feedback without layout-jank motion.
- [ ] Redesign desktop navigation as one calm, single-line instrument with
  direct links to Live demo, Method, Research, and Trust.
- [ ] Redesign mobile navigation with destination descriptions, a distinct
  access request, and focus/escape/inert recovery.
- [ ] Update footer paths and labels to match the public information
  architecture.
- [ ] Rewrite high-leverage homepage copy for category clarity, human control,
  candidate dignity, and recruiter usefulness.
- [ ] Remove sitemap priority and change-frequency decoration, centralize
  canonical public routes, and use truthful content update dates.
- [ ] Add sitemap tests for unique canonical URLs, public-only coverage, valid
  dates, and deterministic order.
- [ ] Produce before/after desktop, mobile, dark, drag, click, keyboard, and
  reduced-motion evidence.
- [ ] Run lint, typecheck, focused tests, production build, docs check, and
  Lighthouse or the narrowest available performance proof.
- [ ] Save specialist packets, validate them, resolve vetoes, and publish a
  final adjudicated panel.

## Completion evidence

- Direct rendered proof that dragging an exact clause past the threshold
  updates its in-scope state, dependent relationship change, and next action,
  then returns the clause to its source position.
- Click and keyboard activation produce the same logical state.
- Reduced motion removes spring travel without removing state clarity.
- Navigation destinations resolve and the open mobile menu traps page
  interaction, closes on Escape, and restores focus.
- Production `/sitemap.xml` returns 200, `application/xml`, only canonical
  public routes, unique URLs, and accurate `lastmod` values.
- No active specialist veto remains.
- Relevant automated checks and production build pass.
