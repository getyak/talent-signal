# V1 experience correction — V8 frozen artifact

## Review object

- Artifact ID: `TS-V1-EXPERIENCE-2026-08-25-08`
- Type: iOS build, account-scoped Ask loop, fail-closed source review,
  authority-bound idempotency, exact-Pursuit handoff, Capture boundary, and
  Apple account-entry boundary
- Version: working-tree snapshot frozen at 2026-08-25 04:15 CST by the source,
  result-bundle, and screenshot hashes in
  [`runtime-evidence.json`](runtime-evidence.json)
- Target user: an independent recruiter returning to relationship work
- Environment: iPhone 17 Pro Max Simulator, iOS 26.5, macOS 26.4; fresh V8
  Docker image and PostgreSQL through migration `026_apple_auth`
- Scenario: sign in, return to sparse Today, open conversation-first Ask,
  search canonical People/contexts, inspect or correct exact evidence, recover
  interrupted review work, open existing Pursuit work, use Capture, and sign out.

## Delivered experience

Today gives the eye one resting point, one compact continuation, and no feed or
inline global search. Ask is the default conversational surface. Prompt controls
and Capture remain in the composer; canonical workspace search appears only
when requested.

The canonical answer distinguishes confirmed state, exact evidence, and
existing work. An active action is structured into owner, recruiter-local due
state, waiting item, close condition, and effect boundary. Its `Open Pursuit`
control is bound to the exact Pursuit/action and creates no new work.

Citation detail is bound to live task-and-citation authority. Before any review
request, the app must durably save an account-scoped recovery operation. If that
protected save fails, the detail remains open with an inline error, no request is
sent, and the app does not present any canonical change as saved. Retry enters
pending only after that transition also saves durably.

The canonical answer now carries the exact `last_review_id`. Review idempotency
binds fragment, expected status, authority review ID, decision, and reason. A
retry within one authority cycle uses the same key; a later review cycle gets a
new key even when the recruiter chooses the same reason. The response must also
return a parseable decision timestamp before the local operation becomes
applied.

Pending, failed, outcome-unknown, and applied states remain visible in the
Session. A compact disclosure preserves all local review decisions newest-first,
including timestamp, reason, state, and operation-key suffix. Re-reviewing a
corrected source appends a decision against rejected state. The old answer stays
stale; only a fresh Ask can cite the source again. Recovery stores no excerpt.

Sessions and review recovery are protected, backup-excluded, account-scoped,
retention-bounded, and covered by sign-out tombstones. Sign in with Apple keeps
its native challenge, nonce, issuer, audience, signature, replay, session,
revocation, logout, and identity-separation boundaries.

## Frozen UI evidence

The machine-readable map and hashes are in [`ui/manifest.json`](ui/manifest.json).

| Journey | Evidence |
| --- | --- |
| Sparse Today | [`ui/today.png`](ui/today.png) |
| Conversation-first Ask | [`ui/ask-conversation.png`](ui/ask-conversation.png) |
| Ask at AX5 | [`ui/ask-ax5.png`](ui/ask-ax5.png) |
| Confirmed evidence, exact action, and Open Pursuit | [`ui/ask-backend-response.png`](ui/ask-backend-response.png) |
| Exact citation detail | [`ui/ask-citation-detail.png`](ui/ask-citation-detail.png) |
| Dispute saved, old answer stale, and re-review entry | [`ui/ask-citation-stale.png`](ui/ask-citation-stale.png) |
| Sign in with Apple | [`ui/login-apple.png`](ui/login-apple.png) |
| Purpose-bound Capture | [`ui/capture-chooser.png`](ui/capture-chooser.png) |
| Audio idle boundary | [`ui/audio-idle.png`](ui/audio-idle.png) |

## V7 panel vetoes addressed

- Protected recovery persistence is now a precondition to network I/O. Failed
  creation removes the tentative operation; failed pending transition rolls its
  in-memory state back. Both paths expose an explicit no-request/no-canonical-
  change error, and focused executable tests verify them.
- Review idempotency now binds the exact backend `last_review_id`, not only the
  fragment, status, decision, and reason. Focused tests prove retry equality
  inside one authority cycle and inequality across re-review cycles.
- The previously latest-only operation UI now offers the full append-only local
  review history behind a compact disclosure, retaining the quiet default.
- The V5 detached-citation veto remains closed: rejection or authority loss
  immediately stales the turn, hides citations, and closes exact detail.

## Proof and limit

Fresh isolated V8 results pass 6/6 selected UI journeys: one canonical
database-backed citation journey and five hierarchy, AX5, login, and Capture
journeys. iOS unit tests pass 95/95; backend tests pass 129/129; `pnpm check`,
`pnpm docs:check`, whitespace, migration readiness, and an unsigned generic iOS
Release build pass.

This remains a strong local Simulator/loopback gate, not a 99/100 field claim.
Physical assistive technology, microphone/privacy behavior, Apple Account
authorization, production deployment, recruiter/candidate outcomes, and a
frozen kill-and-relaunch UI recording remain missing. `Open Pursuit` is visible
and exact-reference/source proven, but its tap journey is not frozen. Failure
cards and the expanded multi-cycle audit remain source/unit proven without a
frozen screenshot.

## Panel

Selected independently: `recruiter-workflow-reviewer` for operational value,
`evidence-safety-reviewer` for provenance/privacy/action boundaries,
`mobile-ux-reviewer` for native craft and accessibility, and
`candidate-experience-guardrail` for human impact. Selection science is omitted
because this artifact does not rate, rank, predict, or assess a candidate.
