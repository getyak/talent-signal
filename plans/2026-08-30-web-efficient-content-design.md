# Web efficient content design

Status: completed
Owner: Codex
Started: 2026-08-30

## Outcome

Make the public Web experience feel like an efficient product proof rather
than a typography-led scroll narrative. A recruiter should understand the
source, proposed change, human decision boundary, and next place to interact
with less scrolling and less headline dominance.

## Boundary

In scope:

- the public homepage hierarchy, typography, spacing, and signal journey;
- replacing scroll distance with explicit chapter interaction on desktop;
- preserving the existing synthetic evidence, source switching, provenance,
  human-control language, responsive behavior, and reduced-motion behavior;
- a narrow canonical design-system correction and visual verification.

Out of scope:

- authentication, workspace contracts, backend behavior, or external writes;
- changing the governed product model or adding candidate scoring;
- redesigning unrelated routes or the currently modified Today workspace;
- new third-party assets, routes, or dependencies.

## Current evidence

- At a 976 x 890 viewport, the homepage is about 7,335 px tall.
- The hero uses a 3.9–6.55 rem headline and reserves nearly a full viewport
  before the interactive proof.
- The signal journey reserves 430 vh for four stages while keeping one sticky
  visual in view. This creates substantial scroll cost without exposing more
  simultaneous information.
- Downstream section headings scale as high as 5.7 rem and repeatedly outrank
  the evidence, state, and action content they introduce.
- The existing chapter and source controls already provide a stronger basis
  for direct interaction than the current scroll-linked progression.

## Chosen approach

Use a compact, interaction-led proof:

1. Reduce the hero and section type scale so headings name the claim without
   becoming the primary product object.
2. Add a compact three-part proof ledger to the hero so the first viewport
   contains source, proposal, and human-decision information.
3. Replace the 430 vh signal journey with an explicit four-chapter selector.
   Each chapter changes the visible stage immediately and remains keyboard
   operable; source selection remains independent.
4. Tighten vertical spacing and repeated presentation while preserving the
   existing evidence-first narrative and warm-neutral/vermilion system.

Rejected alternatives:

- a global font-size multiplier, because it would shrink controls and evidence
  indiscriminately without repairing hierarchy;
- removing product proof sections, because the page needs more usable evidence
  per viewport, not less product truth;
- retaining the sticky scroll scene at a shorter height, because the page
  would still make scrolling, rather than the chapter controls, own progress.

## Milestones

1. **Completed — Audit and baseline.** Capture the current hero, signal
   journey, typography sources, and responsive structure.
2. **Completed — Content-first composition.** Implement the compact hero ledger,
   direct chapter interaction, and restrained type/spacing scale.
3. **Completed — Responsive proof.** Verified desktop and narrow layouts, all
   chapter and source controls, Enter and Space activation, dark mode, focus,
   overflow, and the reduced-motion implementation.
4. **Completed — Engineering and knowledge checks.** Web lint, typecheck, tests,
   and production build pass. The isolated owned documentation change passes
   `pnpm docs:check`; the shared dirty tree remains blocked only by a concurrent,
   unrelated line-budget change in `docs/agent-system.md`.

## Completion evidence

- before-and-after screenshots at the same desktop viewport plus a narrow
  viewport screenshot;
- materially lower page height and no 430 vh journey reservation;
- all four chapter controls visibly change the proof stage;
- source controls still change synthetic evidence without implying confirmed
  state or external action;
- no horizontal overflow, visible focus, and correct reduced-motion behavior;
- Web lint, typecheck, focused tests/build, and `pnpm docs:check` pass.

## Delivered evidence

- The same 976 x 890 first viewport now exposes the product proof visual and a
  source/change/decision ledger instead of being dominated by one headline.
- The page height fell from about 7,335 px to about 6,270 px at that viewport,
  and the signal journey no longer reserves 430 vh.
- All four chapters, all five synthetic sources, Enter and Space activation,
  dark mode, and a 390 x 844 narrow viewport were exercised in the real Web
  surface. No horizontal overflow or clean-session browser errors remained.
- `pnpm --filter @talent-signal/web lint`, `typecheck`, `test`, and `build` pass;
  267 Web tests passed and one was skipped.
- `pnpm docs:check` passes in an isolated worktree containing the owned
  documentation diff. The current shared tree has an unrelated concurrent
  failure because `docs/agent-system.md` exceeds its canonical line budget.

## Reconsider when

- recruiter testing shows that a guided narrative materially improves
  comprehension more than direct comparison;
- the page gains real customer evidence that needs a different information
  architecture;
- a distinct onboarding route becomes the better home for long-form education.
