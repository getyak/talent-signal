# AI session mobile entry

## Outcome

Make the iOS home surface feel like a quiet AI relationship workspace: Sessions
are a first-class retrieval projection, Today combines unread Agent work with
governed insight, top-level destinations swipe naturally, and the bottom entry
accepts intent without presenting a wall of capture forms.

Completion is observable when the running app shows `Today / Sessions / People`
with tap and horizontal-swipe navigation, can reopen an in-app Ask session, and
opens a compact text/photo/voice intake panel from the bottom rail.

## Boundary

In scope:

- mobile information hierarchy, motion, bilingual copy, and accessibility;
- an in-memory Session projection over successful Ask tasks;
- Today projections from unread Sessions and existing governed Proposal/Pursuit
  state;
- a compact intake chooser that hands off to the existing governed capture
  paths.

Out of scope:

- treating a model conversation as canonical relationship state;
- inventing a backend conversation-history API or persisting private responses
  in ungoverned local storage;
- silent identity binding, fact confirmation, or external writes;
- removing the detailed capture/review surfaces that remain necessary after
  the lightweight intent step.

## Current evidence and unknowns

- `RelationshipArchiveView` currently uses a static black underline and a
  non-swipeable `Today / Pursuits / People` switch.
- Ask calls the canonical workspace and returns cited task blocks, but turns are
  local to one full-screen view and disappear when it closes.
- Capture starts with a full-screen three-option hub and then opens a second
  full-screen workflow.
- The backend exposes scoped Agent history, not a global durable conversation
  Session list. Durable cross-device Session history therefore remains a
  product/backend follow-up rather than something the client should simulate.

## Chosen approach

Use `TabView` page behavior with a custom soft selection field so swipe and tap
share one selection state. Replace Pursuits in the high-frequency header with
Sessions while keeping Pursuit as the canonical object underneath Today,
People, cited responses, and detail sheets.

Keep one compact bottom Agent dock. Tapping its main field opens Ask; the small
capture control opens a short sheet with text, photo, and voice. Each option is
an input mode, not a promise that AI has confirmed or written anything.

Successful Ask tasks are grouped into in-memory Sessions by an explicit session
identifier. This proves the UI and reopening behavior without persisting private
responses outside the governed backend. Preview mode may use clearly synthetic
fixtures; canonical mode starts empty until a successful Ask task exists.

## Rejected directions

- A permanently visible four-action strip (`Ask / Text / Photo / Voice`) keeps
  input modes discoverable but recreates the visual and cognitive clutter the
  redesign is meant to remove.
- Making Chat/Session the canonical record would duplicate Pursuit, evidence,
  Proposal, and Receipt authority and would let generated text look more final
  than it is.
- Automatically selecting a Person or confirming extracted facts would make
  the entry feel faster at the cost of wrong-identity and unsupported-write
  risk.

## Milestones

1. Freeze current code and record the product boundary.
2. Add the Session projection and swipeable navigation.
3. Replace the bottom rail and full-screen chooser with a compact Agent intake.
4. Add focused model/UI tests and build the app.
5. Inspect rendered Chinese/English, compact-device, and reduced-motion states.
6. Update the authoritative product/design language and complete the review.

## Proof

- focused unit tests for Session grouping, unread/read state, and Today insight
  projection;
- UI tests for tap/swipe selection, compact intake, session reopening, and
  bilingual labels;
- successful iOS build and targeted test run;
- simulator screenshots of the chosen structure in English and Simplified
  Chinese, with the rejected always-visible action strip retained only as a
  temporary comparison artifact if rendered;
- `pnpm docs:check` after canonical documentation changes.

## Reconsider when

A governed backend Session contract exists with explicit workspace scope,
retention, deletion, message provenance, and cross-device read state. At that
point replace the in-memory projection with canonical readback rather than
adding client persistence.

## Completion

Completed on 2026-08-25. The native app now exposes the chosen hierarchy,
compact inputs, bilingual labels, Session reopening, unread projections, and
reduced-motion navigation. Focused unit and UI checks passed. The durable
backend Session contract and physical-device accessibility proof remain the
explicit next boundary, not hidden implementation debt in this slice.

## 2026-08-28 populated-response refinement

The same compact entry now continues into a quieter evidence-bound conversation
instead of changing visual language after the Agent replies. User prompts are
short IM-style bubbles; controlled response headings and provenance localize
without translating exact evidence; review state is visible in text and symbol;
and accessibility-size responses begin at the new turn rather than its tail.
Persistent relationship chrome is compact at AX5 while its complete value stays
available to assistive technology. The existing top navigation and bottom global
Agent entry remain unchanged.

Proof: three fixture-backed UI tests cover the standard answer/evidence dispute,
Chinese dark AX5 populated answer, and AX5 empty session; one unit test covers
source-timezone and localized provenance behavior. Release build, localization
boundary, and visual inspection passed. The result bundle is
`/tmp/talent-signal-ios-ask-response-final3.xcresult`.
