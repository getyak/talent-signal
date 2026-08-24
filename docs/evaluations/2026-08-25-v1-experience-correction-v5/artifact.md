# V1 experience correction — V5 frozen artifact

## Review object

- Artifact ID: `TS-V1-EXPERIENCE-2026-08-25-05`
- Type: iOS build, real account-scoped Ask loop, protected Session resume,
  evidence correction, Capture boundary, and Apple account-entry boundary
- Version: working-tree snapshot frozen at 2026-08-25 02:58 CST by the source,
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
requested. The backend response no longer repeats an already attached source.

The response separates what changed from work already owned in the Pursuit. It
shows an explicit candidate date and timezone, one exact evidence entry, and the
existing action, owner, due time, open gap, and close condition. It creates no
new action or external effect and cannot also claim `no_action`. Relative timing
without an explicit date and timezone stays in review.

Every citation must pass authenticated exact-scope readback before recording.
The app revalidates citation-bearing answers on Ask open, foreground return, and
once per minute while Ask remains visible. Any mismatch, authorization loss, or
readback failure makes the local turn stale. A source dispute does this
immediately, before the network response returns.

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
| Canonical evidence and owned action | [`ui/ask-backend-response.png`](ui/ask-backend-response.png) |
| Exact citation detail | [`ui/ask-citation-detail.png`](ui/ask-citation-detail.png) |
| Disputed citation becomes stale | [`ui/ask-citation-stale.png`](ui/ask-citation-stale.png) |
| Sign in with Apple | [`ui/login-apple.png`](ui/login-apple.png) |
| Purpose-bound Capture | [`ui/capture-chooser.png`](ui/capture-chooser.png) |
| Audio idle boundary | [`ui/audio-idle.png`](ui/audio-idle.png) |

## V4 panel findings addressed

- The canonical Ask fixture uses `2026-09-01, Asia/Shanghai`; unresolved relative
  dates are excluded from current-state answers and sent to fact review.
- Ask reconciles a canonical open action and gap instead of presenting a false
  `no_action`. Duplicate source-receipt prose is suppressed.
- Source revalidation is no longer limited to a successful local callback. It
  runs on entry, foreground return, and periodically while the answer is open.
- Continuously visible Session collections remove and persist expired state at
  the exact 7/30-day boundary.
- Citation detail formats both observed and last-reviewed times in the source
  timezone rather than exposing raw UTC strings.

## Proof and limit

The final selected suite passes 6/6 UI journeys, 90/90 iOS unit tests, and
129/129 backend tests. `pnpm check`, the production Web build, backend readiness,
and an unsigned generic iOS Release build pass.

This is a strong local Simulator and loopback gate, not a 99/100 field claim.
Physical assistive technology, microphone and privacy behavior, Apple Account
authorization, production deployment, and recruiter/candidate outcomes remain
missing. Source reinstatement UI and a frozen kill-and-relaunch recording also
remain open evidence or product findings.

## Panel

Selected independently: `recruiter-workflow-reviewer` for operational value,
`evidence-safety-reviewer` for provenance/privacy/action boundaries,
`mobile-ux-reviewer` for native craft and accessibility, and
`candidate-experience-guardrail` for human impact. Selection science is omitted
because the artifact does not rate, rank, predict, or assess a candidate.
