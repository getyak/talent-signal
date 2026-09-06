# Automatic capture, audio, and presentation diagnostic stages

## Outcome and measurement meaning

An explicit iOS Lab recording now observes additional closed client stages at
the actual product boundaries for protected image-source preparation, capture
review preparation, audio-session preparation, audio-payload finalization,
voice transcription, and the first display-link callback after presenting key
capture and Agent surfaces.

The display callback is deliberately named for what was measured. It means the
main run loop reached one `CADisplayLink` callback after presentation. It does
not prove that pixels reached the display, measure GPU work, establish usable
state, or represent first-token latency. Existing manual first-content and
interactive markers remain the tester's observed milestones.

All stage names come from a closed enum. Reports retain timing, ancestry, and
completed/failed/cancelled/skipped outcome only. Image bytes, recording purpose,
authorizing party, authorization text, transcript, filenames, identities, and
errors have no stage field and are not retained.

## Product boundaries

- `PendingCaptureInbox.stage` measures validation-adjacent protected image
  persistence and duplicate lookup as image-source preparation.
- `RelationshipCaptureStore.recognize` measures recovery, on-device recognition,
  draft construction, and protected review preparation.
- Standalone Audio Signal and Agent voice input measure audio preparation and
  payload finalization; Agent voice transcription has its own parent stage so
  its request can retain the correct operation ancestry.
- Audio Signal, Signal Capture, screenshot review, capture review, and Agent Ask
  surfaces install the display-callback probe. The probe closes as cancelled if
  the surface disappears before the callback.

## Native evidence

Device: iPhone 17 Pro Simulator, iOS 26.5, Xcode 26.6; deployment target iOS 16.

Five focused `LabClientSpanTests` passed. The new check exercised the actual
protected image inbox, standalone audio store, Agent voice-input store, and
display-callback stage. It verified completed durations and confirmed that the
synthetic authorization text and transcript were absent from encoded output.

One signed UI journey then started a normal Lab recording, left Lab, opened the
compiled Agent voice flow, recorded and transcribed through deterministic local
test services, stopped from the global diagnostic control, terminated the app,
and reopened the exact report. The reviewed export contained the four expected
audio/presentation kinds with no unfinished outcome and no transcript. The
visible timeline is retained in [the native report](audio-presentation-stages.png).
The [source proof](source-proof.json) records the reviewed file hashes and gate
counts.

## Remaining device evidence

Simulator execution verifies source integration, lifecycle, persistence, UI,
and truthful labeling. Actual physical-device MetricKit delivery, microphone
and audio-session behavior, GPU analysis, and Instruments traces remain release
checks. Missing measurements remain unavailable rather than being treated as
zero.
