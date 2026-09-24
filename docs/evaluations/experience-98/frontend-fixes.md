# Experience 98 frontend fixes — delegated worker pass

Baseline: `b47180167d3db054fad50a635060eabed1b745b0`. Scope: EXP-01, EXP-03,
EXP-04, EXP-06, EXP-07. No acceptance score is claimed here and no visual
verification was performed; real interactions and screenshots are parent-owned.
The parent's `main#main-content` landmark repair on `QueuedConversation` and
`SessionDirectory` was preserved unchanged. GET-49's uncommitted work in the
original checkout was not touched or copied. A second round applied parent
review fixes: partial-success clue recovery that can never duplicate the
committed person/source, an exact single-`draft_session` query rule for
admission URL rewriting, and product copy without internal format names.

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
  (6 tests):
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
2. `pnpm --filter @talent-signal/web typecheck` — passed.
3. `pnpm --filter @talent-signal/web lint` — passed (second round).
4. `pnpm --filter @talent-signal/web test` — 1,233 passed, 1 skipped
   (baseline: 1,213 passed, 1 skipped; net +20 scoped tests).
5. `pnpm docs:check` — passed (wiki check, architecture boundaries and
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
