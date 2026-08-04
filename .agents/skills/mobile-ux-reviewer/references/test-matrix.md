# Mobile test matrix

Select all rows relevant to the changed path. Record `pass`, `fail`, or `not_run` with evidence.

## Devices and environment

- Small supported iPhone in portrait.
- Large iPhone in portrait.
- Landscape where supported.
- Current supported iOS plus the oldest deployment target.
- Light, dark, increased contrast, and reduce transparency.
- Reduce Motion enabled.
- 200% localization expansion; Simplified Chinese and English minimum.
- Slow network, offline launch, network loss during extraction/write.
- Low Power Mode and app background/foreground during work.

## Content extremes

- Long and mixed-script candidate/role names.
- No avatar, no role, unknown company, and missing context.
- One fact; many facts; long evidence; multiline recommendation.
- Ambiguous relative date, absent timezone, and crossed midnight.
- Same-name candidates and wrong-role suggestion.
- Cropped, low-contrast, quoted, forwarded, group-chat, and third-party messages.
- No-action input, contradiction, retraction, expired deadline, superseded state.

## Accessibility

- Dynamic Type default, XXXL, AX3, and AX5.
- VoiceOver linear order through import, evidence, edit, confirm, action preview, result.
- Every control has a meaningful name/value; no duplicated speech.
- State differences remain understandable without color.
- Default targets approximately 44×44 pt with adequate separation.
- Contrast manually inspected; automated findings reviewed, not blindly accepted.
- Full Keyboard Access/Switch Control where applicable.
- Evidence highlights have a textual alternative.

## Permissions and external actions

- Photo access first ask, limited selection, denied, and later revoked.
- Contacts/calendar/notifications denied and changed while app is open.
- Duplicate contact, meeting, and reminder.
- Destination write succeeds, fails, times out, or succeeds after client timeout.
- Retry, cancellation, app termination, and relaunch reconciliation.
- Undo/correction where supported; audit entry always visible.

## Evidence capture

For each failure retain:

- build/version and device;
- start state and exact steps;
- screenshot/video/accessibility output;
- expected versus observed;
- severity and affected user;
- retest result after correction.
