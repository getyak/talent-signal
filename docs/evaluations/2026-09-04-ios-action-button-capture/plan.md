# iOS one-button screenshot capture plan

## Outcome

Make the first Action Button screenshot setup understandable and finishable
without implying that Talent Signal can configure iOS, read another app's
screen, or send private conversation evidence to an Agent without a separate
user decision.

The observable result is a signed-build-compatible flow where a user can:

1. learn the exact two-action Shortcut recipe;
2. open the system Shortcut editor from one primary control;
3. assign the resulting personal Shortcut to the Action Button using concise
   system-owned guidance;
4. receive truthful setup and first-capture status;
5. take a screenshot into the protected local pending-capture queue; and
6. resume the ordinary evidence, identity, relationship, and Agent review.

## Boundary

In scope:

- App Intent naming, parameter presentation, receipt copy, and local setup
  evidence;
- the in-app Action Button and Shortcuts setup surface;
- English and Simplified Chinese behavior;
- Dynamic Type, dark mode, interruption, retry, and pending-capture recovery;
- Simulator/build E2E plus a clearly separated physical-button proof boundary;
- independent recruiter, mobile UX, evidence safety, and candidate-experience
  review packets.

Out of scope:

- programmatically changing the user's Action Button mapping;
- capturing another app's screen from Talent Signal itself;
- background cloud/Agent upload from the button press;
- identity confirmation, relationship mutation, or external writes from the
  shortcut;
- inventing or publishing an unsigned/iCloud Shortcut package.

## Current evidence and unknowns

- `ImportConversationScreenshotIntent` already accepts one `IntentFile`,
  validates it as an image, and stages it in `PendingCaptureInbox`.
- The current Settings copy tells users to bind an App Shortcut directly. That
  does not describe the required seamless recipe: system `Take Screenshot`
  followed by Talent Signal `Review screenshot`.
- The existing completion state is self-reported and is presented elsewhere as
  `Ready`; it does not distinguish guide completion from a capture actually
  received on the device.
- The current App Intent returns a local-only receipt and performs no network
  work, which is the intended privacy boundary.
- Simulator tests can prove the app-owned path but cannot prove a physical
  Action Button mapping. Connected-device availability must be checked before
  final adjudication.

## Chosen approach

- Present one two-action recipe, one primary `Open Shortcut editor` transition,
  and one later system assignment instruction. The button names its exact
  effect and the screen discloses that the editor opens empty.
- Keep system setup user-owned; use Apple's documented Shortcut editor URL and
  native `ShortcutsLink` rather than imitating Settings.
- Store two separate truths:
  - the user says the assignment guide is complete;
  - Talent Signal has actually received a screenshot through its Shortcut
    action on this device.
- Let an actual Shortcut receipt upgrade the app-owned status to `Local receipt`;
  keep `Assigned` solely for the user's explicit confirmation and never label
  either state proof of a physical button press.
- Preserve the quiet background capture and ordinary human review. Agent work
  starts only after the existing `Save and check identity` review gate.
- Decode the supplied bytes as a real image and enforce byte and pixel bounds
  before creating either a local queue item or a receipt.
- Use restrained progression and feedback instead of points, confetti, streaks,
  or fabricated certainty.

Rejected:

- binding the bare required-file App Shortcut directly to the Action Button;
- using Focus as screenshot permission or transport;
- manual `Ready` status with no distinction between assertion and observation;
- automatic remote Agent processing on button press;
- a long tutorial that repeats the complete iOS Settings interface.

## Milestones

1. Platform and current-state evidence frozen.
2. Setup recipe, status model, App Intent presentation, and copy implemented.
3. Focused unit/UI tests pass for normal, verified, Chinese, AX5, local queue,
   deduplication, and relaunch recovery.
4. A frozen build/evidence bundle is reviewed independently by the four-lens
   iOS screenshot panel.
5. Vetoes and high findings are fixed and retested.
6. Full `pnpm ios:check` and `pnpm docs:check` pass.

## Completion evidence and score

The product-adjudicator panel keeps specialist 0–4 scores separate and does not
average away vetoes. The requested 100-point result is a separate atomic
acceptance score:

- 30 points: setup comprehension and capture burden;
- 25 points: executable local capture, deduplication, and recovery;
- 20 points: truthful privacy, evidence, and Agent authority boundaries;
- 15 points: accessibility, localization, and mobile craft;
- 10 points: physical Action Button or an explicitly isolated platform-boundary
  proof.

No active safety/accessibility veto may pass. A score above 98 requires every
app-owned criterion and either direct physical-button evidence or exactly one
point withheld for the unavailable hardware boundary with no false claim.

## Final outcome

- Frozen implementation and proof: [`artifact-r6.md`](artifact-r6.md)
- Independent panel: [`panel-r6.json`](panel-r6.json)
- Separate atomic acceptance gate:
  [`acceptance-score-r6.json`](acceptance-score-r6.json) — 99/100
- Final repository gate: Release build passed; 20 unit tests and 5 focused UI
  tests passed; localization, documentation, wiki, architecture diagrams, and
  whitespace checks passed.
- Current specialist verdicts: recruiter workflow 3/4 pass, evidence safety
  3/4 pass, mobile UX 4/4 pass with evidence follow-ups, candidate experience
  4/4 pass; zero vetoes.
- The one-point deduction is the intentionally isolated physical-device proof
  boundary. No physical Action Button assignment or press is claimed.
