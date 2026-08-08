# Web signal journey

Status: completed on 2026-08-08.

## Outcome

Replace the static homepage workbench with a motion-led product proof that lets
visitors understand one complete Talent Signal journey:

`authorized screenshot → located evidence → reviewable relationship state → web
and iPhone surfaces`

The work should make the product legible to independent recruiters and
relationship-led sales operators without implying surveillance, autonomous
writes, candidate scoring, or production customer outcomes.

## Scope

In scope:

- the homepage hero and first product-proof section;
- synthetic source screenshots representing common recruiter channels;
- scroll-linked and click-driven product states;
- responsive and reduced-motion behavior;
- browser verification and targeted web checks.

Out of scope:

- changing the demo application's extraction engine;
- connector writes or external actions;
- replacing the existing research, trust-boundary, FAQ, and footer content;
- presenting generated channel images as real customer records.

## Current evidence

- The existing homepage proves provenance and retraction well, but its first
  viewport reads as a static evaluation console rather than a lived product.
- Granola's current site keeps a product object visually continuous while
  nearby copy changes by chapter. That rhythm is useful, but Talent Signal
  needs a source-to-relationship narrative rather than a note-taking demo.
- Repository research requires context binding before contact writes, atomic
  state diffs, visible evidence, and a separate human approval for external
  effects.

## Chosen direction

Use a vertical sticky scene on desktop and a scroll-snap source rail on mobile.
The source screenshot remains the visual anchor while evidence clauses lift
out, assemble into a relationship record, and reveal the corresponding web and
iPhone surfaces.

Rejected alternatives:

- forced horizontal page scrolling, because it harms navigation and mobile
  predictability;
- a generic four-step diagram, because it explains the pipeline without
  demonstrating the product;
- AI particles or opaque analysis animation, because they obscure provenance;
- recreating third-party chat screens from DOM boxes, because raster source
  artifacts are more honest and visually credible.

## Milestones

1. Inspect the current site, current Granola interaction, and homepage code.
2. Add synthetic source assets and a focused `SignalJourney` client component.
3. Replace the homepage hero proof while preserving downstream trust content.
4. Verify desktop, mobile, source switching, reduced motion, and keyboard
   behavior.
5. Run targeted lint, type, and build checks and capture final screenshots.

## Completion evidence

- Desktop screenshots cover the hero, evidence, and Web plus iPhone output
  stages in `web-motion-final/`.
- Mobile screenshots cover the hero, source, evidence, and context-binding
  states without sticky progression.
- The BOSS source control reports `aria-pressed="true"` and swaps to the
  corresponding source image in the production preview.
- Reduced-motion behavior is implemented through Motion's
  `useReducedMotion()` and a CSS media-query fallback that removes sticky
  progression and exposes the final result.
- Browser console errors: none.
- `pnpm --filter @talent-signal/web typecheck`: passed.
- `pnpm --filter @talent-signal/web lint`: passed.
- `pnpm docs:check`: passed.
- `pnpm --filter @talent-signal/web build`: passed.
