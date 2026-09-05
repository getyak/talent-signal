# iOS voice composer design

## Outcome

Make voice a trustworthy first-class input from both the global Today composer
and every Agent Session. A recruiter can touch and hold the home text surface to
enter voice immediately, see provisional live words, stop to create one editable
transcript draft, and decide separately when to send it to Agent.

Completion is observable when the deterministic iOS journey proves tap-to-type,
home touch-and-hold-to-voice, Session touch-and-hold-to-record, editable final
text, explicit Send, cancellation, interruption, accessibility actions, and the
fixed one-minute audio-size contract.

## Boundary

In scope:

- the Today/Sessions/People global composer rail and Relationship Ask composer;
- touch-and-hold, tap, lock, cancel, stop, transcription, draft, and Send states;
- on-device provisional transcription plus disclosed remote final transcription;
- fixed 16 kHz mono Int16 WAV output within the backend request limit;
- English and Simplified Chinese copy, accessibility, focused tests, and product
  documentation.

Out of scope:

- ambient or background recording;
- full-duplex spoken Agent replies;
- making a transcript, recruiter recollection, or model interpretation confirmed
  relationship evidence;
- automatic fact confirmation, Proposal approval, contact/calendar/message write,
  or any other external effect;
- removing the separately authorized Audio Signal capture flow.

## Product and safety model

The primary surface is **iOS capture or Today** for a time-constrained recruiter.
It answers: “Can I speak from where I am, verify the words that will be sent, and
continue without changing relationship truth or external systems by surprise?”

The canonical objects remain the Session intent and the Pursuit/Person governed
state. Temporary audio and live words are input artifacts. The cloud transcript
is an editable proposal until the recruiter taps Send. Agent interpretation and
all later actions retain their existing independent review boundaries.

The one attention item is the current voice state: listening, finalizing, editable
draft, or recoverable failure. Motion remains restrained and disabled by Reduce
Motion. Diagnostics never contain audio or transcript content.

## Chosen direction and rejected alternatives

Selected: keep the visible waveform button for discoverability and accessibility,
while making the full home text surface a second direct voice gesture. A normal tap
opens text; touch and hold opens the same protected hands-free voice state. Inside
the Session composer, holding the voice control records and release stops for
review. The final transcript always returns to the editable composer.

Rejected: hiding voice behind only a long press. It has poor first-use discovery
and no adequate VoiceOver affordance. Rejected: release-to-send by default. The
on-device live preview and provider-final transcript are different artifacts, so
automatic submission can send words the recruiter never reviewed. Rejected:
streaming partial text into Agent reasoning. Partial hypotheses are unstable and
have no submission authority.

## Milestones

1. **Complete — interaction and state contract.** The home text surface supports
   tap-to-type and a timed touch-and-hold voice entry. Session voice always returns
   an editable draft, and Send remains a separate recruiter decision.
2. **Complete — audio reliability.** Provider-bound capture is normalized to
   16 kHz mono Int16 WAV; one minute is 1,920,044 estimated bytes and the client
   rejects payloads above the 2,500,000-byte backend limit before reading them.
3. **Complete — real-surface proof.** Seventeen audio lifecycle tests and six
   focused voice UI tests pass. Screenshots cover English live/draft states,
   Simplified Chinese, dark mode, AX5, and Reduce Motion; unit tests cover failure,
   cancellation, interruption, foreground loss, deletion, and the size contract.
4. **Complete — delivery.** The final diff and safety boundary were reviewed;
   commit, push, remote integration, and ancestry verification are recorded in
   Git history.

## Remaining proof boundary

Simulator and deterministic transcription can verify interaction and state
integrity. They cannot prove microphone ergonomics, speech accuracy, Bluetooth
routes, provider latency, or field-network behavior on a physical iPhone; those
remain explicit TestFlight gates rather than implicit release claims.
