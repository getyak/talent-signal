# Design QA — MX-01 Decision Lens

## Result

`passed`

The selected Direction 2 source visual and the runnable mobile prototype have no remaining actionable P0, P1, or P2 visual mismatch. The prototype also covers the complete state loop required for MX-01. Human first-use comprehension remains a separate product gate and is not claimed by this design QA result.

## Current Today visual-preservation review

The current iOS Today surface is now the visual source truth for the prototype's
main screen. The MX-01 prototype preserves its navigation, editorial date and
title, attention count, section hierarchy, quiet rounded focus card, primary
black action, secondary Pursuit action, compact Next list, persistent
`Ask anything` composer, Georgia display type, pearl neutrals, graphite ink,
and restrained vermilion status accent.

- Current-product source: `qa/today-current-source-393x852.png`
- Final implementation: `qa/today-current-implementation-393x852.jpg`
- Combined same-size comparison: `qa/today-current-comparison.png`
- AX5 dark check: `qa/today-ax5-dark.jpg`
- Source and implementation pixels: 393 × 852
- Final browser state: `http://127.0.0.1:4173/?view=today`

The source image contains an explicit synthetic-preview boundary and an older
synthetic person. The implementation intentionally compares the normal Today
state, current MX-01 synthetic person, and evidence-safe decision language; it
does not reproduce the preview warning or the superseded `AI insight` wording.
These are state/content changes rather than visual-direction changes.

The combined review found no actionable P0, P1, or P2 mismatch. Accepted P3
differences are the protected browser runtime's iPhone bezel/status chrome,
content-dependent line wrapping, and the implementation's visible due date in
the card eyebrow. No new visual system, navigation model, card language, or
screen density was introduced.

## Moderator study runner QA

The MX-01 moderator runner reuses the frozen 393 × 852 Today, fact, and
approval images. It adds no prompt, label, overlay, scaling change, or scoring
signal inside participant stimuli.

- Runner URL: `http://127.0.0.1:4173/?study=moderator`
- Frozen lead source: `public/qa/states/today.png`
- Browser-rendered lead crop: `qa/study-lead-stimulus-rendered.jpg`
- Same-size combined comparison: `qa/study-stimulus-comparison.jpg`
- Full moderator setup: `qa/study-setup.jpg`
- Five-second hidden-response state: `qa/study-lead-response.jpg`
- Runner QA viewport: 1440 × 1500 at 1× density
- Narrow responsive check: 780 × 1000 with no horizontal overflow
- Source and rendered stimulus pixels: 393 × 852

### Required fidelity surfaces

- Fonts and typography: moderator hierarchy reuses the existing Georgia
  display face and system UI text; the participant stimuli are raster-identical
  apart from expected JPEG capture compression.
- Spacing and layout rhythm: the desktop runner keeps one restrained protocol
  rail and one work surface; at 780 px it collapses to one column without
  clipping fields or persistent controls.
- Colors and visual tokens: pearl neutrals, graphite ink, restrained
  vermilion, radii, and quiet elevation remain consistent with Today.
- Image quality and asset fidelity: the source PNG is rendered at exactly
  393 × 852. The combined comparison shows no crop, scale, overlay, or content
  drift.
- Copy and content: moderator copy exposes blinding, synthetic-only scope,
  session-memory retention, blank scoring fields, and the no-external-write
  boundary without coaching the participant.

### Runner comparison history

1. `qa/study-setup.jpg` — P1: the desktop moderator interface was initially
   mounted inside the protected phone runtime, causing severe horizontal
   overflow. Fixed by rendering moderator mode through an app-owned portal
   above the unchanged protected runtime.
2. `qa/study-setup.jpg` — no remaining layout P0/P1/P2. The moderator
   interface renders as a desktop work surface while all protected runtime
   files remain intact and normal prototype routes retain the phone runtime.
3. `qa/study-stimulus-comparison.jpg` — no actionable P0/P1/P2. The five-second
   lead source and browser-rendered stimulus match at 393 × 852.

### Runner functional inspection

- At 4.4 seconds the Today stimulus remained visible; after 5.25 seconds it
  was hidden and the verbatim fields were shown.
- P01 displayed fact confirmation first; after saving P01, P02 was assigned
  approval first automatically.
- All five lead questions and both authority questions were required before
  progression.
- Saving a response changed the visible count to `1/10 saved` without scoring
  or claiming comprehension.
- CSV export became available only after a response was frozen. Export rows
  preserve the ten participant IDs and leave both pass fields, both scorer
  fields, and adjudication blank.
- Responses are held only in React memory; refreshing the page clears them.

`final result: passed`

## Independent scoring and adjudication workbench QA

The post-moderation evidence workbench extends the moderator runner's existing
visual system; it does not change the protected mobile runtime or the Today
surface. The desktop scorer and adjudicator keep the same pearl canvas,
graphite ink, Georgia display hierarchy, restrained vermilion kicker, quiet
rounded panel, sticky protocol rail, borders, radii, and control density.

- Scorer entries:
  `http://127.0.0.1:4173/?study=score&role=scorer_1` and
  `http://127.0.0.1:4173/?study=score&role=scorer_2`
- Adjudication entry:
  `http://127.0.0.1:4173/?study=adjudicate`
- Desktop reference comparison: `qa/study-setup.jpg` and
  `qa/study-scorer-entry.png`, both at 1440 px width
- Loaded evidence state: `qa/study-scorer-evidence.png`
- Atomic disagreement state: `qa/study-adjudication-disagreement.png`
- Manual-review draft state: `qa/study-adjudication-draft.png`
- Narrow responsive state: `qa/study-scorer-mobile.png` at 390 × 844

Same-input visual inspection of the moderator entry and scorer entry found no
actionable P0, P1, or P2 design-system drift. The added file target, criterion
rows, binary controls, provenance strip, disagreement comparison, and gate
cards use the existing spatial and material grammar. At 390 px the rail and
work surface collapse to one column with no horizontal overflow.

Browser functional rehearsal used ten entirely synthetic responses and two
synthetic score files. It verified:

- raw input is blocked until P01–P10 are complete, first-use, in frozen order,
  and have blank score/adjudication fields;
- one scorer can explicitly complete all 80 atomic decisions and reach
  `10/10 scored` without seeing the other scorer;
- scorer role and identity freeze after the first participant score;
- editing a previously frozen participant score removes it from the completed
  count and disables export until the participant is explicitly frozen again;
- the adjudicator rejects unmatched provenance and joins files by the exact
  raw SHA-256 fingerprint;
- one synthetic criterion disagreement remains atomic, shows both scorer
  values beside the verbatim answer, and requires both a final value and a
  written rationale;
- final results, adjudication audit, and status remain explicit downloads with
  a visible `Draft only · manual review required` boundary;
- deterministic rehearsal output was Test A 9/10 and Test B 10/10; these values
  are not participant evidence and did not update official repository state;
- refreshing either workbench clears its in-memory state; and
- fresh-console inspection found zero application errors.

The pure evidence check additionally covers quoted commas, embedded quotes and
line breaks, prefilled raw-score rejection, derived-pass tampering, scorer-file
role and fingerprint matching, mandatory disagreement rationale, final result
serialization, scorer-value tampering during adjudication, and gate calculation.

`evidence workbench result: passed`

## Frozen comparison

- Source truth: `qa/source-normalized.png`
- Implementation: `qa/implementation-screen-pass-5.jpg`
- Full side-by-side evidence: `qa/comparison-pass-5.png`
- State-specific evidence: `qa/state-matrix.png` and `qa/states/*.png`
- VoiceOver linear-order render: `qa/voiceover-order.png` (QA annotation;
  physical-device spoken traversal remains pending)
- Browser state: `http://127.0.0.1:4173/?name=long&stage=fact`
- Source pixels: 393 × 852
- Implementation CSS device and captured pixels: 393 × 852 at 1× browser density
- Browser QA viewport: 1400 × 1200 for single-device comparison; 1800 × 1200 for the four-column state matrix
- Theme/content state: light, mixed-script long name, source-local fact decision

The full comparison is sufficient for the selected state because the source, identity, dependency, exact source, causal seam, Brief, state diff, and primary fact control are visible together at identical dimensions. The state matrix is the focused evidence for approval, executing, unknown, failed, reconciled, verified, ambiguous identity, insufficient evidence, AX5 dark mode, no-action, Person, and Pursuit states.

## Comparison history

1. `qa/comparison-pass-1.png` — P1: the implementation used generic Session back/title/more chrome instead of the source's quiet brand mark. P1: the first tray height obscured the source/Brief relationship. Fixed by matching the brand header, compacting the upper context, and anchoring a shorter fact tray.
2. `qa/comparison-pass-2.png` — P2: the source/Brief hierarchy remained too compressed and the decision layer carried excessive vertical weight. Fixed by tightening metadata, preserving the full source quote and causal seam, and rebalancing tray controls.
3. `qa/comparison-pass-3.png` — P2: the dependency row lacked the source's icon-container and expansion affordance, weakening the object hierarchy. Fixed with the matching circular muted icon treatment and a trailing chevron.
4. `qa/comparison-pass-4.png` — no P0/P1; one P2 source-row parity refinement remained and was corrected without changing the state model.
5. `qa/comparison-pass-5.png` — no actionable P0/P1/P2. Accepted P3 differences are the protected mobile runtime's device/status chrome and minor raster/font/icon differences between the generated visual and browser rendering.

## Functional inspection

Browser interaction, not screenshots alone, verified:

- Today contains one lead dependency, exactly ten compact continuations, and a visible no-action count.
- Today top navigation opens Sessions and People; People returns to Today when
  entered from Today; the focus CTA opens the fact-review Session; the global
  composer opens New Session; Open Pursuit opens the Pursuit object.
- New Session exposes text, image, file, and voice intent modes; empty text cannot send; image intent can proceed to identity review without authorizing a write.
- Ambiguous identity starts with no preselection and keeps source attachment disabled until the current temporal owner is explicitly chosen.
- The fact decision shows the exact source and keeps the next effect locked until `Confirm fact`.
- The separate action decision previews target, time, and exact effect and explicitly excludes message, meeting, contact, ATS, and CRM writes.
- Approval enters executing, then truthful outcome-unknown; reconciliation finds the matching operation; the verified Receipt stays in the same Session and exposes operation `TS-RM-2048 · revision 1`.
- Failure preserves both the confirmed fact and the separate proposal and returns to the approval surface without executing.
- AX5 dark mode has no horizontal overflow; the bottom navigation and labels remain inside the 393 × 852 device screen; reduced-motion state is explicit.

Fresh-console inspection found no application errors. The only fresh warning is Motion's expected notice that the host has Reduce Motion enabled. Earlier Vite hot-reload errors were transient development-history entries and did not recur in a clean tab or production build.

## Verification

- `npm run check:runtime` — passed; 28 protected runtime files intact.
- `npm run test:runtime` — passed; 8/8 Playwright mobile-runtime tests.
- `npm run build` — passed; TypeScript and Vite production build.
- `npm run test:evidence` — passed; CSV, provenance, independent-score,
  adjudication, and gate-draft checks.
- `npm run test:sites` — passed; 4/4 packaging and routing tests.

## Remaining non-design evidence

- Run the frozen ten-participant five-second and fact-versus-action test before MX-01 can exit.
- Run manual VoiceOver and supported physical-device coverage before treating the prototype as release evidence.
- Exercise a real destination adapter before claiming external write, permission, reversal, or lifecycle behavior.
