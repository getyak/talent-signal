# Experience 98 frontend fixes — delegated worker pass

Baseline: `b47180167d3db054fad50a635060eabed1b745b0`. Scope: EXP-01, EXP-03,
EXP-04, EXP-06, EXP-07. No acceptance score is claimed here and no visual
verification was performed; real interactions and screenshots are parent-owned.
The parent's `main#main-content` landmark repair on `QueuedConversation` and
`SessionDirectory` was preserved unchanged. GET-49's uncommitted work in the
original checkout was not touched or copied. A second round applied parent
review fixes: partial-success clue recovery that can never duplicate the
committed person/source, an exact single-`draft_session` query rule for
admission URL rewriting, and product copy without internal format names. A
third round added explicit pending/unknown request outcomes (lost-response
recovery) after new browser evidence showed a transport-lost response could
still mint a second person. A fourth round hardened that recovery: receipt
validation before declaring committed, a mounted/workspace admission guard,
replay-4xx uncertainty retention, client-navigation warnings, state-truthful
copy, and seal-before-callback completion.

## EXP-01 — contact-create failure (missing `captured_at`)

Changes:

- `apps/web/components/relationship-workspace/agent-create-person-card.tsx`:
  each of the three resource POSTs now has its own request identity
  (`{ requestId, capturedAt }`) created together by `ensureRequestIdentity`:
  `sourceRequestRef` (first source note), `handleRequestRef` (confirmed
  identity clue), `deferRequestRef` (deferred identity review). The defer path
  previously shared the first-source request ID, which could replay the wrong
  idempotency key after a partial commit. The identity is stable across
  same-intent retries; any draft/target change calls `resetDraftRequests()` and
  resets ID **and** observation time together; the clue-confirmation toggle
  resets only the clue request (its own payload). Every POST body now includes
  `captured_at` (canonical ISO string from `new Date().toISOString()`).
- Same file — **partial-success recovery** (review fix): once the first source
  commits, its receipt, scope and display labels are frozen in
  `CommittedPersonSource` state. If the confirmed-clue save then fails, the
  committed person/context/note become read-only (the clue input and its
  confirm toggle stay editable), the identity-check area shows the saved
  person instead of any later directory matches, and a `role="status"` block
  shows exactly what is saved. Every subsequent retry runs
  `completeSavedPerson()`, which writes **only** the missing clue
  (`scope_mode: "existing"` against the frozen person/context) — never a
  second `new_person`/note request, never a person retargeted by a new search.
  Omitting the clue (uncheck) or the explicit “打开已保存的人物” escape
  completes with zero further writes.
- `apps/web/app/api/local-integration/resources/route.ts`: new
  `validCapturedAt()` validates JSON-path and multipart `captured_at` without
  calling `Date.toISOString()` on invalid input (the previous raw
  `RangeError: Invalid time value` source). Missing or malformed values return
  422 `resource_intake_failed` with the product copy
  "无法确认该来源的观察时间，未保存任何内容。请刷新页面后重新提交。" —
  concise actionable Chinese with no internal format names. The server
  never invents an observation time.
- `apps/web/lib/server/localBackend.ts`:
  `commitRelationshipResource` validates `captured_at` (type, parseable,
  canonical ISO) before any backend call and rejects with the same product
  copy above — a recoverable validation error, never a raw RangeError, never a
  server-invented timestamp.

Tests (rendered happy-dom/`createRoot` conventions):

- `apps/web/components/relationship-workspace/agent-create-person-card.test.ts`
  (28 tests across nine groups):
  1. create + confirmed clue sends exactly two POSTs, each with its own request
     ID and a canonical ISO `captured_at`;
  2. same-intent retry after primary success / clue failure reuses the clue
     request ID and observation time exactly and **never re-posts the saved
     first source** (3 POSTs total, 1 note) — the failure is an announced
     (`role="alert"`), focusable (`tabIndex={-1}`, actually focused) error that
     keeps the submitted name/context/note;
  3. a changed intent (edited note, before any successful commit) resets
     request ID **and** observation time together — both differ, the new time
     is still a valid canonical ISO;
  4. deferred identity (two ambiguous matches) saves through its own stable
     request identity with `scope_mode: "identity_candidates"`, retries stably
     after failure, and hands `resolution_case_id` to `onDeferred`.
  5. (review regression) note success → clue failure → **edit the clue** →
     confirm → retry: exactly one first-source/`new_person` request ever, both
     `contact` requests carry the same saved person/context and
     `identity_clue_confirmed: true`, the corrected clue value reaches the
     retry, the frozen labels reach `onCommitted`, and a fresh directory search
     surfacing another person during the clue edit does not retarget anything;
     name/context/note are disabled while the clue stays editable;
  6. (review regression) note success → clue failure → **uncheck the clue** →
     complete: zero further resource writes, `onCommitted` with exactly the one
     saved receipt and the saved person.
- `apps/web/app/api/local-integration/resources/route.test.ts` (4 tests):
  missing `captured_at` on a note, malformed `captured_at` on a note, missing
  `captured_at` on a confirmed clue submission, and malformed `captured_at` on
  a multipart document intake — all 422 with the exact product copy, no
  `ISO`/`时间戳`/`request` plumbing or raw error names in the message, and
  `commitRelationshipResource` never called (the document case proves
  validation happens before extraction).
- `apps/web/lib/server/localBackend.test.ts` (2 tests): missing and malformed
  `captured_at` reject with the exact product copy (error name is not
  `RangeError`, message has no internal format names) before any fetch.

## Lost-response recovery — explicit pending/unknown request outcomes

New parent browser evidence: the first note POST commits personA (real 201)
but the browser transport throws before the UI sees the response. The source
outcome is **unknown**, not failed; the previous code exposed the raw
transport error, left the draft editable, and an edited retry minted a new
`new_person` request that created personB. This is distinct from the
acknowledged-source/definitively-rejected-clue case above.

Changes (`agent-create-person-card.tsx` only; no library, backend or storage
changes):

- **Frozen requests**: every submission freezes identity + exact JSON body
  before dispatch (`FrozenRequest` for source/clue/defer; the source variant
  also freezes labels, outcome and whether the clue step resumes). Retries
  replay that frozen request verbatim.
- **Outcome classification** (`dispatchFrozen`): `committed` = 2xx with
  receipts; `rejected` = a definitive client/validation rejection (a real 4xx
  answer with a parseable body, except 408) → known no-effect, correction
  allowed; `blocked` = 401/403 account/session transitions → fail closed (all
  mutation actions stop, no blind retry, exit described); everything else is
  `unknown`: transport failure, malformed/unparseable body, 2xx without
  receipts, 5xx, 408. Raw transport/parse errors are never shown and unknown
  never claims "unsaved".
- **Tracked state**: `trackedRequest` (`pending` while in flight, `unknown`
  after an uncertain answer) with a `role="status"` notice and one explicit
  action — “用相同内容重试核实” (exact replay). A synchronous
  `submitLockRef` makes rapid double clicks admit exactly one submission.
- **Locks**: while pending/unknown (or blocked/sealed) the source fields,
  target-selection area, clue input and clue toggle are disabled. An unknown
  clue must be resolved (exact replay) before any other clue attempt; no
  second note is ever sent. An unknown defer replays its original frozen
  candidate scope. The unknown-source replay never re-consults the directory
  lookup, `ready`, or `new_person` permission (its own committed identity may
  now appear in search).
- **Committed-state preserved**: acknowledged source + definitively rejected
  clue still permits safe clue correction/omission and “打开已保存的人物”.
- **No silent rollback**: close asks for confirmation that states closing does
  not roll back anything and that the in-memory retry entry is lost; a
  `beforeunload` guard warns while a request is pending/unknown. A
  known-committed but unusable source (unresolved identity / missing review
  case) seals the form against duplicate writes with only a described exit.
- Parent refinements mirrored: the `initialDraft` summary now says
  “首条来源已保存 · 后续仅处理身份线索” when the source is committed (it no
  longer keeps 尚未发生任何变化), and the creation footer primary/secondary
  buttons are scoped to `0.875rem` (they computed to 12.64px).

Tests (7 new; all prior regressions pass unchanged, including the
definitive-422 correction/omission ones):

1. server effect succeeds, caller gets a transport failure → unknown notice,
   no unsaved claim, edits locked, explicit retry replays the exact
   body/request ID/observation time, commits exactly once with the returned
   receipt, and no directory lookup participates in the replay;
2. source fields disabled in flight; rapid double clicks dispatch exactly one
   request and commit once;
3. unknown clue → same saved scope, identical clue body replayed, no note
   replay, clue locked until resolved;
4. unknown defer → frozen `candidate_person_ids` payload preserved exactly;
5. malformed responses (contract-violating 200 body, unparseable 200 body) →
   unknown, no false “unsaved” claim, no raw parse errors leak;
6. 503 → uncertain (correction path locked, only exact replay offered). This
   pins the review's classification: the scoped suite contained **no** prior
   503 fixture (verified by search); every known-no-effect correction fixture
   already uses a definitive 422;
7. 401 account/session transition → fail closed, no blind retry offered.

## Unknown-outcome correctness (review round 4)

Bounded fixes in `agent-create-person-card.tsx`, its tests, and scoped
`globals.css`; no backend, library, or storage changes.

1. **Receipt validation before declaring committed** (P1): `validatedReceipts`
   reuses the existing safe validator
   `matchesTypeBox(ResourceCaptureResponseSchema, …)` and then checks
   association with the frozen request: every receipt's
   `resource.client_resource_id` equals `web-resource:<request_id>`, the
   source/clue receipts carry the required identity IDs and match the
   request's existing person/context scope, and the defer receipt carries a
   `resolution_case_id` with a candidate set equal to the frozen candidate
   scope (any bound person must be a candidate). Invalid, truncated, or
   wrong-scope receipts are never cast or trusted — the outcome stays unknown
   with the exact request retained. Test fixtures were upgraded from
   truncated objects to full contract receipts bound to the live request
   identity.
2. **Mounted/workspace admission guard** (P1): a mount admission captures the
   workspace identity (`[data-workspace-scope]`) plus a mount epoch. Before
   every additional POST and every host callback the guard re-derives the
   current DOM scope; expiry (`WORKSPACE_SESSION_EXPIRED_EVENT`) and any scope
   change fail closed, missing scope fails closed (render-derived lock), and a
   late continuation after unmount performs no state writes, no POST, and no
   callback (it can never reset a newer attempt's state).
3. **Replay uncertainty retained** (P1): a 4xx answer to the REPLAY of an
   unknown request (409 idempotency conflict, 404 withdrawn resource, …) is
   never converted into proof the original never committed — the unknown
   warning and exact replay stay, the correction path stays locked, and no
   unsaved claim appears. A first-attempt validation rejection stays
definitive and correctable. Session 401/403 blocks further writes but keeps
   the uncertainty warning and implies no rollback.
4. **Client-navigation warning**: `beforeunload` does not cover Next
   client-side links, so a scoped document-level click guard (mirroring the
   Time editor's link guard) warns while a request is pending/unknown.
   Declining prevents the navigation with no unmount and no POST; accepting
   proceeds and the dead admission blocks any continuation POST. The X close
   asks the same way and describes that closing never rolls back.
5. **State-truthful copy and focus**: the initialDraft summary, committed
   block and footer render text from the actual pending/unknown/committed/
   rejected/blocked state (no “尚未发生任何变化” during an unknown source, no
   “clue unsaved and editable” during an unknown clue); the unknown recovery
   notice is focusable (`tabIndex={-1}`) and receives focus — not only errors.
6. **Seal before host callbacks**: every completion seals the form and stores
   the acknowledged receipts/outcome before invoking `onCommitted`/
   `onDeferred`. A throwing host callback leaves a sealed, truthful state
   (never an apparently normal editable form) with an explicit “重试打开”
   safe re-open of the stored completion and a working close exit. Unexpected
   internal failures seal with an explicit stop message instead of silently
   unlocking.

Tests (15 new; all prior regressions kept): truncated `[{}]` receipt →
unknown + exact replay commits once; receipt bound to a different existing
person → unknown with truthful clue-uncertain copy; receipt bound to another
request identity → unknown; unmount mid-flight → no clue POST and no host
callback; workspace scope switch mid-flight → no follow-up POST/callback and
fail-closed lock; session expiry mid-flight → same; missing scope → fail
closed at mount with zero requests; unknown → replay 409 and unknown →
replay 404 → uncertainty retained and retry preserved; unknown → session
expiry → writes blocked with the uncertainty warning retained; client-link
decline (prevented, mounted, no POST) and accept; X close decline and accept;
initialDraft unknown copy + notice focus; host-callback throw → sealed truthful
state, safe re-open replays the stored completion, close exits.

## EXP-03 — create-contact readability and error recovery

- `apps/web/app/globals.css`, scoped only to `.context-agent-create*`,
  `.context-agent-identity-check*` and their existing sub-blocks (person
  matches, match reasons, temporal notes/status, handle owner, distinct-person,
  create-distinct, identity-error): the 9–11px text is replaced by a two-step
  scale — 16px (`1rem`) card heading, person names, inputs/textarea; 14px
  (`0.875rem`) labels, supporting text, and every identity/evidence/
  authorization explanation and chip. Inputs/textarea `min-height: 44px`.
  Spacing normalized to a 12px card rhythm with 6/8px inner gaps; borders and
  color tokens unchanged. No global token changes, no visual redesign.
- Mobile (`max-width: 640px`): the card's inputs/textarea and footer
  primary/secondary buttons get `min-height: 44px`; the header icon close is
  44×44. Existing 44px rules for identity-error/match/create-distinct buttons
  kept.
- The submission error is now announced and focusable
  (`role="alert"`, `tabIndex={-1}`, focused on appearance via `errorRef`), and
  the submitted content is preserved for recovery. The inline clue-format hint
  stays beside the clue input. All meaning-bearing identity/evidence/
  authorization copy is preserved verbatim.

## EXP-04 — Time/Extensions mobile control targets

- `apps/web/components/time-workspace.module.css`: in `@media(max-width:640px)`
  the generic `.page button` minimum height is 38px → 44px (create arrangement,
  time navigation, view selection, filtering, editor actions), and a
  higher-specificity restatement
  `.page .header button, .page .dateNavigation button, .page .segmented button, .page .quickRanges button, .page .filterToggle { min-height: 44px }`
  is placed after the generic rule so nested rules (`.segmented button` 29px,
  `.quickRanges button` 30px, `.dateNavigation button`) cannot override the
  target. Calendar content keeps its own higher-specificity sizes and widths
  (`.monthDay`, `.monthEvent`, `.weekPoints button`, `.weekHeader button`,
  `.moreInDay`, `.weekEvent`); no widths were added or raised, so 320px reflow
  is not given new clipping risk and calendar content is not enlarged.
- `apps/web/components/workspace-extensions.module.css`: in
  `@media (max-width: 760px)` the add button (`.addButton`) and the other
  mobile controls (`.primary`, `.quiet`, `.danger`, `.error button`,
  `.dialogFooter button`) get `min-height: 44px`, stated after the base heights
  so disabled/hover sub-selectors never shrink the target. Desktop heights are
  unchanged.
- This implements the project's own 44px mobile target. It is not a WCAG 24px
  AA claim and no conformance wording is asserted.

## EXP-06 — skip anchor preserved on canonical Session URL

- `apps/web/components/conversation/queued-conversation.tsx`: admission now
  accepts an empty hash or `#main-content`, and the canonical
  `window.history.replaceState` keeps that anchor
  (`/workspace/sessions/<id>#main-content`). A query is rewritten only when it
  is empty or holds **exactly one** `draft_session` parameter equal to this
  session — a duplicated key or any extra parameter (e.g.
  `?draft_session=<id>&surface=desk`) is separate navigation intent and is
  never rewritten or discarded, nor is any other hash (the existing `navigating`
  guard and comments are preserved).
- `apps/web/components/conversation/queued-conversation-admission-url.test.ts`
  (6 tests) assert real `window.location` after admission through the actual
  rendered send/admission path and History API: skip anchor survives the
  canonical replace; no hash yields the canonical URL without one; an
  unrelated `#turn-42` hash stays untouched; an unrelated `?surface=desk`
  query intent stays untouched; a mixed query carrying the matching
  `draft_session` **plus** `surface=desk` stays fully intact (review
  regression); a duplicated `draft_session` key stays fully intact (review
  regression).

## EXP-07 — deleted/unavailable arrangement is a compact terminal view

- `apps/web/components/time-schedule-editor.tsx`: a deleted or inaccessible
  arrangement now renders one compact, immediately visible terminal view —
  heading ("这条安排已删除" / "这条安排已不可访问"), explanation, and a
  single **关闭** (Close) button — replacing the entire form. All four terminal
  routes converge there: deleted readback on a deep link, unreachable readback
  (401/403/404/410/session_stale), an acknowledged delete, and "use the server
  version" on a deleted conflict. No old content, empty disabled fieldset, or
  misleading edit form survives. Readback checks, unknown-operation
  reconciliation (same idempotency key), conflict decisions (including the
  deleted-server-version decision), session-storage failure recovery, export
  and delete flows are otherwise unchanged.
- `apps/web/components/time-schedule-editor.test.ts`: the two existing deletion
  regressions were updated to the mandated terminal view and now assert the
  absence of any form/inputs/fieldset and old content (the previous empty-field
  expectations described the defect being fixed; the new assertions are
  strictly stronger). Two new regressions: a deleted deep link renders the
  compact terminal view with a working Close, and an inaccessible (404)
  readback renders the unavailable terminal view with Close. The existing
  lost-response recovery, same-identity retry, conflict-decision and
  storage-recovery tests pass unchanged.

## Verification performed

1. `pnpm install --frozen-lockfile --ignore-scripts` — up to date.
2. Focused: `vitest run components/relationship-workspace/agent-create-person-card.test.ts`
   — 28/28 passed (run first).
3. `pnpm --filter @talent-signal/web typecheck` — passed.
4. `pnpm --filter @talent-signal/web lint` — passed.
5. `pnpm --filter @talent-signal/web test` — 1,255 passed, 1 skipped, run
   once after all fixes (baseline: 1,213 passed, 1 skipped; net +42 scoped
   tests).
6. `pnpm docs:check` — passed (wiki check, architecture boundaries and
   diagrams).
6. Review regressions were run against the pre-fix code first: all 10 new or
   tightened assertions failed there (clue correction reposted a second
   `new_person` note and re-targeted to the search person; omission reposted a
   third request; mixed/duplicated queries were rewritten to the canonical
   URL; the old ISO-format copy was returned), then passed after the fixes.

## Unresolved limits

- No browser or visual verification was performed: 200% text, 320px reflow,
  keyboard order, contrast, dark theme, and real 390×844 / 320px renders of the
  retuned typography and 44px targets remain parent evidence. No 98/100 score
  and no visual-verification claim is made here.
- Control target sizes are only asserted at CSS source level; computed styles
  in a real browser were not measured.
- EXP-01 tests prove client request-identity behaviour plus route/backend
  timestamp validation; the end-to-end Person readback after create/clue/
  defer (open Person, reload, verify identity/context/sources) needs the
  integration environment and stays parent-owned, as do the new
  Sources/runtime findings.
- Request-identity reset ("changed intent resets both") now applies **only
  before any successful commit**. After partial success the committed person
  and first source are frozen: correcting the clue, omitting it, or retrying
  can no longer create an additional person or source at all — retries write
  at most the missing confirmed clue against the saved identity. Before the
  first commit, an edited draft still issues a new identity and therefore a
  new governed source by contract.
- EXP-06 tests exercise the real admission path and History API in happy-dom;
  the Next.js client-router integration of `replaceState` (native History API →
  `usePathname`) is covered by the existing code comments and behaviour, not by
  an end-to-end browser run.
- Multipart document intake now validates `captured_at` before extraction; the
  extraction pipeline itself was not re-tested beyond that boundary.
- In committed partial-success state the clue-confirmation toggle stays
  enabled even when a fresh lookup reports the clue currently owned by
  another person; the adapted caution copy asks the recruiter to verify or
  omit the clue instead of blocking. Clue-ownership enforcement itself is a
  backend concern not exercised here.
- **Unknown-outcome recovery state is in memory only** (deliberately: no
  persistent browser storage may hold raw relationship evidence). A reload or
  navigation loses the frozen request and the exact-replay entry point; the
  form warns via `beforeunload` and an explicit close confirmation, but
  **reload recovery is not implemented and not claimed**. Reopening the form
  cannot resume a lost replay — the recruiter must verify the record through
  the Person/Sources surfaces (parent-owned readback).
- The unknown-source replay's independence from `canCreateDistinctPerson` /
  `ready` is enforced by construction (the replay never reads lookup state)
  and asserted by "no lookup call participates"; the rendered harness cannot
  change a lookup result between dispatch and retry without passing through a
  lookup-loading state that would block the initial create, so that single
  angle is not separately probe-able in the DOM tests.
- Definitive-rejection classification is HTTP-status based (4xx with parseable
  body, except 408). A misbehaving proxy that answers 4xx after committing
  would be misclassified as no-effect; transport failures, malformed bodies
  and 5xx are conservatively unknown, and final duplicate protection is the
  frozen request-ID idempotency keys server-side.
- On a replay answered with a 4xx, the server's message is deliberately not
  surfaced (it could imply a no-effect conclusion); only the retained unknown
  warning and exact replay are shown. The specific 4xx reason therefore needs
  server-side inspection (parent-owned).
- Receipt validation proves structure and request association, not server
  readback truth: the end-to-end Person readback after create/clue/defer stays
  parent-owned.
- The missing-scope lock is render-derived (and re-checked at every dispatch);
  a scope that appears later without a re-render unlocks only after the next
  render, while every write path re-validates first.
- The client-navigation guard intercepts anchor clicks at the document level
  (Next client-side links); imperative `router.push` without a link click is
  host behaviour and cannot be intercepted from this card.
- The unknown notice receives focus but is not scrolled into view; scroll
  behaviour at real viewports is parent browser evidence.
