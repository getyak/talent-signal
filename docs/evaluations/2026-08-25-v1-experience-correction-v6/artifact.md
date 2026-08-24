# V1 experience correction — V6 frozen artifact

## Review object

- Artifact ID: `TS-V1-EXPERIENCE-2026-08-25-06`
- Type: iOS build, real account-scoped Ask loop, protected Session resume,
  evidence correction, Capture boundary, and Apple account-entry boundary
- Version: working-tree snapshot frozen at 2026-08-25 03:16 CST by the source,
  test-result, and screenshot hashes in
  [`runtime-evidence.json`](runtime-evidence.json)
- Target user: an independent recruiter returning to relationship work
- Environment: iPhone 17 Pro Max Simulator, iOS 26.5, macOS 26.4; loopback
  Fastify/PostgreSQL backend through migration `026_apple_auth`
- Scenario: sign in, return to a sparse Today, open conversation-first Ask,
  search canonical account-scoped People and contexts, inspect or dispute exact
  evidence, recover interrupted work, use purpose-bound Capture, and sign out.

## Delivered experience

Today gives the eye one resting point, two compact continuations, and no feed or
inline global search. Ask is the default conversational surface. Prompt controls
and Capture sit in the composer; canonical workspace search appears only when
requested.

The canonical response keeps confirmed state visually confirmed. An unrelated
proposal can no longer put an unexplained review badge on the displayed
availability. The existing next move is structured into the action, owner,
recruiter-local overdue time, waiting item, close condition, and effect boundary
instead of one metadata paragraph. It creates no new action or external effect.

Every citation must pass authenticated exact-scope readback before recording.
The app revalidates citation-bearing answers on Ask open, foreground return, and
once per minute while Ask remains visible. Citation detail is bound to the exact
live task and citation, not a detached payload. Any rejection, deletion,
authorization loss, expiry, or readback failure stales the turn and dismisses an
open detail. A local dispute clears the detail before the request begins, so a
dropped response cannot leave the excerpt visible as current.

Sessions use protected, backup-excluded, account-scoped storage. Drafts expire
at seven days and Sessions at thirty through exact-boundary timers plus
prune-on-read. Retry and relaunch reuse the same in-flight idempotency key.
Sign-out uses a deletion tombstone, suppresses restore, verifies local absence,
then invalidates the server session.

Sign in with Apple includes a native/backend challenge, nonce, issuer, audience,
signature, replay, protected session, revocation, and logout boundary. Apple
identity never becomes candidate or relationship evidence.

## Frozen UI evidence

The machine-readable map and hashes are in [`ui/manifest.json`](ui/manifest.json).

| Journey | Evidence |
| --- | --- |
| Sparse Today | [`ui/today.png`](ui/today.png) |
| Conversation-first Ask | [`ui/ask-conversation.png`](ui/ask-conversation.png) |
| Ask at AX5 | [`ui/ask-ax5.png`](ui/ask-ax5.png) |
| Confirmed evidence and structured owned action | [`ui/ask-backend-response.png`](ui/ask-backend-response.png) |
| Exact citation detail | [`ui/ask-citation-detail.png`](ui/ask-citation-detail.png) |
| Disputed citation becomes stale and detail closes | [`ui/ask-citation-stale.png`](ui/ask-citation-stale.png) |
| Sign in with Apple | [`ui/login-apple.png`](ui/login-apple.png) |
| Purpose-bound Capture | [`ui/capture-chooser.png`](ui/capture-chooser.png) |
| Audio idle boundary | [`ui/audio-idle.png`](ui/audio-idle.png) |

## V5 panel findings addressed

- The safety veto is closed in implementation: citation detail observes the
  exact task-and-citation authority in the live Session store and dismisses on
  local dispute before I/O, foreground/readback invalidation, Ask-entry
  invalidation, or periodic invalidation.
- A confirmed person brief no longer inherits an unrelated proposed-context
  badge. Review state stays attached to the exact review block.
- Existing work is no longer a dense UTC text slab. The action leads, owner and
  recruiter-local overdue state scan together, and waiting and close conditions
  have separate labels.

## Proof and limit

The final selected suite passes 6/6 UI journeys, 90/90 iOS unit tests, and
129/129 backend tests. The affected TypeScript build, backend readiness,
documentation and whitespace checks, and an unsigned generic iOS Release build
pass.

This is a strong local Simulator and loopback gate, not a 99/100 field claim.
Physical assistive technology, microphone and privacy behavior, Apple Account
authorization, production deployment, and recruiter/candidate outcomes remain
missing. Source reinstatement UI, an Ask-to-Pursuit handoff, and a frozen
kill-and-relaunch recording also remain open product or evidence findings.

## Panel

Selected independently: `recruiter-workflow-reviewer` for operational value,
`evidence-safety-reviewer` for provenance/privacy/action boundaries,
`mobile-ux-reviewer` for native craft and accessibility, and
`candidate-experience-guardrail` for human impact. Selection science is omitted
because the artifact does not rate, rank, predict, or assess a candidate.
