# Browser extension capture experience

## Outcome

Turn the existing safe but form-like browser side panel into a compact,
recognizable capture companion. A recruiter should understand within five
seconds what can be captured, what will cross into Talent Signal, and what
still requires Web review.

Completion evidence:

- a real rendered first-use capture state;
- a real rendered reviewed-source state;
- a real rendered receipt-to-Web state;
- the existing evidence, approval, failure, retry, and deletion contracts keep
  passing;
- the result remains usable at 320 and 390 CSS pixels, in light and dark mode.

## Scope

In scope:

- the Chrome side-panel information architecture, copy, material, and state
  presentation;
- a visible bridge from a confirmed receipt to the exact Web review;
- screenshot capture and redaction as an inspectable local draft;
- selected-text handoff through the existing localhost contract;
- deterministic fixture states used to prove the interaction.

Out of scope:

- ambient page collection;
- silently binding evidence to a person or assignment;
- treating screenshot analysis as confirmed relationship state;
- enabling image upload before the backend owns a governed raw-image and
  derivative lifecycle;
- contact, calendar, message, ATS, or CRM writes.

## Current evidence

The current extension already proves deliberate `activeTab` capture, exact
pixel or selected-text review, crop and redaction, explicit approval,
idempotent retry, receipt reconciliation, and local payload deletion. Its main
design weakness is not missing controls: it is a long audit form in which
source, proposed meaning, local session, and handoff authority receive nearly
equal weight.

Current external mechanisms worth preserving without copying their visual
identity:

- Chrome Side Panel: persistent companion beside the source page;
- Notion Web Clipper: one obvious save gesture and a visible destination;
- Readwise Reader: selected content can be captured without breaking the
  reading flow, followed by an explicit `Open in Reader` bridge.

## Design tree

### D0: product invariant

- Visitor: a recruiter moving between private browser conversations and the
  Talent Signal relationship workspace.
- Moment of tension: one sentence or visible exchange matters, but opening the
  Web workspace and reconstructing context will break flow.
- Understand: only the reviewed aperture crosses into Talent Signal.
- Feel: calm, deliberate, and fast rather than surveilled or administered.
- Do: choose one aperture, review it, hand it to Web, and continue there.
- Ownable truth: removing or narrowing evidence retracts the dependent packet;
  capture approval still grants no fact or external-action authority.

### D1: two brand theorems

#### A. Capture Lens

- Metaphor: a small optical aperture beside the browser page.
- Spatial grammar: one dominant source window, a vermilion causal seam, and a
  compact action rail.
- Priority: scope first, then destination.
- Signature mechanic: the capture aperture visibly becomes the reviewed
  packet.
- Anti-reference: generic AI chat popover or a grid of utility buttons.

#### B. Evidence Parcel

- Metaphor: a sealed professional dispatch from browser to relationship desk.
- Spatial grammar: source, payload, target, and receipt stacked as labeled
  paper layers.
- Priority: provenance and consequence.
- Signature mechanic: receipt strip unlocks the exact Web review.
- Anti-reference: compliance settings form or upload wizard.

Winner: **Capture Lens**, with the parcel metaphor retained only at the final
handoff. It makes the user's current source visible sooner and is more distinct
at first use. A parcel-first composition inherits the current screen's form
density.

### D2: two architectures for Capture Lens

#### A1. Single-sheet inspector

Capture, review, connection, retention, and Submit remain on one continuous
sheet. This is operationally direct but still produces a long scroll and weak
phase change.

#### A2. Aperture to dispatch

First use is a small capture dock. After intent, the panel becomes an evidence
stage with source and edit tools. Connection and exact-effect approval live in
a bottom dispatch shelf. A verified receipt replaces the shelf with one `Open
Web review` action.

Winner: **A2**. Consequence increases only after evidence is visible, and the
visual phase change explains rather than decorates state.

### D2 evidence update

The screenshot-upload affordance initially looked like a connected Web handoff,
which triggered the explicit reconsideration signal. The implementation now
leads with the executable selected-text path and labels both image paths as
local review only. Imported screenshots use import time rather than file
modification time, and the receipt bridge accepts only a validated capture ID
and localhost Web origin.

## Milestones

1. Freeze the current screenshots and contract checks.
2. Implement the Capture Lens entry and quieter review hierarchy.
3. Preserve the existing deterministic submission states and expose a
   receipt-to-Web bridge when a real capture identifier exists.
4. Render light, dark, 320, 390, empty, review, and received states.
5. Run extension tests, package validation, integrated package tests, and a
   focused accessibility/reflow inspection.

## Progress at draft PR

- Implemented the Capture Lens entry, local screenshot review, crop/redaction
  surface, selected-text dispatch, and exact receipt-to-Web bridge.
- Restored the canonical Held Interval mark and preserved the existing
  permission and explicit-approval boundary.
- Verified 36 extension contract tests, package validation, brand validation,
  and documentation validation.
- Rendered and inspected empty, screenshot-review, evidence-review, receipt,
  dark-mode, 390 px, and 320 px fixture states without horizontal overflow.
- Before moving the PR from draft to ready, repeat the headed Chrome
  `activeTab` grant and one real localhost selected-text receipt/open-review
  path against the packaged extension.

## Reconsideration signals

- The first state cannot explain capture scope without opening help text.
- Screenshot capture appears uploadable when the backend lifecycle still
  rejects it.
- The reviewed source moves farther from approval.
- A user can mistake a receipt for confirmed candidate state.
- The new composition adds permissions or background access.
