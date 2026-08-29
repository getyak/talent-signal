# Agent composer simplification

## Outcome

Make the iOS Agent entry feel like one lightweight multimodal conversation:
the recruiter can type, attach images or files, or dictate and then send. The
Agent proposes person and relationship context from the submitted material;
only ambiguous identity or consequential writes require explicit review.

Completion evidence is a directly exercised iPhone Simulator journey showing
Today, the collapsed composer, image and voice input, automatic context
proposal, a submitted Session, and the smallest applicable recovery states.

## Boundary

In scope:

- Today as unread Sessions plus people/Pursuits that need recruiter attention;
- one global Agent composer for text, images/files, and voice dictation;
- no pre-send full-screen `New session`, prompt starters, or persistent safety
  prose;
- automatic, proposal-only context extraction;
- local OCR only as pre-routing/recovery support, with multimodal analysis as
  the final interpretation path when the configured provider supports it;
- existing evidence, identity, idempotency, and external-write gates.

Out of scope:

- silently confirming a person or relationship from model output;
- sending messages, editing Contacts, or changing calendars;
- treating task attachments as reviewed evidence;
- replacing the canonical Pursuit, Person, Evidence, Proposal, Action, or
  Receipt objects with chat state.

## Current evidence and unknowns

- `RelationshipGuideRail` currently splits Ask from a waveform Capture hub.
- `RelationshipAskView` already supports dictation and up to ten images, but
  image selection/upload is gated by a preselected relationship.
- the canonical Chat backend currently excludes attached images from the
  remote answer provider.
- uncommitted Ask scrolling, Dynamic Type, remote-chat test, and documentation
  edits already exist and must be preserved.
- attachment support beyond images and the configured provider's exact
  multimodal request contract still require verification.

## Chosen approach

1. Use the existing Ask surface as the single Agent entry and collapse the
   pre-send state to the composer rather than adding another capture flow.
2. Keep voice as editable dictation inside that composer; remove the Home
   affordance that opens a separate recording hub.
3. Let photos/files attach before context selection. Resolve a unique existing
   context from explicit text and local preflight signals; ask for a compact
   clarification only when the result is absent or ambiguous.
4. Create/navigate to a Session only when Send begins. Keep review cards only
   for proposed canonical changes or exact external effects.
5. Extend the governed remote-answer boundary for supported image attachments
   only after they are bound to the reviewed/proposed context. Keep OCR as
   inspectable fallback rather than canonical interpretation.

Rejected: silently choosing the first person match; keeping separate
text/photo/voice forms; uploading account-wide unscoped media; treating OCR as
the final source of truth; copying the supplied reference screenshots.

## Milestones

1. **Completed — Inspect and freeze the interaction contract.** Verified
   existing entry routes, attachment/provider contracts, and mature Agent
   interaction patterns.
2. **Completed — Implement the smallest coherent composer slice.** Unified Home
   entry, simplified pre-send UI, allowed attachment-first input, and made
   context proposal progressive.
3. **Completed — Add governed multimodal handling.** Supported image
   attachments route to a separately admitted, pinned vision model only after
   manifest binding; the existing truthful no-image fallback remains.
4. **Completed — Verify the real surface.** The iOS app and UI-test bundle
   compile, focused Today/Ask/typing Simulator journeys pass, the compact Ask
   screenshot was reviewed, backend tests and typechecking pass, and canonical
   documentation checks pass. A contact proposal now promotes the compact
   126-point sheet to the large detent in the proposal state transition; the
   no-command contact smoke journey proves the generated proposal is visible
   and reviewable rather than merely present outside the viewport.

## Decisions that may change direction

- If the configured model/provider cannot accept governed images, the shipped
  UI must say analysis is unavailable rather than imply multimodal review.
- If a context cannot be uniquely proposed from explicit material, Send must
  pause at a compact choice; it must not widen model access across unrelated
  people to guess.
