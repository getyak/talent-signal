# Authenticated workspace density redesign

Status: completed
Owner: Codex
Started: 2026-08-30

## Outcome

Make the signed-in Web workspace behave like a compact evidence instrument,
not a marketing narrative. At a 976 x 890 viewport, Today, People, and the
living relationship page should expose the current object, dependency,
evidence boundary, and next safe action without oversized titles or repeated
boundary prose consuming the first viewport.

## Boundary

In scope:

- the shared signed-in workspace typography and spacing contract;
- Today hierarchy, focus and no-action states;
- People directory header, search, rows, metadata, and empty state;
- the living relationship header and persistent Agent rail;
- long names, narrow desktop, mobile, dark, reduced-motion, keyboard, and
  visible-state boundaries;
- a narrow canonical design-system correction for authenticated work surfaces.

Out of scope:

- changing Pursuit, Person, evidence, Proposal, Action, or Receipt authority;
- inventing attention work, candidate scores, or acceptance/fit predictions;
- executing external effects or compiling relationship state during visual QA;
- unrelated Agent, backend, evaluation, deployment, or secret-management work.

## Current evidence

- Today and People use marketing-style page titles up to 6.8 rem with page
  padding and section gaps that can each exceed 80 px.
- Today repeats the same no-action meaning across counters, an eyebrow, a large
  statement, and explanatory copy.
- The People first viewport contains one 132 px row after a large narrative
  header and search composition.
- At 976 px wide, the product rail and persistent Agent consume 408 px before
  the living relationship page begins. Its 2.5-4 rem name then breaks inside
  the word while dependency, evidence, and action sit lower in the viewport.
- Operational metadata falls as low as roughly 0.58 rem, so the current system
  combines oversized display type with text that is too small to scan calmly.

Baseline screenshots are stored in the workspace-density-redesign visual
artifact folder for this thread.

## Chosen approach

1. Add a bounded signed-in typography and spacing contract: operational page
   titles remain below marketing scale while metadata stays at least 12 px.
2. Turn Today and People heroes into compact working headers, then let the
   governed content begin immediately below them.
3. Make the relationship identity a compact object header with an always
   visible work-state summary; preserve exact evidence and approval behavior.
4. Narrow the Agent rail and make it explicitly collapsible without losing
   scope, history, drafts, or mutation boundaries.
5. Preserve the warm-neutral/vermilion system while removing decorative
   gradients, display-serif behavior, and repeated trust copy from routine work.

Rejected alternatives:

- a global font-size multiplier, because it would make already-small metadata
  less legible and would not repair hierarchy;
- hiding evidence or history to gain density, because the product depends on
  inspectable provenance and recovery;
- adding more dashboard metrics, because efficiency comes from showing the
  current dependency and action, not from filling space with invented work.

## Milestones

1. **Completed - Baseline and ownership.** Confirm current visual evidence,
   affected files, and unrelated concurrent changes.
2. **Completed - Density contract and retrieval surfaces.** Refactor Today and
   People around compact operational headers and rows.
3. **Completed - Living relationship workspace.** Refactor the object header,
   Agent width/collapse interaction, long-name behavior, and narrow layout.
4. **Completed - Real-surface proof.** Verify all three routes in light, dark,
   desktop, and mobile states, including keyboard and no overflow.
5. **Completed - Engineering and knowledge proof.** Run focused tests, lint,
   typecheck, build, docs check, inspect the final diff, and preserve unrelated
   user work.

## Verification record

- At 976 x 890, Today and People render 32 px operational titles; the first
  People row is 84 px high and all audited pages have matching viewport and
  document widths.
- The signed-in start page fits its governed source workflow within one 890 px
  viewport after reducing its title from 44.9 px to 32 px.
- At 390 x 844, Today, People, and the living relationship page have no
  horizontal overflow. The Agent returns to full width and its desktop-only
  collapse control is hidden.
- Light and dark screenshots were accepted for Today, People, and the living
  relationship page. The relationship name stays on one desktop line and the
  current work state remains visible before the Wiki.
- The Agent rail uses a native button with `aria-expanded`, visible focus, and
  explicit expand/collapse labels. Browser click proof confirms both states;
  the accessibility contract test protects the native control semantics.
- Web lint, typecheck, 267 tests, the production build, documentation checks,
  and whitespace validation pass. The production build requires `AUTH_SECRET`,
  so verification used a process-local non-production secret without changing
  repository configuration.

## Completion evidence

- accepted before-and-after screenshots for Today, People, and the relationship
  page at the same 976 x 890 viewport;
- Today no-action content is compact and active content still leads with one
  evidence-backed decision;
- the People first row begins within the first working viewport and long data
  remains readable without horizontal overflow;
- the relationship name does not break inside a word, current work state is
  visible, and the Agent rail can collapse and expand by keyboard;
- mobile and dark layouts preserve hierarchy, legibility, and the human review
  boundary;
- relevant Web checks and the canonical documentation check pass.

## Reconsider when

- field observation shows that new recruiters need persistent explanatory copy
  after onboarding rather than progressive help;
- a real high-volume directory requires virtualization or a materially
  different retrieval model;
- evidence shows that the Agent must remain wider than the governed object for
  the primary desktop task.
