# V1 experience correction — V4 frozen artifact

## Review object

- Artifact ID: `TS-V1-EXPERIENCE-2026-08-25-04`
- Type: iOS build, real account-scoped Ask loop, protected Session resume,
  evidence correction, Capture boundary, and Apple account-entry boundary
- Base commit: `948218c03c32aff29d6972226f2f5c7af8bc1ce0`
- Version: working-tree snapshot frozen at 2026-08-25 02:24 CST by the source
  and screenshot hashes in [`runtime-evidence.json`](runtime-evidence.json)
- Target user: an independent recruiter returning to relationship work
- Environment: iPhone 17 Pro Max Simulator, iOS 26.5, macOS 26.4; loopback
  Fastify/PostgreSQL backend with all migrations through `026_apple_auth`
- Scenario: sign in, return to a sparse Today, open a conversation-first Ask,
  search canonical account-scoped People and contexts, receive an evidence-bound
  answer, inspect or reject its exact source, retain an interrupted question,
  resume protected work, open purpose-bound Capture, and sign out.

## Delivered experience

Today now has one visual resting point. It names the affected person and change,
keeps only two compact continuations in the first scan, and removes the feed and
inline global search. Ask opens as a quiet conversation rather than a dashboard:
compact prompt controls and Capture live in the composer, while real workspace
search appears only when requested. Sessions and drafts persist locally within
the authenticated account boundary; failed or interrupted asks keep one stable
idempotency key for safe retry.

The answer is useful only when it can pass exact readback. Every citation must
resolve to one available, reviewed, confirmed, non-empty evidence fragment bound
to the same account, person, relationship context, authorization scope,
manifest, and snapshot. Rejecting a source makes the prior answer stale and
hides its citations. No answer, source review, capture, or no-action state sends
a message, schedules a meeting, or performs another external effect.

Sign in with Apple has a complete native/backend challenge, nonce, issuer,
audience, signature, replay, session, and logout boundary. Sign-out deletes the
account-scoped local Session/draft store before invalidating the external
session; a durable deletion tombstone prevents a failed cleanup from restoring
old work after relaunch. The backend readiness probe now requires the Apple auth
migration itself rather than an older migration.

## Frozen UI evidence

The machine-readable map and screenshot hashes are in
[`ui/manifest.json`](ui/manifest.json).

| Journey | Evidence |
| --- | --- |
| Sparse Today | [`ui/today.png`](ui/today.png) |
| Conversation-first Ask | [`ui/ask-conversation.png`](ui/ask-conversation.png) |
| Ask at AX5 | [`ui/ask-ax5.png`](ui/ask-ax5.png) |
| Real backend response | [`ui/ask-backend-response.png`](ui/ask-backend-response.png) |
| Exact citation detail | [`ui/ask-citation-detail.png`](ui/ask-citation-detail.png) |
| Rejected citation becomes stale | [`ui/ask-citation-stale.png`](ui/ask-citation-stale.png) |
| Sign in with Apple | [`ui/login-apple.png`](ui/login-apple.png) |
| Purpose-bound Capture | [`ui/capture-chooser.png`](ui/capture-chooser.png) |
| Audio idle boundary | [`ui/audio-idle.png`](ui/audio-idle.png) |

## V3 findings closed in V4

- Citation availability now validates its own canonical Person, relationship
  context, review state, attribution decision, exact excerpt, source lifecycle,
  and current authorization; one unavailable citation fails the entire answer.
- Retention pruning runs on lifecycle and every read or mutation, not only app
  initialization. Failed deletion leaves a protected tombstone, suppresses
  restoration, and retries before sign-out can complete.
- In-flight Ask retains the question and stable idempotency key across retry and
  relaunch. Persisted answers contain no response blocks, citations, or excerpts.
- Citation detail exposes a human review route. Rejection reloads canonical
  state, marks the old answer stale, and never creates an external effect.
- No-action explicitly states the condition that should cause reconsideration.
- AX5 retains the preview reason, composer, Capture control, and accessible
  labels. Exact source times use the evidence timezone.

## Proof and limit

The frozen selected suite passes 6/6 UI journeys and 88/88 iOS unit tests. The
repository check passes, including 126 backend tests and the production web
build. An unsigned generic iOS Release build succeeds. The rebuilt backend is
ready against PostgreSQL through migration `026_apple_auth`.

This is a strong local simulator and loopback release gate, not a production or
field-outcome declaration. Physical assistive-technology, microphone, privacy,
and Apple Account flows; production deployment; and recruiter/candidate field
outcomes remain missing. Specialist scores therefore cannot truthfully be
converted into a 99/100 experience claim.

## Panel

Selected independently: `recruiter-workflow-reviewer` for operational value,
`evidence-safety-reviewer` for provenance/privacy/action boundaries,
`mobile-ux-reviewer` for native craft and accessibility, and
`candidate-experience-guardrail` for human impact. Selection science is omitted
because this artifact does not rate, rank, predict, or assess a candidate.
