# macOS workbench visual refinement

Status: complete
Owner: Codex
Started: 2026-09-01

## Outcome

Make the native macOS Relationship Workbench feel like a calm, deliberate
relationship instrument instead of a stretched system form. The first viewport
must make the selected relationship, exact evidence, proposed change, and one
human decision understandable within five seconds at ordinary Mac window sizes.

## Boundary

In scope:

- the visual system shared by the native workspace, Quick Panel, and Action
  Center;
- the workspace shell, navigation, relationship header, evidence/change seam,
  decision controls, and wide-window composition;
- adaptive light and dark appearance, reduced motion, keyboard focus, and the
  existing 200 percent text preview;
- real rendered before/after evidence from synthetic fixtures.

Out of scope:

- backend, evidence, identity, Proposal, Action, or Receipt contracts;
- new capture permissions, external effects, or automatic monitoring;
- changing the existing safety-state machine or release claims for build 7;
- editing unrelated iOS, Web, evaluation-platform, or existing evaluation
  artifacts in the dirty worktree.

## Design read

Primary surface: desktop knowledge workspace.

Audience: an independent recruiter returning from a conversation and deciding
whether one supported relationship change should become current state.

User question: “What changed for this exact relationship, what supports it,
and what is the one safe decision I can make now?”

Visual character: warm editorial canvas, ink-led hierarchy, scarce vermilion
only at the evidence-to-change seam, native Mac material at window chrome and
navigation, medium density, and low motion.

Canonical objects remain `Pursuit`, `Person`, governed Evidence, Task,
Proposal, Action, and Receipt. The workspace, Context Capsule, Quick Panel,
navigation, and Action Center remain projections. Proposed, confirmed,
unresolved, stale, failed, and verified states keep their existing authority.

## Current evidence

- The existing main column is capped at 920 points and pinned to the leading
  edge, producing a large inactive void in common wide Mac windows.
- Relationship identity is rendered as text plus generic pills, so the current
  object has little visual anchoring.
- Evidence and proposal are separated into consecutive generic cards in the
  canonical decision fixture, weakening the product's causal seam.
- Static RGB brand colors do not adapt semantically to dark appearance.
- The default sidebar and repeated bordered rounded rectangles make the app
  read as a prototype form rather than a composed native workspace.

## Approach

1. Establish adaptive semantic tokens and a small reusable material grammar.
2. Recompose the workspace into an ownable navigation rail plus a centered
   editorial decision canvas that uses wide space for evidence/change
   comparison, not empty margin.
3. Refine Action Center and Quick Panel with the same hierarchy while
   preserving every existing accessibility identifier and authority boundary.
4. Build, test, and render the decision, no-action, empty, Action Center,
   light, dark, reduced-motion, and 200 percent states.

Rejected direction: a dense three-column command center. It would fill the
window but would over-promote Agent and queue chrome, competing with the exact
decision and making the product resemble a CRM dashboard.

Selected direction: an editorial relationship folio. Navigation stays calm;
the main canvas becomes a bounded sheet with a relationship masthead and a
single evidence-to-change composition. Wide space improves comparison while
narrow and accessibility layouts return to an ordered vertical reading path.

## Milestones

### 1. Visual foundation and shell

Status: complete

- add adaptive light/dark tokens and reusable surface treatments;
- replace the stretched default sidebar with a quieter native navigation rail;
- center the primary reading canvas at an intentional maximum width.

Evidence: the decision fixture renders without the large leading-edge void and
remains legible in light and dark appearance.

Observed evidence: adaptive semantic tokens, a custom relationship rail, and a
centered 1,160-point canvas render in
`docs/evaluations/2026-09-01-macos-visual-refinement/decision-light.png` and
`decision-dark.jpg`.

### 2. Decision and supporting surfaces

Status: complete

- join exact evidence and proposed change with the causal seam;
- improve relationship anchoring and decision affordance;
- align Action Center, Capsule, and Quick Panel with the same material grammar.

Evidence: exact evidence, proposal status, and one human gate are visually
distinct without relying on color alone.

Observed evidence: the joined evidence/change folio, first-class `no_action`,
calmer Action Center list, Quick Panel purpose block, and Context Capsule
materials share one hierarchy while retaining the existing authority labels
and accessibility identifiers.

### 3. Real-surface verification

Status: complete

- run focused macOS build and unit checks;
- compile UI tests and run them if the host connection is available;
- capture and inspect real light, dark, reduced-motion, decision, no-action,
  empty, Action Center, and 200 percent renders;
- review the finished outcome through `REVIEW.md` and report remaining risk.

Evidence: source checks pass and screenshots demonstrate the intended hierarchy
without changing canonical behavior or external-effect authority.

Observed evidence:

- `scripts/macos/check.sh` passed the native build and unit suite and compiled
  the macOS UI test target;
- `pnpm docs:check` passed;
- direct app renders cover ready/unresolved, decision, intentional no-action,
  Action Center, light, dark, long mixed-script identity, zero and three tags,
  and the repository's 200 percent preview;
- an attempted XCTest UI execution remained blocked waiting for its runner to
  materialize on this host and was interrupted after 163 seconds. No UI test
  assertion is claimed from that attempt; prior keyboard behavior is preserved
  in compiled tests and the rendered accessibility layout was inspected
  directly.

## Completion

Complete when the native app builds, focused tests pass, real renders show the
relationship and decision hierarchy at supported sizes and appearances, and no
existing evidence, approval, recovery, deletion, or accessibility boundary has
been weakened.

Completed with the direct evidence above. The remaining uncertainty is runtime
XCTest UI automation on a host with an approved, materializing macOS test
runner; it does not invalidate the passing native build, unit tests, compiled UI
test target, or the inspected real-surface renders.
