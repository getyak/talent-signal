# Backend repair proof: P1-2 and P2-2

Scope: only the two backend findings assigned from the independent review
(`independent-code-review.md`): P1-2 (stop racing failure/shutdown
finalization) and P2-2 (reviewed-fragment prefilter vs completion validity
predicate). P1-1 was already repaired in `b4757a40`; the frontend findings and
all delivery decisions remain parent-owned. This document records
reproduction, the repair, and deterministic local proof. It makes no score or
deployment claim.

Method: write focused real-PostgreSQL regressions first, run them against the
frozen baseline to record the failing behavior, apply the smallest complete
repair, then re-run the identical command. All database work used only the
supplied loopback disposable database (`127.0.0.1:55451`, synthetic task data).
No commits, pushes, deployments, native tests, or Docker lifecycle operations
were performed.

## P1-2 — committed stop racing failure/shutdown finalization lost the admitted message

### Baseline behavior (reproduced)

`conversationQueueRunner.ts` `finalizeRetained` handled a missed fenced
`failed`/`interrupted` update (a committed `cancel_requested=true` stop) by
finalizing `cancelled` directly. `cancelled` scrubs `objective` and drops
`result` (`conversationQueueState.ts`), and only
`persistConversationQueueCancellation` writes the admitted message, attachment
manifests, and truthful stopped marker to Session history first. The
`finalizeRetained` fallback bypassed that persistence, so the admitted text and
attachments were permanently lost with an empty history.

The race model in the new tests is the documented lost-publication window: the
stop's durable `cancel_requested` write commits (as the API does on another
process) while this runner's in-process live event never arrives. The lease
heartbeat's cancel recheck is the only backstop for that window, and the
failure/shutdown finalization can reach `finalizeRetained` before it fires.

### Repair

- `conversationQueueRunner.ts` — `finalizeRetained` now takes the owned auth,
  claimed entry identity, and any partial visible text. When its fenced
  failure write misses and the row is still `running` (a committed stop won the
  race), it settles through the governed cancellation persistence
  (`persistConversationQueueCancellation`): exact admitted text + ordered
  attachment manifests + truthful stopped marker ("已停止"/"Stopped", `status:
  "failed"`) reach Session history before the terminal `cancelled` finalize
  scrubs the queue row. If auth/identity is unavailable (pre-auth shutdown
  claim, `OWNER_UNAVAILABLE`), if persistence fails, or if revocation, expiry,
  stale leases, or a vanished stop flag refuse the write, the fenced row is
  retained for lease recovery — never scrubbed and never claimed saved.
  Ownership and revocation remain enforced by the governed path's owned-claim
  and context-validity assertions.
- `conversationQueueCompletion.ts` — the persistence contract comment now
  states the widened governed usage (a stop that raced failure/shutdown
  finalization) and the caller obligation to retain the fenced row when
  persistence is refused. No persistence semantics changed.

### Regression tests (`conversationQueue.integration.test.ts`)

1. `persists the admitted turn and a truthful stopped marker when a model
   failure races a committed stop` — provider failure (`MODEL_RUN_FAILED`
   fallback path) racing a committed stop; asserts Session history carries the
   exact text, the image manifest (`attachment_id`), and the truthful stopped
   marker before the row reads `cancelled`/`scrubbed`.
2. `persists the admitted turn and a truthful stopped marker when shutdown
   races a committed stop` — `close()` (`RUNNER_SHUTDOWN`) racing a committed
   stop; same destination-readback assertion as the existing stopped-restart
   proof.
3. `retains a recoverable fenced row when a raced stop cannot save its history,
   then settles it intact` — history persistence is injected to fail during the
   raced-stop settlement: the row must stay `running`/`retained` with
   `cancel_requested=true` and the objective intact, Session history empty
   (never scrub, never claim saved), and a later lease recovery settles it with
   the message intact.
4. `keeps an ordinary failure retained without a stopped marker and retries the
   exact message` — negative control: without a stop nothing is scrubbed, no
   stopped marker is fabricated, the row stays `failed`/`retained` with
   `MODEL_RUN_FAILED`, and an explicit retry runs the model again and only then
   persists the exact admitted text.

The suite's existing proofs remain green and unchanged: stopped restart
settlement with image manifests, recovered-stop history-save failure retention
and idempotent retry, shutdown interruption without a stopped answer, and the
stop-wins discard of a late completed result.

### Before/after (same command, see verification section)

- Before: `Tests 7 failed | 62 passed (69)`. Failures 1–3 were exactly these
  P1-2 regressions: `expected [] to deeply equal [ ObjectContaining{…} ]`
  (admitted turn lost, history empty) twice, and a timeout waiting for the
  history-persistence attempt (the baseline fallback scrubbed without ever
  attempting persistence).
- After: `Tests 69 passed (69)` on two consecutive runs.

## P2-2 — reviewed-fragment prefilter was a strict subset of the completion guard

### Baseline behavior (reproduced) and one correction

`chat.ts` prefiltered manifest evidence with
`status='active' AND review_status='reviewed' AND attribution_status='confirmed'`
only, while the final locked guard `agent_session_task_available`
(`051_agent_sessions.sql:53-67`, replaced by the canonicalized definition in
`054_agent_session_identifier_canonicalization.sql` — the only later override;
no other migration touches it) additionally requires non-empty trimmed
`text_content`, capture subject/assignment equal to the manifest scope, resource
and capture not deleted, and a present, non-deleted, `authorized`,
unexpired retention receipt. The divergent triggers reproduce as reviewed
evidence reaching provider work and then failing with a false
`CHAT_COMPLETION_SOURCE_CHANGED`:

- deleted source resource → `409 CHAT_COMPLETION_SOURCE_CHANGED` after provider
  work (reproduced),
- empty/whitespace reviewed text → same (reproduced),
- capture bound to a different person/context scope → same (reproduced).

Correction to the review's claimed primary trigger: a retention receipt whose
`authorization_expires_at` has elapsed does **not** reach provider work on this
path. `loadSnapshot` (wiki.ts) already rejects the whole Wiki snapshot early
with the truthful `409 WIKI_SOURCE_AUTHORIZATION_STALE` before the prefilter
runs. That outcome is decided before provider work and exposes no unauthorized
content, so it satisfies the admitted proof shape ("excluded before provider
work or fails early truthfully"); the regression pins it.

### Repair

`chat.ts` — the pre-provider manifest filter now admits a fragment only when it
satisfies the exact evidence clause of `agent_session_task_available`
(status/review/attribution, non-empty trimmed text, capture scope match,
resource not deleted, capture active, receipt present and not deleted,
`authorized`, unexpired). A Wiki block that depends on any excluded fragment is
dropped before provider work, matching the established proposed-evidence
behavior: the unauthorized fragment id and its text never reach the model, and
the manifest records only admitted evidence. The final locked guard
(`lockChatCompletionSources` → `agent_session_task_available` +
`agent_session_chat_sources_available` + media/session checks) is unchanged and
still revalidates any change during execution; the completion validity
predicate was not weakened.

### Regression tests (`feedback.integration.test.ts`)

- Positive control `admits currently authorized evidence to provider work as
  the positive control`: valid evidence reaches the model
  (`allowed_citation_ids` contains the fragment, its text is present) and is
  recorded in `context_manifest_evidence`.
- `fails early and truthfully when the source-authorization deadline elapsed
  before provider work`: `409 WIKI_SOURCE_AUTHORIZATION_STALE`, provider call
  count unchanged, response body carries no source text.
- `excludes evidence with %s before provider work instead of a false
  source-change error` for each proven divergence trigger (deleted source
  resource, empty reviewed text, capture bound to a different scope): `201`,
  exactly one provider call, the fragment id and text absent from the model
  input, and an empty manifest evidence set.

### Before/after (same command)

- Before: the three exclusion cases failed with `409
  CHAT_COMPLETION_SOURCE_CHANGED` after provider work (`expected 409 to be
  201`); the expired-deadline case failed the exclusion expectation with `409
  WIKI_SOURCE_AUTHORIZATION_STALE` before it was re-pinned to its truthful
  early failure.
- After: all cases green on two consecutive runs.

## Exact verification performed

1. Setup: `pnpm install --offline --frozen-lockfile --ignore-scripts` — done,
   already up to date. Workspace type dependencies were built by the allowed
   `pnpm --filter @talent-signal/backend typecheck` step.
2. Connectivity: a single `pg` probe from `apps/backend` against only the
   supplied synthetic URL `postgresql://experience98:synthetic-local-only@127.0.0.1:55451/experience98`
   — reachable (`accounts: 2`, synthetic).
3. `pnpm --filter @talent-signal/backend typecheck` — exit 0 (before and after
   the repair).
4. `env CONTACT_AGENT_TEST_DATABASE_URL=postgresql://experience98:synthetic-local-only@127.0.0.1:55451/experience98 FEEDBACK_TEST_DATABASE_URL=postgresql://experience98:synthetic-local-only@127.0.0.1:55451/experience98 pnpm --filter @talent-signal/backend test src/modules/conversationQueue.integration.test.ts src/modules/feedback.integration.test.ts`
   - before repair: `Tests 7 failed | 62 passed (69)` (failures listed above),
   - after repair: `Tests 69 passed (69)`, twice consecutively (10–11 s each).
5. `git diff --check` — exit 0.

## Changed behavior (exact)

- A stop that commits while the run is already failing or shutting down now
  lands Session history with the exact admitted message text, the ordered
  attachment manifest, and a truthful stopped marker before the queue row is
  scrubbed to `cancelled` — the same destination the restart-recovery path
  already guaranteed. Partial visible text already streamed is preserved under
  the stopped marker, exactly as on an ordinary stop.
- When that history write is refused or fails (missing owner/auth, revoked or
  expired context, stale lease, session busy, persistence error), the queue row
  stays retained and fenced for lease recovery instead of being scrubbed or
  reported saved.
- Relationship chat admits only evidence that currently passes the completion
  guard's validity predicate to provider work; blocks depending on deleted,
  empty, or out-of-scope evidence are excluded instead of causing a post-model
  `CHAT_COMPLETION_SOURCE_CHANGED`. An expired source-authorization deadline
  continues to fail early and truthfully with
  `WIKI_SOURCE_AUTHORIZATION_STALE`.

## Remaining uncertainties and open items

- The `OWNER_UNAVAILABLE` and pre-auth-shutdown raced-stop retention branch is
  covered by code reading only (the window is not deterministically hookable in
  the suite); its behavior is the same retain-for-recovery branch proven by the
  history-save-failure regression.
- `replayPersistence`'s stop race after a fully persisted completed turn keeps
  the intentional stop-wins terminal `cancelled` state (unchanged, out of this
  scope; the completed turn is already in history).
- Whether ordinary intake can produce whitespace-only reviewed fragments
  remains a hypothesis; the edge is covered defensively by the aligned
  predicate.
- Deployment gate (parent-owned, not performed here): required backend
  deployment stays deferred until internal-disk free space is at least 80 GiB
  and the independent review passes. Nothing was deployed or released from
  this work.

## Parent integration follow-up

The parent independently reran the two focused PostgreSQL suites after applying this patch: 69/69 passed. Parent review then removed the raw exception from the new raced-stop warning and extended the injected persistence-failure test to assert its complete metadata contains only queue ID and a fixed failure classification. This follow-up does not claim a repository-wide logging audit.
