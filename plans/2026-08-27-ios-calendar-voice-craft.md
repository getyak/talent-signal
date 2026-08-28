# iOS calendar and voice craft pass

## Outcome

Make the relationship calendar and recruiter voice input feel like one calm,
high-touch mobile system. The calendar should answer who the recruiter is
meeting, why the moment exists, and what can be prepared next. Voice input
should make recording, stopping, transcription, cancellation, and return to an
editable draft continuously legible without suggesting that decorative motion
is measured audio.

## Boundary

In scope:

- the existing Today relationship-calendar entrance, week rail, agenda rows,
  activity detail, and activity composer;
- explicit interview, meeting, and conversation kinds when staging a new Apple
  Calendar event;
- the existing foreground recruiter-dictation control in the Agent composer;
- restrained state motion, haptic acknowledgement, Reduce Motion behavior,
  Dynamic Type, dark mode, English, and Simplified Chinese;
- focused unit/UI proof and simulator screenshots.

Out of scope:

- reading the user's full Apple Calendar;
- invitations, attendee mutation, automatic messages, or background writes;
- live ASR partials or fabricated audio-amplitude visualization;
- a new canonical meeting backend model or candidate scoring.

## Current evidence

- Both paths are already functionally complete and preserve explicit approval
  boundaries.
- The calendar currently gives date and activity type more visual weight than
  the linked person, while its composer saves every new activity as `meeting`.
- Voice input currently exposes truthful states but compresses recording into
  one small status row and a changing trailing icon.
- Reference direction A, a dark calendar field above a light drawer, is visually
  strong but reads as a generic calendar and competes with the relationship.
- Reference direction B, a warm editorial field with one vermilion state seam
  and person-led rows, preserves product ownability and contrast with less
  ornamental material.

## Chosen approach

Use direction B. Keep dates as a compact navigation instrument, then lead the
agenda with a stable person mark, person name, activity kind, exact time, and
Pursuit context. The activity detail keeps the same semantic order. The
composer asks for the relationship and activity kind before the exact time,
then hands the complete proposal to Apple's editor.

For voice, expand only the active state into a single recording surface. Use a
deterministic breathing sequence as state feedback, not an amplitude meter;
stop animation under Reduce Motion. Give start, stop, and cancel distinct
haptic acknowledgements while keeping the transcript editable and unsent.

## Milestones

1. **Complete — implement the shared visual and interaction language.**
2. **Complete — update localization and focused coverage.**
3. **Complete — build, run targeted tests, and inspect real simulator states.**
4. **Complete — review against product, accessibility, and truth boundaries.**

## Proof

- A recruiter can identify the linked person, activity kind, time, and Pursuit
  context from the agenda without opening detail.
- A newly staged interview remains an interview after Apple Calendar approval.
- Voice recording has an unmistakable stop target, elapsed time, cancellation,
  and accurate cloud-transcription boundary.
- Motion stops or becomes static with Reduce Motion, and no waveform claims to
  represent measured microphone levels.
- Calendar and voice critical paths remain usable at AX5, in dark mode, and in
  English and Simplified Chinese.

## Completion evidence

- The Debug simulator build succeeded against iOS 26.5 on an iPhone 17 Pro.
- The calendar agenda, activity-kind composer, Apple Calendar cancellation,
  linked Session preparation, and voice-to-editable-draft UI paths passed.
- `RelationshipArchiveTests` passed: 50 tests, 0 failures.
- The dark-mode AX5 calendar path passed and retained a minimum 44-point add,
  activity, and preparation action.
- Simplified Chinese calendar and active voice-listening paths passed on the
  same iPhone 17 Pro simulator with no clipped decision or hidden control.
- Simulator screenshots were inspected for the default calendar agenda, active
  voice-listening state, and dark AX5 activity detail.
- `git diff --check` and `pnpm docs:check` passed.
- The repository-wide localization gate passed. All calendar and voice keys
  added by this slice have Simplified Chinese translations and compile in
  Xcode.

## Follow-up correction: quiet month navigation

The calendar's first craft pass made the relationship model explicit through a
narrative heading. In the working surface that copy competed with the actual
date and made Simplified Chinese inherit an unsuitable Latin display-font
fallback. The corrected direction removes the slogan and explanatory empty
state, uses native semantic type for dates and person names, and lets the month
label expand the compact week into an inline month grid with previous and next
month navigation. Agenda rows continue to own the person, activity, time, and
Pursuit context; the grid remains a compact date-selection instrument.

Verified on the iPhone 17 Pro simulator in English, Simplified Chinese, and
dark-mode AX5. The month expansion, previous/next month controls, person-led
agenda, and Session handoff UI tests passed. The Chinese render was inspected
after changing compact date cells from localized `28日` labels to uncluttered
numeric day marks while retaining the full localized date in the agenda and
accessibility label.

## Follow-up correction: single-grid expansion

The week and month layouts previously replaced each other with overlapping
opacity and movement transitions. During the 0.32-second spring both date
trees could be rendered, producing a visible ghost on expansion. The calendar
now owns one month-derived date grid: the collapsed state clips it to the
selected week and the expanded state animates only its mask height and vertical
offset. The chevron rotates in place, adjacent-month days remain unavailable in
the expanded month, Reduce Motion changes state without animation, and the
accessibility tree exposes only the visible week or month dates. The agenda
time column also reserves enough width for an English meridiem without wrapping.

Failure-state inspection exposed a second part of the same bug: clipping hid
the unused rows visually but did not remove their hit regions. An offscreen day
could therefore intercept the month-title tap after being offset underneath it.
Only dates in the visible week become buttons while collapsed; the remaining
cells stay inert and hidden from assistive technology. The same rule exposes
only selected-month dates while expanded, so visual, pointer, and
assistive-technology visibility agree.

The correction passed the focused expand → next month → collapse UI path on an
iOS 26.5 Simulator: the accessibility surface contains seven date buttons when
collapsed, the selected month's dates when expanded, and seven again after
collapse. Simplified Chinese month expansion and person-context rendering also
passed. The final expanded and collapsed surfaces were inspected on an iPhone
17 Pro, including the single-line `3:00 PM` time and person-led agenda row.
