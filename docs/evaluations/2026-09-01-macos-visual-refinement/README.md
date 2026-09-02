# macOS workbench visual refinement

This packet records visual proof for the 2026-09-01 native macOS refinement.
Every render uses the app's explicit synthetic fixture. No real person,
conversation, source, action, or canonical backend readback is represented.

## Design comparison

Two rendered directions were compared against the product's five-second
question: can a recruiter identify the relationship, exact evidence, proposed
change, and human decision without reconstructing the screen?

### A. Stretched system form

The previous direction is preserved in
[`../2026-08-31-macos-relationship-workbench/visual/rc5-build4-frozen-menubar-presence.png`](../2026-08-31-macos-relationship-workbench/visual/rc5-build4-frozen-menubar-presence.png).

It kept the authority boundary legible, but a 920-point leading-aligned form
left most wide-window space inactive. Repeated bordered cards flattened the
relationship, evidence, proposal, and decision into one visual weight. Static
brand RGB values also did not constitute an adaptive dark appearance system.

### B. Editorial relationship folio — selected

The selected direction is rendered in [`decision-light.png`](decision-light.png).

It uses a centered 1,160-point reading canvas, an ownable relationship rail,
and one joined evidence-to-change composition. The exact source remains first
in reading and accessibility order; the restrained vermilion seam connects it
to the proposed change without implying confidence or candidate value. The
human decision remains unselected and separate from the final resolve control.

This direction won because it improves comparison and relationship anchoring
without adding an Agent command center, ranking device, decorative graph, or
new product authority.

## Rendered states

- [`decision-light.png`](decision-light.png): long mixed-script identity,
  three tags, exact evidence, proposed change, no preselected choice, and the
  separate resolve boundary.
- [`decision-dark.jpg`](decision-dark.jpg): adaptive dark tokens with the same
  information order and semantic distinctions.
- [`decision-200-percent.png`](decision-200-percent.png): 200 percent preview;
  the decision comparison returns to vertical reading order below the fold.
- [`ready-light.png`](ready-light.png): no confirmed scope and an empty explicit
  intake aperture.
- [`no-action-light.png`](no-action-light.png): zero identity tags, intentional
  no-action, exact evidence, and the existing owned action without duplication.
- [`action-center-light.png`](action-center-light.png): awaiting decision,
  outcome unknown, and verified reversible receipt as a projection over
  canonical objects.

## Authority and attention review

- Canonical objects remain Pursuit, Person, governed Evidence, Task, Proposal,
  Action, and Receipt.
- The workspace, sidebar, Quick Panel, Context Capsule, and Action Center remain
  views or temporary projections.
- Exact evidence precedes interpretation; proposed state is named and joined by
  the causal seam; the choice and final resolve remain distinct human gates.
- `no_action`, failed, unknown, stale, unresolved, and verified states keep text
  and icon distinctions in addition to color.
- Visual weight is assigned to current work and consequence, never to a
  person's worth, fit, acceptance probability, or inferred traits.
- External-effect authority is unchanged; the decision fixture still states
  that no message, calendar event, purchase, deletion, or other external effect
  is authorized.

## Verification

- `scripts/macos/check.sh`: passed; native app build and unit tests passed, and
  the UI test target compiled.
- A real XCTest UI execution was attempted. The runner remained blocked waiting
  to materialize and was interrupted after 163 seconds. No UI assertion is
  claimed from that attempt; the test target compilation is the only UI-test
  result reported here.
- `pnpm docs:check`: required after this packet and plan are finalized.

The existing build 7 release packet is not rewritten or relabeled by this
change. These renders prove this working-tree visual refinement only.
