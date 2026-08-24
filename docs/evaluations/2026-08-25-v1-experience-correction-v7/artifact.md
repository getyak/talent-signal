# V1 experience correction — V7 frozen artifact

## Review object

- Artifact ID: `TS-V1-EXPERIENCE-2026-08-25-07`
- Type: iOS build, account-scoped Ask loop, protected review recovery,
  exact-Pursuit handoff, Capture boundary, and Apple account-entry boundary
- Version: working-tree snapshot frozen at 2026-08-25 03:50 CST by the source,
  result-bundle, and screenshot hashes in
  [`runtime-evidence.json`](runtime-evidence.json)
- Target user: an independent recruiter returning to relationship work
- Environment: iPhone 17 Pro Max Simulator, iOS 26.5, macOS 26.4; fresh
  loopback Fastify/PostgreSQL fixture through migration `026_apple_auth`
- Scenario: sign in, return to sparse Today, open conversation-first Ask,
  search canonical People/contexts, inspect or correct exact evidence, recover
  interrupted review work, open existing Pursuit work, use Capture, and sign out.

## Delivered experience

Today gives the eye one resting point, compact continuations, and no feed or
inline global search. Ask is the default conversational surface. Prompt controls
and Capture stay in the composer; canonical workspace search appears only when
requested.

The canonical answer distinguishes confirmed state, exact evidence, and
existing work. An active action is structured into owner, recruiter-local due
state, waiting item, close condition, and effect boundary. Its `Open Pursuit`
control is bound to the exact Pursuit/action and creates no new work.

Citation detail is bound to live task-and-citation authority. A dispute clears
detail before network I/O, stales the old answer, and now records a protected,
account-scoped operation before sending. Pending, failed, outcome-unknown, and
applied states remain visible in the parent Session; safe retry uses the exact
same idempotency key. Re-reviewing corrected evidence appends a new reviewed
decision against rejected state. The earlier dispute remains auditable, and
only a fresh Ask may cite the source again. No excerpt is stored in recovery.

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

## V6 panel findings addressed

- Source correction now has durable success, failure, and outcome-unknown state;
  a same-intent retry and append-only re-review remain available after relaunch.
- Existing work has an exact, read-only Ask-to-Pursuit handoff instead of a dead
  summary block.
- The V5 detached-citation veto remains closed: rejection or authority loss
  immediately stales the turn, hides citations, and closes exact detail.

## Proof and limit

Fresh isolated fixture results pass 6/6 selected UI journeys: one canonical
database-backed citation journey and five non-canonical hierarchy, AX5, login,
and Capture journeys. iOS unit tests pass 91/91; backend tests pass 129/129;
`pnpm check`, documentation, whitespace, migration readiness, and an unsigned
generic iOS Release build pass.

One pre-freeze diagnostic reused an account whose canonical source had already
been disputed by the same destructive journey. Five tests passed and the
canonical citation test correctly found no authorized citation. The final proof
uses a new database, where the canonical test passes once. No existing data was
cleared or rewritten to obtain the pass.

This remains a strong local Simulator/loopback gate, not a 99/100 field claim.
Physical assistive technology, microphone/privacy behavior, Apple Account
authorization, production deployment, recruiter/candidate outcomes, and a
frozen kill-and-relaunch UI recording remain missing. The Open Pursuit control
is visible and exact-reference/source proven, but its tap journey is not frozen.

## Panel

Selected independently: `recruiter-workflow-reviewer` for operational value,
`evidence-safety-reviewer` for provenance/privacy/action boundaries,
`mobile-ux-reviewer` for native craft and accessibility, and
`candidate-experience-guardrail` for human impact. Selection science is omitted
because this artifact does not rate, rank, predict, or assess a candidate.
