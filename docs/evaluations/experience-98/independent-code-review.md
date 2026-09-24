# Independent code review: assembled experience fixes

Reviewer: independent delegated review (static, bounded). This report is the
only artifact owned by the reviewer; no production code was changed.

- Reviewed head: `01cb7aa813b2a847f5f4c2aa2ee8ae9c9e2d040e`
  ("Keep contact creation recoverable when save receipts are lost").
- Compared against frozen baseline `159c640286c14fa3c1d0244db3f318bf9b30422c`.
- GET-49 changes are excluded except at integration boundaries
  (`prioritize`/`cancel_auto_continue` interaction with stop finalization and
  post-commit stop publication).
- Method: static reading of the changed code against the actual API and DB
  contracts (`packages/contracts/src/client.ts`, `apps/web/lib/server/localBackend.ts`,
  `apps/backend/src/modules/resourceIntake.ts`, `apps/backend/src/lib/idempotency.ts`,
  `apps/backend/src/database/051_agent_sessions.sql`, queue SQL/functions),
  cross-checked with the existing test suites to avoid re-reporting behavior
  that is deliberately asserted.
- Acknowledged gaps excluded by scope: resident deployment is old, and the live
  Memory `MODEL_RUN_FAILED` state is a known unresolved deployment issue. They
  are not reported as code defects here.

Findings below state whether the defect is proven from code/contract reading
("proven") or depends on unverified runtime behavior ("hypothesis"). No finding
is ranked by test counts; no pass or score claim is made.

## Findings

### P1-1 — First-attempt 4xx is treated as proof of non-commit, but the intake route maps post-commit transport/parse failures to 422; a corrected retry then duplicates the Person (EXP-11 class)

Locations (exact):

- `apps/web/components/relationship-workspace/agent-create-person-card.tsx:691-709`
  (`dispatchFrozen`: any first-attempt 4xx except 401/403/408 returns
  `{ outcome: "rejected" }` with the comment "the server did not commit: safe
  to correct").
- `apps/web/app/api/local-integration/resources/route.ts:598-613` (POST catch-all:
  every non-`TalentSignalHttpError` becomes **422 `resource_intake_failed`**).
- `packages/contracts/src/client.ts:1393` (`await response.json()` is unguarded;
  a truncated/invalid 2xx body throws a plain `SyntaxError`, and a dropped
  connection throws `TypeError: fetch failed`).
- `apps/backend/src/modules/resourceIntake.ts:766-810` +
  `apps/backend/src/lib/idempotency.ts:18-103`: the capture, person/context
  binding, and the idempotency record commit in one transaction keyed
  `web-resource:<request_id>` — so the write can be durable while the caller
  sees a non-`TalentSignalHttpError` exception.
- Unlock-on-rejection: `agent-create-person-card.tsx:270-275` (`resetDraftRequests`)
  mints a new `request_id` + `captured_at` on the next edit; the correction path
  is the one asserted by `agent-create-person-card.test.ts:378` and exercised
  with 422 fixtures (`agent-create-person-card.test.ts:323,386,435`, comment at
  645 assumes 422 always means "a real 4xx answer" = not saved).

Proven mechanism (the classification invariant is false at the route contract):

1. Submit Create. The backend commits the capture (person + note + idempotency
   record in one transaction).
2. The Next route ↔ backend hop fails after commit, or the 201 body is
   unparseable (`client.ts:1393` throws a non-`TalentSignalHttpError`). The
   route catch-all converts this into **422 `resource_intake_failed`**.
3. `dispatchFrozen` classifies the 422 as definitive rejection, clears the
   tracked request, unlocks edits, and shows a definite-unsaved message (for
   the clue flow `CLUE_REJECTED_MESSAGE` at line 848 literally claims the clue
   "未保存").
4. The user corrects any field (identity reset at `agent-create-person-card.tsx:270`)
   and resubmits: a new `request_id` means a new idempotency key
   (`web-resource:<new id>`, `localBackend.ts:502`), so `createResourceCapture`
   creates a **second Person with a distinct ID** and a second note/clue — the
   exact EXP-11 duplicate this recovery work was required to eliminate.

Impact: identity duplication and false "not saved" claims; the frozen-receipt
recovery protects only exact replays, which this path bypasses. The same
catch-all also misreports `commitFile`'s partial persistence
(`route.ts:455-520`: parent capture committed, then child link commits; a child
failure returns 422 while the parent is durable) as a definitive rejection.

Minimal test: route-level regression — stub `commitRelationshipResource` to
perform a real commit and then throw `TypeError: fetch failed` (same failure
injection family as `evidence/create-lost-response-duplicate.json`); assert the
outcome is NOT presented as a correctable rejection (e.g. a distinct uncertain
code/status that `dispatchFrozen` maps to `unknown`, while validation failures
keep their current code), and a card-level test asserting that outcome keeps the
frozen request replayable instead of unlocking edits with a new request
identity. Optionally assert `commitFile` parent-plus-links failure keeps the
replay idempotent and reports partial state truthfully.

### P1-2 — A committed stop racing failure/shutdown finalization scrubs the admitted message without persisting it to Session history

Locations (exact):

- `apps/backend/src/modules/conversationQueueRunner.ts:648-663`
  (`finalizeRetained`: when the fenced `failed`/`interrupted` finalize misses
  because `cancel_requested=true`, the fallback calls
  `finalizeConversationQueueEntry(..., "cancelled")` directly).
- `apps/backend/src/modules/conversationQueueState.ts:464-466` — `cancelled`
  scrubs `objective=NULL` and drops `result`.
- The only code that persists the admitted message + stop marker before
  scrubbing is `persistConversationQueueCancellation`
  (`apps/backend/src/modules/conversationQueueCompletion.ts:237-291`), used by
  `finalizeCancelled` (`conversationQueueRunner.ts:612-644`) and by restart
  recovery (`conversationQueueRunner.ts:237-255`) — but not by
  `finalizeRetained`'s stop fallback.

Proven mechanism:

1. A stop commits (`cancel_requested=true`, `conversationQueueAdmission.ts:274-288`)
   in the window where the run is already taking a non-cancel terminal path:
   the provider fallback (`conversationQueueRunner.ts:571-573`,
   `MODEL_RUN_FAILED` — a live state in the current environment), a failure in
   the catch path (`:592-596`), or runner shutdown/owner-unavailable
   (`:330-334`, `:567`).
2. `finalizeRetained`'s first fenced update requires `cancel_requested=false`
   (`conversationQueueState.ts:347-352`) and misses; the fallback finalizes
   `cancelled` with the allow-cancel predicate and **scrubs `objective`**.
3. The user's admitted message text and attachment references are never written
   to Session history and the queue row is scrubbed: the content is permanently
   lost with no transcript record.

This contradicts the accepted F1 repair criterion ("the stop marker, exact user
message and attachment references persist before queue scrubbing") and the
guarantee asserted for the recovery path in
`conversationQueue.integration.test.ts:1206` ("settles a stop that survived a
crashed worker…"), which holds only for `finalizeCancelled`/recovery.

Impact: unrecoverable loss of the user's admitted message and attachments with
an empty history and no audit trace; the queue silently drops the message.

Minimal test: extend the real-PostgreSQL queue suite: own a running entry,
commit a stop while driving the shutdown or provider-failure finalize path (a
scripted provider that resolves `fallback`, or `close()` racing a committed
stop), then assert the admitted turn (exact text + image manifest + truthful
stop marker) exists in Session history before the row is `cancelled`/scrubbed —
the same destination-readback assertion used at
`conversationQueue.integration.test.ts:1244-1250`.

### P2-1 — The single-owner identity state promises "keep this source unresolved", but the defer request is contract-impossible with one candidate

Locations (exact):

- `apps/web/components/relationship-workspace/agent-create-person-card.tsx:1549`
  (current-owner note: "请选择当前人物、移除线索，或将此来源保留为未解决。")
- `agent-create-person-card.tsx:494-497` (`reviewReady` is true with exactly one
  match carrying a confirmed handle) and `:1654-1662` (the "保存待身份审阅"
  button is rendered in that state).
- `agent-create-person-card.tsx:617-630` (`frozenDeferRequest` sends
  `candidate_person_ids: matches.map((person) => person.id)` with no count
  check) → `apps/web/app/api/local-integration/resources/route.ts:140-155`
  (`identity_candidates` requires 2–20 candidate IDs and otherwise throws
  "At least two possible people…").
- The thrown English internal message is surfaced verbatim via
  `agent-create-person-card.tsx:876` (`setError(result.message ?? …)`).

Proven trigger: the clue (or name) search returns exactly one match that holds
the current confirmed handle — for example a name with no match plus a clue
matching one owner. `canCreateDistinctPerson` is false, the confirm-clue
checkbox is blocked ("请先选择身份"), so the only non-binding forward action the
UI offers is defer — and it is guaranteed to fail with the raw English
`resource_intake_failed` message.

Impact: a promised no-action outcome is not expressible at the API contract; the
user must bind identity against guidance or abandon the draft, and sees an
untranslated internal error on a Chinese surface.

Minimal test: component test with one confirmed-handle match → click
"保存待身份审阅" → assert either the action is withheld/redirected with copy
consistent with the API contract, or (if single-candidate unresolved intake is
intended) the API accepts one candidate; today the request must fail with
`At least two possible people…`.

### P2-2 — The reviewed-manifest filter is a strict subset of the completion guard's validity predicate; the EXP-13 "fictitious source change" can still fire after provider work

Locations (exact):

- `apps/backend/src/modules/chat.ts:943-957` — the new all-manifest filter keeps
  fragments with `status='active' AND review_status='reviewed' AND
  attribution_status='confirmed'` only.
- `apps/backend/src/modules/chat.ts:1386-1388` — final guard
  `lockChatCompletionSources` → `agent_session_task_available`
  (`apps/backend/src/database/051_agent_sessions.sql:53-67`) additionally
  requires non-empty `f.text_content`, `c.subject_id`/`c.assignment_id` equal to
  the manifest subject/assignment, capture and resource not deleted, and a
  `source_retention_receipts` row that is present, `authorization_state='authorized'`
  and `authorization_expires_at > now()`.

Proven divergence: a fragment can pass the pre-provider filter and still fail
the post-provider guard, so `createChatTask` runs the model and then throws
`CHAT_COMPLETION_SOURCE_CHANGED` ("The source changed…") with no change at all.
Concrete trigger supported by the contract: a capture whose retention receipt
carries a source-authorization deadline that has elapsed
(`resourceIntake.ts:840-912` accepts `resource.authorization_expires_at`;
`agentHistory.ts:794-797` classifies this as an "expired" state, not a change).
A whitespace-only `text_content` on a reviewed fragment is a second trigger;
whether ordinary intake can produce one is a hypothesis.

Impact: the EXP-13 failure shape persists for deadline/edge states: provider
cost is spent and the user is told the source changed when it did not. Evidence
exposure remains correct (the guard holds and unconfirmed material is not
promoted), so this is P2, not P1.

Minimal test: build a reviewed/attributed/active fragment whose receipt has
`authorization_expires_at` in the past (or empty `text_content`) behind a gold
Wiki block and call `createChatTask`; assert the outcome is decided before
provider work (filtered manifest or an early truthful error), not a
post-provider `CHAT_COMPLETION_SOURCE_CHANGED`.

### P2-3 — Pending/unknown requests exit via history traversal with no warning, breaking the form's own warn-before-loss promise

Locations (exact):

- `agent-create-person-card.tsx:351-362` (`beforeunload` covers reload/close),
  `:392-451` (link-click guard covers anchor navigation, including the accept
  path that revokes admission).
- No guard exists for `popstate`/history traversal (browser/trackpad Back,
  `history.back()`), which unmounts the card without either warning.

Proven gap (absence of coverage in code and tests —
`agent-create-person-card.test.ts:1306-1367` covers link clicks, skip links and
close, not history traversal): with a request pending or unknown, Back silently
discards the in-memory recovery entry point ("重试核实") and the warning copy
that link navigation and close both get. Continuation POSTs are still blocked by
the dead admission (that part is correct), and no rollback is implied — but the
user is not told to reconcile, which the unknown-outcome contract
(`UNKNOWN_NAVIGATE_WARNING`, `:75`) promises for leaving.

Impact: an unknown write can leave the user's awareness with no notice; the
documented "warns before a reload/close loses it" guarantee is incomplete.

Minimal test: with `trackedRequest.phase === "unknown"`, dispatch
`history.back()`/popstate; assert a warning is offered (or the limitation is
truthfully stated in persistent copy and the durable-recovery plan records it),
and that accepting it revokes admission exactly like the link path.

## Areas reviewed with no new confirmed defect

- Stable request time/ID and frozen-payload replay: `ensureRequestIdentity`
  keeps `request_id`/`captured_at` together across same-intent retries and resets
  them together on intent change; unknown outcomes lock edits and only exact
  replay is admitted (`agent-create-person-card.tsx:205-215,558-630,650-745`).
  The exact-replay contract is sound against `idempotency_records`
  (`claimIdempotency` rolls back with failed transactions and replays identical
  payloads). No defect beyond P1-1's classification hole.
- Receipt/identity binding: `validatedReceipts`
  (`agent-create-person-card.tsx:106-198`) binds every accepted receipt to the
  frozen request (`client_resource_id`), body scope, and candidate set; partial
  success freezes the committed person/scope/labels before the clue attempt.
  Sealing precedes host callbacks. No new defect.
- Pending navigation / unmount / account expiry inside the covered exit classes:
  accepted link navigation revokes admission before unmount; late continuations
  stop before any POST or callback; session expiry and missing workspace scope
  fail closed; replayed 4xx keeps uncertainty. Stale continuation after accepted
  exit is correctly blocked (tests at
  `agent-create-person-card.test.ts:1079-1266`). Only the P2-3 gap above.
- Source conflict refresh/selection ownership (`contact-agent-workspace.tsx`):
  `CONTACT_TASK_REVISION_CHANGED` triggers refresh-only with no mutation replay,
  stale deletion consent is dropped, name edits survive, failed refresh leaves a
  read-only retry, and `AdmissionGuard`/`SelectionGate` plus the poll epoch stop
  old task responses and polling from overwriting a newer selection or mutation
  result (`:750-790,860-925,1231-1330`). No new defect.
- Conversation queue post-commit stop publication: the stop/prioritize live-run
  event publishes only after the transaction commits and never on replay
  (`conversationQueueAdmission.ts:248-261`); a lost event is bounded by the
  lease heartbeat's `cancel_requested` recheck
  (`conversationQueueRunner.ts:460-470`). Restart recovery settles a surviving
  stop through the governed cancellation path with fenced writes and
  message-id-idempotent history persistence
  (`conversationQueueState.ts:543-582`, `conversationQueueCompletion.ts:293-330`).
  The stop-wins discard of a late completed result is intentional and asserted
  (`conversationQueue.integration.test.ts:844-893`); it is not reported here.
  GET-49 `prioritize`/`cancel_auto_continue` at the finalize boundary is
  consistent (a plain stop clears the flag; only prioritize auto-continues).
- Node diagnostic-report setup: `Object.assign(process.report, …)` in
  `apps/backend/src/server.ts:9-15` and `apps/agent-host/src/cli.ts:250-253`
  targets `excludeNetwork`/`excludeEnv`; a read-only descriptor probe on the
  review host (Node 22.23.2) confirms both are setter-backed accessors, so the
  assignment takes effect and cannot crash startup. Both service entry points
  are covered before task admission. Static verdict only — no runtime latency
  measurement was performed (per scope).
- Authorization scope in the reviewed paths: resource intake is account/user
  scoped and origin-checked before commit; chat completion locks and revalidates
  source authorization (`chatCompletionSources.ts`); queue persistence asserts
  owned claims and Session validity/ownership before every turn write. No new
  authorization bypass confirmed.

## Not tested / not claimed

- Static review only: no builds, no test execution, no services, no browser,
  no database, no network. The only executed command was `git diff --check`
  (clean) plus a read-only Node property-descriptor probe noted above.
- Backend queue/health suites (52/32), the Web 1,267-pass run and the
  lost-response replay evidence are parent-reported; this review did not
  re-execute them and makes no claim from their counts.
- GET-49 internals beyond the stop/prioritize finalize boundary; native iOS
  surfaces; prompt/model behavior; the resident deployment gap and the live
  Memory `MODEL_RUN_FAILED` issue (acknowledged, out of scope).
- Whether ordinary intake can produce empty-text reviewed fragments (P2-2
  secondary trigger) is a hypothesis; the predicate divergence itself is proven.

## Coverage table

| Focus area | Primary artifacts read | Verdict |
| --- | --- | --- |
| AgentCreatePersonCard unknown/partial saves, stable request time/id | `agent-create-person-card.tsx`, its 1,473-line test, `localBackend.ts`, `resources/route.ts` | P1-1; rest sound |
| Receipt/identity binding | `agent-create-person-card.tsx:106-198`, `resourceIntake.ts`, `idempotency.ts` | no new defect |
| Pending navigation / unmount / account expiry | `agent-create-person-card.tsx:346-451`, `workspace-session-request.ts`, tests 1079-1367 | P2-3 |
| Source conflict refresh / selection ownership | `contact-agent-workspace.tsx`, `capture-intake.ts`, `contact-agent-workspace-conflict.test.ts` | no new defect |
| Queue post-commit stop + restart recovery | `conversationQueueAdmission/Runner/State/Completion`, `conversationQueue.integration.test.ts` | P1-2 |
| All-relationship reviewed evidence filter | `chat.ts:943-957,1386-1388`, `051_agent_sessions.sql:53-67`, `chatCompletionSources.ts` | P2-2; primary EXP-13 case fixed |
| Node diagnostic-report setup | `backend/src/server.ts`, `agent-host/src/cli.ts`, `diagnostic-report-probe.mjs` | no new defect (static) |
