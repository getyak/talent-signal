# iOS recruiter voice input

## Outcome

Add a lightweight recruiter-dictation path to the mobile Agent composer. A
recruiter can record their own foreground voice, explicitly send the stopped
recording to the configured Doubao ASR service, receive an editable transcript
in the composer, and decide separately whether to send it to the Agent.

Completion evidence:

- secrets exist only in Git-ignored local environment files;
- the authenticated backend proxies ASR without exposing provider credentials;
- temporary audio is deleted after success, failure, cancellation, or
  foreground loss;
- a transcript is inserted as an editable draft and is never auto-submitted;
- focused backend, iOS unit, iOS UI/build, localization, and docs checks pass.

## Boundaries

In scope:

- recruiter dictation from the Agent composer;
- foreground-only microphone use and one-time cloud-processing disclosure;
- Doubao recording-file flash ASR behind the existing sensitive-processing
  gate;
- provider-neutral backend and iOS service seams with deterministic tests;
- loading, cancellation, permission denial, failure, draft insertion, and
  temporary-file deletion states.

Out of scope:

- background listening or automatic microphone start;
- candidate-call or meeting recording changes;
- live partial transcription;
- automatic Agent submission, fact confirmation, Proposal creation, or any
  external write;
- sending candidate screenshots to image-generation models;
- claiming provider retention or deletion guarantees beyond verified evidence.

## Current evidence and decisions

- The existing Audio Signal flow is an authorized conversation recording and
  must remain separate from recruiter dictation.
- The Agent composer already exposes a waveform affordance but routes it to the
  heavier Audio Signal capture.
- The official Doubao flash recording API accepts WAV, MP3, OGG, or Opus and
  uses the fixed `volc.bigasr.auc_turbo` resource. The supplied legacy
  credentials map to App ID plus Access Token headers.
- Ark screenshot understanding already exists server-side. Its credential is
  configured locally, but candidate evidence will not be routed to Seedream.
- The provider privacy material does not prove Talent Signal-side vendor
  deletion or a fixed provider retention interval. The UI therefore promises
  only that Talent Signal does not persist the temporary dictation audio.

Chosen approach:

1. Record a short mono 16 kHz WAV in a protected temporary directory.
2. Stop before upload and show the remote-transcription boundary.
3. Send base64 audio through an authenticated, rate-limited backend route.
4. Return provider/version/request metadata plus transcript as a draft.
5. Insert the draft into the composer without sending it.
6. Delete the temporary file on every terminal path.

Rejected alternatives:

- Reusing Audio Signal would bundle recruiter dictation with candidate
  recording authorization and create unnecessary friction.
- Shipping Doubao credentials in the app would expose long-lived secrets.
- Auto-sending the transcript would collapse capture intent into Agent action.
- Live streaming adds protocol, interruption, and partial-result complexity
  before the basic workflow is proven.

## Milestones

1. **In progress — provider boundary and local configuration**
   - add ignored local values without printing them;
   - implement and unit-test the Doubao adapter and authenticated route;
   - pass variables into the local backend runtime.
2. **Pending — iOS recording and composer interaction**
   - add protected temporary WAV recording and ASR client;
   - add one-tap composer control, consent, progress, cancel, errors, and draft
     insertion;
   - preserve the existing draft and Audio Signal flow.
3. **Pending — real-surface verification and safety review**
   - run focused tests, build, localization, and docs checks;
   - exercise the flow on Simulator with synthetic speech when possible;
   - review privacy, accessibility, interruption, and no-auto-send behavior.

## Important unknowns

- The supplied account must have `volc.bigasr.auc_turbo` enabled. A configured
  credential alone does not prove entitlement.
- Provider-side retention/deletion terms may depend on the customer's service
  agreement. This implementation does not claim an exact interval.
- Simulator microphone and host audio routing may limit live ASR proof; mocked
  provider tests remain deterministic.
