# GET-22: capture to a connected world

Date: 2026-09-08. [Issue](https://linear.app/getyak/issue/GET-22/官网优化和设计).
[Exploration tree and scope](../../../plans/2026-09-08-get22-relationship-aha.md).
All people, sources and interactions in this evaluation are synthetic.

## Why the direction changed

The user rejected the first delivery's aesthetics, lack of meaningful motion and
missing aha moment. Functional checks did not answer that criticism. The revised
invariant is the transformation from encountering someone on an existing platform
to understanding their context and a relevant connection to one's own world.

Two directions were rendered before implementation:

| Direction | First view | Mid-page architecture | Decision |
| --- | --- | --- | --- |
| A: one capture opens a connected world | [A](direction-a.png) | [A full](direction-a-full.png) | Selected: the recognizable capture action precedes the unexpected human path. |
| B: intent finds a human path | [B](direction-b.png) | [B full](direction-b-full.png) | Retained as the result's intent switch. A large prompt alone risks a generic AI entry point. |

The [prototype source](directions.html) preserves both alternatives without a public
route. D0–D2 and the rejected scroll-controlled film architecture are in the plan.
References inform mechanisms rather than copied identity: [Family](https://family.co)
for tactile continuity, [Cosmos](https://www.cosmos.so) for a personal spatial world,
[mymind](https://mymind.com) for capture without filing, and
[Read AI Ada](https://www.read.ai/research-article/introducing-ada) for context retrieval.
The design library's generic palette/style recommendation was not adopted.

## Visible implementation

An original-brand Action Button has a physical press response. Platform fragments
reconcile into a person through an explicit shared account handle. That person
moves into a relationship field and a path draws from You through Alex to Maya.
Changing the goal changes the path and explanation. Deep forest in the middle
section contrasts with the open paper-colored beginning; the living-person section
uses editorial composition and three meaningful context views.

| Surface | Evidence |
| --- | --- |
| Chinese / English opening | [Chinese](initial-zh.png), [English](initial-en.png) |
| Context gathering / identity reconciliation | [Gathering](motion-gathering.png), [person](person-zh.png) |
| Human path / dark appearance | [Connected](connected-zh.png), [dark](connected-dark.png) |
| Actual 390 × 844 responsive viewport | [Opening](mobile-initial.png), [person](mobile-person.png), [connected](mobile-connected.png) |
| Animated sequence | [Screen recording](motion.gif) |

Screenshots are unedited Chrome captures; development and browser-extension UI may
be present. The GIF records an earlier implementation before the final spacing and
source-removal corrections; the still images above show those final layouts.
No first-time visitor study or user aesthetic approval is claimed.

## Interaction and authority evidence

- The synthetic social profile and project explicitly share the same handle;
  matching names or portraits cannot establish identity. Another Maya stays separate.
- Alex's source note supports a recorded meeting and past Atlas collaboration,
  not a confirmed introduction or present acquaintance. Clicking Alex opens the
  source. No search, connected-account access or contact write occurs.
- Removing the note removes both dependent edges, Alex's meeting description,
  living-person shared context and timeline, and source labels. Revisited gathering
  steps show the source as unavailable. The introduction suggestion also disappears.
- Language changes preserve phase and removed-source state. A new demo is the
  explicit reset boundary. The source panel retains focus after removal; closing
  returns to the opener or a still-connected fallback. Middle-section capture
  returns to and focuses the primary Action Button.
- Reduced motion directly reveals the outcome without waiting. On a system with
  reduced motion enabled, an explicit per-demo checkbox can opt into the sequence.
  Normal motion was recorded progressing through gathering, identity and relation.
  Cancel/replay/manual navigation invalidate older timer callbacks.
- Actual 390 px and 320 px viewport checks found no horizontal overflow; all three
  principal people remain visible on the phone. Desktop and dark layouts were
  inspected separately. A stale viewport override was reset before mobile evidence.
- Current workspace access and the proposed cross-platform future are distinguished
  in the first view, capture example, closing copy and FAQ. Existing product,
  how-it-works, trust, pricing and working-demo routes remain available.

## Verification and review

Local lint and type checking passed. All 351 web tests passed, with one existing
live-provider test skipped. Five new state-machine cases cover explicit start,
completion, stale callbacks, reduced motion and removal/reset boundaries.

Independent review found four P2 issues: hidden-button hit testing, incomplete
source invalidation, locale-triggered reset and removed-button focus loss. All
four were fixed and independently rechecked; no confirmed P0/P1/P2 remained.
The reviewer independently ran 18 relevant tests and whitespace validation.
Production build, documentation/architecture and brand checks passed locally.
CI, merge and production receipts are recorded on the delivery PR and linked
Linear issue.
