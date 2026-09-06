# Sessions and People retrieval design review

Status: complete. Native implementation, captured surfaces, and focused checks verified.

## Capture boundary

Native iPhone 17, iOS 26.5 Simulator, synthetic preview only. The initial two
screenshots capture the previously installed Debug build in this run while the
current-source build was queued. Its row appearance matches the old bordered
layout; the newer source also contains visible row menus and page gestures.
Therefore these screenshots are a visual baseline, not proof of the exact
pre-edit source revision or its menu behavior.

## Captured baseline

1. [Sessions](01-sessions-before.png): readable intent and related person, but
   no retrieval controls, dense title/time layout, heavy enclosing strokes,
   and a disproportionately prominent synthetic-data notice.
2. [People](02-people-before.png): search and filtering are available, but
   repetitive strokes, small serif initials, a trailing chevron, and time
   compete with role/project text. The second project is visibly truncated.

## Chosen direction

Compare the baseline's bordered cards with quieter, independent content
surfaces. Keep warm neutrals and existing top navigation/global composer.
Use capsule search fields and a native filter menu, show active scope by name,
and keep all controls at least 44 points. Native iOS 26 scroll-edge diffusion
softens scrolling beneath the retrieval rail. Glass is limited to the filter
control and falls back to solid material with Reduce Transparency or Increased
Contrast. Content cards never use glass.

Only unread Sessions receive raised material and a subtle shadow. Semibold
versus medium type and explicit accessible Read/Unread labels provide additional
state cues. Person weight never implies merit. Session attention labels still
represent current review, continuation, or refresh work, independently of read
status.

People keeps identity, headline, contextual role/project, and activity. Remove
its redundant chevron, retain the separate 44-point menu, and allow context to
wrap. Session metadata search reads only displayed local title, person and
context, without indexing private answer text or excerpts. Filters preserve
existing order and do not mutate canonical state.

## References

- [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Apple Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)
- [Native scroll edge effects](https://developer.apple.com/documentation/swiftui/view/scrolledgeeffectstyle(_:for:))

## Updated captures

3. [Sessions, light](03-sessions-after.png): improved. The first session was
   explicitly marked unread through its visible menu. Elevation and stronger
   title separate it from the flat, read second row; review state remains visible.
4. [People, light](04-people-after.png): improved. Both identity/context records
   remain readable, and the longer board-search title wraps instead of ending in
   an ellipsis. The visible menu remains separate from opening the person.
5. [People, selected project](05-people-filter.png): verified. Selecting the board
   search returns only Nia and displays the exact scope with a clear control.
6. [Sessions, Chinese dark](06-sessions-dark-zh.png): verified visual distinction
   between unread and read materials; search remains legible on the darker rail.
7. [People, Chinese dark](07-people-dark-zh.png): verified matching retrieval
   controls and neutral metadata hierarchy without the disclosure arrow.
8. [Sessions, AX5](08-sessions-ax5.png): title and contextual text stack and remain
   untruncated; scrolling is required to read the full card.
9. [People, AX5](09-people-ax5.png): long headline and context remain available in
   the scrollable card. This capture is a scrolled continuation, not a full card.

The Lab capsule and primary pager differ from the installed baseline because
pre-existing, unrelated work is present in the current Debug build. The
refinement owns only retrieval controls, rows, and local Session filtering.

## Verification

- Debug Simulator build passed with iOS 16 deployment compatibility. Native
  glass and scroll-edge APIs are gated to iOS 26.
- Three policy tests passed: combined local Session search/filter order,
  current operational attention, and canonical People search/project ordering.
- UI paging/menu reachability, compact People search, and Chinese dark AX5 with
  Reduce Motion passed.
- The first UI run found a reset target reported as 18 points and a parent
  identifier masking the Session reset button. Both were corrected with a real
  44-point content shape/background and a heading-only empty-state identifier;
  both affected UI tests passed on rerun (26.840 s and 28.043 s).
- All eight distinct focused tests passed across the original and corrective runs.
  See [test summary](test-summary.txt).
- Localization and documentation checks passed. Chinese read-state wording uses
  a dedicated state label, rather than an existing action translation.

Source citations, deletion confirmation, persistence, authorized avatar loading,
Person identity and canonical state were preserved. No new private text index,
external write, ranking, or network call was introduced. No real-device or
VoiceOver speech session was run; AX inspection and UI tests do not establish
full accessibility conformance. The AX5 Lab header still occupies substantial
vertical space and belongs to the existing global shell, outside this change.
