# V1 experience correction — V9 frozen artifact

## Review object

- Artifact ID: `TS-V1-EXPERIENCE-2026-08-25-09`
- Type: iOS experience, authenticated canonical Ask loop, atomic evidence review,
  exact-action handoff, Capture boundary, and Apple account-entry boundary
- Version: source commit `5fa53ec` plus final runtime evidence frozen at
  2026-08-25 04:57 CST by the source,
  result-bundle, Docker-image, and screenshot hashes in
  [`runtime-evidence.json`](runtime-evidence.json)
- Target user: an independent recruiter returning to relationship work
- Environment: iPhone 17 Pro Max Simulator, iOS 26.5, macOS 26.4; fresh V9
  Docker image and PostgreSQL through migration
  `027_evidence_review_authority_chain`

## Delivered experience

Today gives the eye one resting point, one compact continuation, and no feed or
inline global search. Ask is the default conversational surface. Compact prompt
controls and Capture remain in the composer; account-scoped People/context
search appears only when requested.

The canonical answer distinguishes confirmed state, exact evidence, and
existing work. Its active action exposes owner, local due state, dependency,
close condition, and effect boundary. `Open Pursuit` now carries both Pursuit
and action identity, opens without recording work, scrolls to the exact action,
and briefly identifies it as `Referenced in Ask`.

Evidence review is an authority chain rather than a status toggle. Each request
names the exact prior review ID. Under locks on the fragment, resource, capture,
and authorization receipt, the server reads the latest monotonic review
revision. A new decision appends a row whose prior-review foreign key and
fragment-scoped revision are database constrained. An idempotent replay succeeds
only if its result is still the latest canonical review. The iOS client validates
fragment, decision, prior review ID, resulting review ID, and canonical time
before presenting the operation as applied.

Protected recovery remains a precondition to network I/O. Live pending review
work shows progress without offering a competing reconciliation request;
restored pending, failed, and outcome-unknown work can reconcile with the saved
key. Re-review appends against the exact resulting review ID, retains the old
audit, and never makes the old Agent answer current.

## Frozen UI evidence

The machine-readable map and hashes are in [`ui/manifest.json`](ui/manifest.json).

| Journey | Evidence |
| --- | --- |
| Sparse Today | [`ui/today.png`](ui/today.png) |
| Conversation-first Ask | [`ui/ask-conversation.png`](ui/ask-conversation.png) |
| Ask at AX5 | [`ui/ask-ax5.png`](ui/ask-ax5.png) |
| Canonical answer and exact existing action | [`ui/ask-backend-response.png`](ui/ask-backend-response.png) |
| Exact citation detail | [`ui/ask-citation-detail.png`](ui/ask-citation-detail.png) |
| Dispute saved and old answer stale | [`ui/ask-citation-stale.png`](ui/ask-citation-stale.png) |
| Exact action focused after Open Pursuit | [`ui/ask-open-pursuit-action.png`](ui/ask-open-pursuit-action.png) |
| Sign in with Apple | [`ui/login-apple.png`](ui/login-apple.png) |
| Purpose-bound Capture | [`ui/capture-chooser.png`](ui/capture-chooser.png) |
| Audio idle boundary | [`ui/audio-idle.png`](ui/audio-idle.png) |

## V8 findings addressed

- The V8 safety veto is closed by an authenticated
  `expected_last_review_id`, canonical `review_id`/`prior_review_id` readback,
  row locks, database-enforced review lineage, current-result-only replay, iOS
  response validation, unit coverage, and a real PostgreSQL adversarial run.
- The V8 exact-action finding is closed by passing `action_id` into the Pursuit
  sheet, scrolling to the target, rendering a visible reference marker, and a
  fresh tap journey that proves the intended action is reached.
- The V8 competing-reconciliation finding is closed in the UI state machine:
  an active request owns its key and exposes progress only; reconciliation is
  available for recovered or uncertain operations.
- Canonical audit time now comes from server `decided_at`, with local time only
  as a fallback for legacy recovery records.

## Proof and limit

Fresh V9 results pass 6/6 selected UI journeys, 96/96 iOS unit tests, and
133/133 backend tests. The authority evaluator proves same-cycle replay,
reject/re-review lineage, rejection of the old operation with
`EVIDENCE_REVIEW_AUTHORITY_STALE`, and preservation of the later reviewed
state. `pnpm check`, documentation/architecture checks, whitespace checks,
migration readiness, and an unsigned generic iOS Release build pass.

This is a strong local Simulator/loopback gate, not a 99/100 field claim.
Physical assistive technology, microphone/privacy behavior, Apple Account
authorization, production deployment, recruiter/candidate outcomes, and a
frozen kill-and-relaunch recovery recording remain missing.

## Panel

Selected independently: `recruiter-workflow-reviewer`,
`evidence-safety-reviewer`, `mobile-ux-reviewer`, and
`candidate-experience-guardrail`. Selection science is omitted because this
artifact does not rate, rank, predict, or assess a candidate.
