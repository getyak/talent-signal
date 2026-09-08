# GET-22 automatic relationship film

## Outcome

The signed-out home now starts a 7.6-second DOM/Motion introduction when its
stage is visible, without a click. It reveals a connection at 4.3 seconds and
holds the result. The synthetic story travels from IM through linked accounts,
to Maya's work and intent, then to a path through Alex from the visitor's notes.
Reduced motion presents the complete static discovery with explicit motion opt-in.
This is a product-vision demonstration, not live research or account access.

## Visible direction comparison

- [Previous desktop](before-desktop.png): the large static heading and controls
  delayed the actual value; mobile required scrolling before seeing the result.
- [A: continuous encounter](direction-a.png), [full page](direction-a-full.png):
  follow one person through source convergence and a relational pullback.
- [B: discovery first](direction-b.png), [full page](direction-b-full.png):
  reveal the path immediately, then reconstruct its supporting contexts.

A wins because the product mechanism remains legible before the surprise. Its
final forest-green scene borrows B's stronger discovery contrast. Scroll-scrubbing
was rejected because it would again require work to reveal the product's value.
Prototype HTML files accompany the captures for inspection, not production routing.

## Actual implementation frames

[Capture](film-capture.png) → [research](film-research.png) →
[person](film-person.png) → [discovery](film-discovery.png).
These were captured from explicit playback on the reduced-motion test browser;
the person-stage copy was subsequently tightened to the existing synthetic IM:
“Building a design agent. Looking for product teams.”

[Desktop static alternative](after-desktop-still.png),
[375 × 667 English](after-mobile-en.png),
[320 × 568 English](after-mobile-small-en.png),
[source withdrawal](source-withdrawn.png).

## Independent agents and adjudication

Two additional agents were requested by the user. The cinematic-direction agent
compared the previous surface, A/B, and actual implementation captures. It found
that the smaller heading, one focal subject per scene, paper-to-forest transition,
and elevated Alex removed the earlier equal-avatar composition. The 320px result
and controls fit the viewport. Its concrete-person-copy suggestion was adopted.
It found no blocking visible overlap; still images do not prove motion feel or
that users will experience delight. No aesthetic success is inferred from tests.

The motion-strategy agent independently reviewed lifecycle and source authority.
It identified repeated scrolling when locale/preferences changed after a replay
request. A handled-request ref fixes that P2. Short-screen footer clipping was
also fixed: at 320 × 568, the footer ends at 558px. Final re-review found no P0/P1
and closed the confirmed P2. Its six playback-policy tests independently passed.

## Behavioral evidence

- Browser reload with reduced motion: chapter 3, complete intent, final discovery,
  body focus and scrollY 0, without any product interaction. Both available test
  browsers expose reduced motion; ordinary-preference zero-click startup was
  verified by the pure policy test and independent code review, not a browser
  preference override. Explicit opt-in rendered the full four-scene sequence.
- User pause: chapter 0, paused intent and data-running=false. Playback intent is
  separate from viewport/document suspension; resumption creates a fresh RAF
  timestamp baseline. The film stops after one run and never loops itself.
- Source inspection pauses playback and focuses the named source region.
  Removing the synthetic note removes both dependent relationship paths, the
  meeting context and introduction suggestion. Language changes and the middle
  replay entry preserve removal; the replay control remains disabled.
- Actual browser source removal and downstream Shared context show “Meeting note
  removed”; public work remains. No page console errors were observed.
- Ordinary playback never scrolls or moves focus. Explicit exploration and the
  middle Watch entry may move focus/scroll to their requested destination.
- Lint, type checking and the web suite passed during implementation: 357 tests,
  one pre-existing live-provider test skipped. Final checks are recorded in PR CI.

## Design and API references

[Apple product presentation](https://www.apple.com/iphone/) informed focal shot
hierarchy; [Family](https://family.co) informed tactile continuity. Neither is a
pixel template. [Motion useInView](https://motion.dev/docs/react-use-in-view) and
[Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
inform interruption and visibility semantics. Installed Next.js use-client docs
were consulted for the interactive boundary.

Deployment and merge receipts are recorded on the associated GET-22 PR and Linear
issue after the latest commit checks and production readback complete.
