# TestFlight AI runtime injection

## Outcome

Make recruiter dictation available through the owner-operated TestFlight
backend without placing provider credentials in GitHub Actions, the iOS bundle,
or a persistent environment file. A deployment is complete only when the
runtime contract, loopback container, synthetic provider probe, tailnet HTTPS,
and authenticated mobile surface agree.

## Boundaries

In scope:

- transient Infisical injection from `staging:/shared` and
  `staging:/backend` into the Mac deployment process;
- an explicit Compose allowlist for the TestFlight API container;
- a voice-specific remote-processing admission gate;
- fail-closed configuration validation and a synthetic silent-audio provider
  probe;
- a Debug-only loopback voice client that obtains its own simulated fixture
  session instead of exposing or inventing a token in the workspace model;
- operational documentation and focused tests.

Out of scope:

- placing backend or provider credentials in GitHub Actions or the app bundle;
- using a persistent `.env` as a second secret source;
- admitting private candidate evidence to a remote Agent provider;
- replacing the bounded Chat answer with the multi-step Agent runtime or
  presenting either path as an open-ended model conversation;
- external TestFlight or public App Store hosting from this Mac.

## Current evidence and decisions

- Tailscale Serve owns the root HTTPS handler and forwards it to API port 4317
  on loopback; local and tailnet readiness pass.
- The TestFlight API and PostgreSQL containers are healthy, and PostgreSQL has
  no host port.
- Staging contains the Doubao provider name, App ID, Access Token, and the
  voice-specific admission value; the deployed TestFlight API receives only
  the allowlisted ASR names.
- The existing broad sensitive-AI gate also controls unrelated Web screenshot
  providers. Recruiter dictation therefore receives a narrower admission gate
  rather than widening every remote-processing path.
- Remote Agent providers remain hard-limited to synthetic evidence by the
  backend. No staging Agent credential is copied from development because
  environments require separate credentials and provider admission remains
  incomplete.

## Chosen approach

1. Add `TALENT_SIGNAL_ALLOW_REMOTE_VOICE_TRANSCRIPTION` to the shared secret
   manifest and make voice configuration part of the TestFlight backend
   contract.
2. Pass only the ASR values used by the backend through the TestFlight Compose
   API environment; do not pass the unused Doubao secret key.
3. Validate the exact admission value and provider before Compose starts, then
   run a silent synthetic WAV through the real provider from inside the API
   container after startup.
4. Keep GitHub Actions scoped to `staging:/release`; it receives only release,
   signing, API-origin, and ephemeral tailnet credentials.
5. Verify the deployed container by name presence, API/auth readiness, tailnet
   HTTPS, provider response, focused tests, and documentation checks.

## Milestones

1. **Complete — executable configuration boundary**
   - the voice-specific gate, TestFlight Compose allowlist, required secret
     contract, semantic validator, and generic-gate counterexample are in code;
   - Debug canonical workspaces obtain a loopback-only simulated voice session,
     while Release continues to use the authenticated Apple-login session.
2. **Complete — staging admission and TestFlight redeploy**
   - staging and development contain the voice gate without exposing provider
     values;
   - the TestFlight API was rebuilt and remains healthy on loopback behind the
     existing tailnet-only HTTPS handler.
3. **Complete — runtime, provider, and documentation proof**
   - the container-side silent WAV probe reached Doubao and returned the
     expected no-speech response;
   - a synthetic spoken Chinese WAV returned an editable draft through the
     authenticated development route with no Talent Signal audio retention;
   - Release build, deterministic voice UI, canonical loopback voice UI,
     backend typecheck/tests, secret tests, Compose validation, docs checks,
     and the Tailscale backend audit pass.

## Remaining proof boundary

The installed TestFlight build still needs one authorized physical-iPhone
replay with Tailscale connected, Apple login restored, microphone permission
granted, and a short recruiter-owned phrase. Simulator, provider, authentication
challenge, and tailnet proofs do not substitute for that device observation.

## Reconsider when

- A provider-specific admission record establishes that real candidate
  evidence can be processed remotely; until then Agent execution stays
  synthetic-only.
- TestFlight expands beyond a small authorized tailnet group; move to the
  reviewed public production topology before widening access.
- Infisical workload identity becomes available on the operator Mac; replace
  the human CLI session without changing the application environment contract.
