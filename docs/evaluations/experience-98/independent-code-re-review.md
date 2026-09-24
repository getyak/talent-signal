# Independent re-review

These are the reviewer's appended sections, extracted by the parent; only the
historical-report cross-reference was adapted for this standalone file.

## Re-review at integrated head `7a99f873` — 2026-09-24

Re-review date: 2026-09-24 (head timestamp 2026-09-24T20:44:30+08:00).
Reviewed head: `7a99f873515ee7cf19ae96a7a732da8c29656bce` ("Preserve stopped
admissions and align pre-provider evidence validity"), read exclusively via
`git show 7a99f873:path` and `git diff <sha>` because this checkout remains at
the frozen `01cb7aa8` review baseline. The historical review is retained separately in
[independent-code-review.md](independent-code-review.md) (report blob
`3cdb80ac…`, identical at this head); its line numbers refer to `01cb7aa8`.

Evidence read: `review-resolution.md`, `review-backend-repair.md`, the diffs of
`b4757a40`, `54f59ff4`, `53b708e3`, `7a99f873`, and the cited regression tests.
This reviewer executed no tests: all "passed" statements below are parent-run
results read from the evidence documents, distinguished from static findings.

### Closure verdicts, original findings

**P1-1 (4xx classified safe vs post-commit upstream failure) — closed at code
level (static).** `apps/web/app/api/local-integration/resources/route.ts:587-631`
now wraps every commit to count acknowledged writes: a `TalentSignalHttpError`
passes through as a definitive rejection only with `acknowledgedWrites === 0`
(pre-write and transactionally rolled back per `lib/idempotency.ts` claim
semantics); any failure after a write attempt — raw `TypeError`/`SyntaxError`
from the upstream hop, or a later document-link rejection after an
acknowledged parent — returns `503 resource_intake_outcome_unknown`
("内容可能已保存…重试核实"), and only never-attempted validation failures keep
the correctable 422 `resource_intake_failed`. The card already maps 5xx to
`unknown` and keeps the frozen replay (`agent-create-person-card.tsx:706-709`),
so the corrected-retry duplicate path is closed. Route regressions pin no raw
upstream metadata and no "未保存" claim in the uncertain response
(`route.test.ts`, parent-run: 2 failing before, 42 route/card checks after).
No residual classification hole found. Observation only (pre-existing,
unreachable from the card): a malformed client request body still surfaces the
parser message via the 422 branch (`route.ts:624-631`).

**P1-2 (stop racing failure/shutdown finalization) — closed at code level
(static).** `apps/backend/src/modules/conversationQueueRunner.ts:648-697`
(`finalizeRetained`) now settles a committed stop through the governed
`persistConversationQueueCancellation` (`:675`) — exact admitted text, ordered
attachment manifests and the truthful stopped marker reach Session history
before the terminal `cancelled` finalize scrubs the row. When auth/identity is
unavailable (`if (!stop) return`, `:670`, retain-for-recovery), or persistence
is refused or fails, the fenced row is retained and never claimed saved; the
new warning (`:686-689`) carries only `queue_entry_id` and the fixed
`failure_code: "CANCELLATION_PERSISTENCE_FAILED"` — the parent's raw-exception
removal is present in this head and pinned by the exact-shape
`cancellationWarnings).toEqual([...])` assertion
(`conversationQueue.integration.test.ts:1713-1717`). All terminal call sites
pass the stop context with partial text (`:567, :572, :594, :596`). The three
raced-stop regressions plus the negative control exist
(`:1579, :1621, :1665, :1741`); parent-run: 69 PostgreSQL checks twice, then
69 again after integration, and 1 injected-persistence-failure regression with
the full metadata assertion. Residual: the pre-auth `OWNER_UNAVAILABLE` branch
is code-read only (acknowledged in the repair doc) and behaves as the proven
retain branch. Verdict: closed.

**P2-1 (impossible single-owner deferred review) — partially closed; one
concrete unresolved edge (P2).** Repaired in `54f59ff4`: `reviewReady` now
requires `matches.length >= 2`
(`apps/web/components/relationship-workspace/agent-create-person-card.tsx:509`)
and the one-owner copy no longer promises "保留为未解决" (`:1563-1566`); the
regression asserts the withheld button and zero resource POSTs
(`agent-create-person-card.test.ts` "does not offer an impossible deferred
review for one confirmed owner"). Unresolved edge — the same contract mismatch
on the upper bound: `frozenDeferRequest` sends every merged match with no cap
(`:639` `candidate_person_ids: matches.map(...)`), while intake rejects more
than 20 candidates (`apps/web/app/api/local-integration/resources/route.ts:145-146`,
misleading message `:154` surfaced verbatim by the defer rejection handler).
Directory search returns up to 20 per query
(`apps/backend/src/modules/people.ts:174,273`) and the card merges name and
clue queries, so 21–40 matches are reachable. Trigger: ≥21 distinct merged
matches → "保存待身份审阅" is offered (`reviewReady` only lower-bounds) →
deterministic 422 `At least two possible people…` on a Chinese surface.
Impact: the promised unresolved-save action is impossible for large match sets
and an untranslated internal error is shown. Minimal proof: component test with
20+1 mocked search matches → click 保存待身份审阅 → today exactly one POST
answering 422; expected: action withheld or candidates capped per contract.
Severity P2 (edge-dependent, same class as the original P2-1).

**P2-2 (admission filter vs completion validity predicate) — closed at code
level (static); original expiry trigger corrected.** `chat.ts:958-977` now
mirrors the evidence clause of `agent_session_task_available`
canonicalized at `apps/backend/src/database/054_agent_session_identifier_canonicalization.sql:22-28`
clause-for-clause (status/review/attribution, non-empty trimmed text, capture
subject/assignment equality against the manifest scope, resource/capture not
deleted, receipt present/not deleted/`authorized`,
`authorization_expires_at<=statement_timestamp()` — identical to the canonical
guard, so no residual predicate divergence). Blocks depending on excluded
evidence drop before provider work; the final locked guard is unchanged. The
parent's correction of my original trigger is independently verified:
`loadSnapshot` already rejects revoked/expired authorization early with
`409 WIKI_SOURCE_AUTHORIZATION_STALE` (`apps/backend/src/modules/wiki.ts:523-534`)
before the prefilter, so my original "expiry reaches provider work" claim was
inaccurate and is withdrawn. The reproduced real divergences (deleted resource,
empty reviewed text, capture bound to a different scope) are pinned with
fragment-id/text absence from model input and empty manifest evidence
(`feedback.integration.test.ts:224-263`, positive control + early-failure pin
+ `it.each` exclusions; parent-run on the disposable database). Residual:
whether ordinary intake can produce whitespace-only reviewed fragments remains
a hypothesis, defensively covered. Verdict: closed.

**P2-3 (history traversal) — continuation race closed at code level; the
product gap is correctly left open.** `54f59ff4` adds a capture-phase
`popstate` guard (`agent-create-person-card.tsx:401-415`, listener `:455-458`)
that seals and revokes admission as soon as pathname+search changes, before
delayed unmount, so no dependent write (source→clue continuation) and no host
callback can fire after traversal; the regression drives history traversal
with an in-flight source request and asserts exactly one POST and no callback
(fails with two writes before repair per `review-resolution.md`). Persistent
footer copy (`:1659`) states that reload/close/browser-back lose the in-page
reconciliation entry point and never undo submitted content. Assessment of the
distinction requested: correct and honestly scoped — a cancelable Back prompt
is a platform limitation (history traversal cannot be intercepted), the repair
claims neither a prompt nor durable recovery, and durable recovery of unknown
outcomes remains an explicitly OPEN product gap that copy does not close.
Minor residual nit (no write risk): `historyGuard` compares `pathname+search`
strings, so a query-parameter reorder counts as navigation and seals
conservatively. Verdict: code race closed; remaining item is product/design
work, not a code defect.

### Bounded new-area regression inspection (`54f59ff4`, `53b708e3`, `7a99f873`)

- **Search destination:** `workspace-search.tsx:347` now targets
  `/workspace/people/<id>`; that route exists at this head
  (`apps/web/app/workspace/people/[id]/page.tsx`). No regression found.
- **Queued native-dialog close/reopen:** `workspace-search.tsx:282` ignores a
  queued `close` when `dialog.current?.open` (already reopened), keeping the
  query and authorized directory; a genuine close still proceeds (dialog is
closed when the handler runs). The continuity test pins query+result retention
  across the stale close (`workspace-directory-continuity.test.ts`). No
  regression found.
- **Shared-renderedAt hydration:** `session-directory.tsx:40,50,61-64` seeds
  `now` from the server `renderedAt` and refreshes only after mount;
  `formatSessionTime(value, now)` (`session-workbench/session-view.ts:137-158`)
  honors the shared clock with a backward-compatible default; the hydration
test renders at 10:59:59.9 and hydrates at 11:00:00.1 asserting no recoverable
  error and a stable label. No regression introduced. Observation (not
  introduced by these commits, not rated): `session-workbench.tsx:768,912`
  still call `formatSessionTime` with the default client clock on a
  server-rendered page (`app/workspace/sessions/[id]/page.tsx`), where the same
  relative-time hydration mismatch class can recur at minute/hour boundaries.
- **Sidebar focus inset:** `workspace-shell.module.css`
  `.navLink:focus-visible { outline-offset: -2px }` in `7a99f873` is CSS-only,
  no logic touched; visual acceptance is pending as stated and was not
  performed here (no browser per scope).

### Overall statement

Within the reviewed scope — the five original findings plus the bounded search
destination, queued-dialog close/reopen, shared-renderedAt hydration and
sidebar CSS changes — **no new P0/P1 defects are confirmed**. Remaining items:
one P2-class unresolved edge (P2-1 upper bound, above), one unrated observation
(workbench relative-time call sites), and the explicitly open durable-recovery
product gap behind P2-3. This is static confidence only; the parent-run suites
(69 PostgreSQL checks after integration, the injected persistence-failure
regression, focused Web checks, typecheck/lint/docs) were not re-executed by
this reviewer. Known delivery gaps (resident deployment, live Memory
acceptance, native/assistive coverage, overall 98 score) remain parent-stated
and are not re-listed as code defects.

---

## Final closure: P2-1 upper bound at `49b16a8c` — 2026-09-24

Reviewed head: `49b16a8c6ee1ee89c73e99dca621e6de143edf25`. Scope per parent:
`git diff 7a99f873..49b16a8c` limited to
`agent-create-person-card.tsx` / `agent-create-person-card.test.ts`; source
context from `git show 49b16a8c:path` only as needed. No other area was
re-scanned. Static review; this reviewer executed no tests (parent-run: card
suite 35/35, Web TypeScript and changed-file ESLint passed; existing act
warnings observed and not claimed warning-free; no browser/production
acceptance claimed for the new copy).

**P2-1 upper-bound edge (21–40 merged name/clue matches) — closed at code
level (static), with both bounds of the original P2-1 now closed.**

- The 2–20 contract bound is enforced at one shared predicate,
  `reviewCandidateCountValid = matches.length >= 2 && matches.length <= 20`
  (`agent-create-person-card.tsx:508`), applied to `reviewReady` (`:511`), and
  `deferIdentityReview` re-checks `reviewReady` before any write (`:1047-1051`),
  so no stale path can submit the impossible request.
- No candidate is silently discarded: `frozenDeferRequest` still submits the
  complete merged candidate set (`:641`, unchanged in this diff). At 2–20 the
  full set is sent (boundary regression asserts exactly 20
  `candidate_person_ids`); at >20 the action is withheld and the `role="status"`
  notice (`:1572-1576`) explains the over-limit state and explicitly states
  candidates are not omitted ("也不会省略候选人物"), directing narrowing or
  verified selection — the remaining paths (select current owner, remove clue)
  stay available.
- Owner copy switches on the same predicate (`:1565`), so "保留为未解决" is
  promised only when the intake contract can accept the request; the one-owner
  copy from `54f59ff4` is preserved.
- Regression coverage (`it.each([20, 21])`): the 20-candidate positive path
  performs one defer POST with exactly 20 candidates and one `deferred` host
  callback through validated receipt binding (the fixture receipt echoes the
  submitted candidate set, so the identity binding check is genuinely
  exercised); the 21-candidate case shows the over-limit status copy, renders
  no button and performs zero resource POSTs. Parent-recorded before/after:
  20 passed, 21 failed before the repair; both pass after.
- No new defect found in this diff. The original P2-1 is therefore fully
  closed at code level at this exact head (one-owner bound at `54f59ff4`,
  over-limit bound at `49b16a8c`). Open items outside code closure are
  unchanged from the sections above (durable recovery product gap behind P2-3,
  the unrated workbench relative-time observation, and parent-stated delivery
gaps).
