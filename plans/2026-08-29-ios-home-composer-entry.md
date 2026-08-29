# iOS home composer entry

## Outcome

Make the iOS home composer behave as two explicit intent paths:

- tapping `+` shows the available attachment sources before opening any system picker;
- tapping the text surface opens a visually complete, large message editor, focuses it,
  and supports multiline plain text and Markdown source.

This keeps capture source choice under recruiter control and makes authored intent feel
like a real editing surface rather than a 126 pt launcher.

## Boundary

In scope: the home guide rail, the new unscoped `RelationshipAskView` presentation,
attachment-source choice, focus/detent behavior, accessibility identifiers, and narrow
iOS UI verification.

Out of scope: rendered Markdown preview, rich-text transformation, server-side Markdown
parsing, capture-review semantics, or changes to existing conversation/session views.

## Evidence and approach

- `RelationshipArchiveView` routes the home `+` to `.attachment` and the text surface to
  `.text`.
- `RelationshipAskView` currently starts at `.height(126)`. Its `.attachment` task branch
  immediately sets `isPhotoLibraryPresented = true`, bypassing source choice.
- The existing in-session attachment control already owns Photos, image files, and
  relationship linking. The home entry will reuse those actions through an explicit
  confirmation dialog.
- The existing vertical `TextField` preserves Markdown source correctly and retains broad
  UI-test compatibility. In the unscoped new-message state it will become a spacious,
  editorial editor rather than being replaced by a new authority-bearing object.

## Milestones

1. **Complete:** implemented distinct large text-editor and attachment-choice entry
   behavior.
2. **Complete:** updated focused UI tests for the new interaction contract.
3. **Complete:** built the iOS app, passed the focused interaction tests plus the existing
   Chinese dark AX5 regression, and inspected the captured light-mode surfaces.

## Completion evidence

- A UI test proves home `+` exposes Photos and Files before a picker exists.
- A UI test proves home text entry opens at a large detent, receives keyboard focus, and
  accepts multiline Markdown source.
- The iOS target builds successfully and the focused UI tests pass on an available
  simulator.

## Verification result

- `xcodebuild ... CODE_SIGNING_ALLOWED=NO build` succeeded.
- Three `CandidateSignalUITests` passed on the Talent Signal Craft Audit simulator:
  large focused Markdown entry, attachment source choice before picker, and Chinese dark
  AX5 composer/capture reachability.
- Screenshot inspection confirmed quiet editorial hierarchy, 44 pt attachment actions,
  no automatic picker on `+`, and no claim that a draft attachment is reviewed evidence.
