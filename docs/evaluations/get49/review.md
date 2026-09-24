# GET-49 review — send in-place processing and controllable supplements

Date: 2026-09-24
Reviewer: same session after implementation (not an independent agent)
Scope: GET-49 owned files only (contract, migration 082, queue admission/state,
Web queued conversation). Unrelated dirty tree is listed separately.

## Verdict

**Accept after P1 fixes applied in this review.** The slice still needs a
disposable-PostgreSQL run of the new prioritize cases and an authenticated
surface readback before release. Linear’s full GET-49 body was unavailable, so
requirement coverage is judged from the issue title, product/design docs, and
the 2026-09-20 send research.

## Findings

### P1 — fixed and proven (2026-09-24 disposable PostgreSQL)

1. **Plain Stop inherited prioritize auto-continue.**  
   `prioritize` set `cancel_auto_continue` on the live run. A later `stop` only
   set `cancel_requested`, so cancel finalize still skipped the pause and the
   next message ran after a user who only asked to stop.  
   **Fix:** `stop` now clears `cancel_auto_continue`. Claim, persistence-pending,
   and interrupted recovery also clear the flag so it cannot leak across runs.  
   **Proof:** `plain stop after prioritize still pauses and never inherits auto-continue` passes on Postgres 18.

2. **`prioritize` bypassed the unfinished-work gate.**  
   `continue` refuses while any `failed`/`interrupted` entry remains (retry or
   withdraw first). `prioritize` unpaused without that check and could run later
   messages past a hole.  
   **Fix:** `prioritize` uses the same `CONVERSATION_QUEUE_RETRY_REQUIRED` gate.  
   **Proof:** `refuses prioritize while a failed message still needs retry or removal` passes on Postgres 18.

### P2 — open

3. **Linear acceptance criteria not read.** Scope is inferred from title +
   research. A missing named behavior in GET-49 would not be detected here.

4. **Disposable-DB prioritize cases — closed 2026-09-24.** Full
   `conversationQueue.integration.test.ts` (31 tests) passed against disposable
   Postgres 18 at `postgres://get49_test@127.0.0.1:55450/get49_test` after
   migrating through `082_conversation_queue_prioritize`. Prioritize-filtered
   run: 4 passed. Plain-stop-after-prioritize: 1 passed.

5. **Unrelated dirty working tree mixed with this delivery.** Not GET-49:
   `apps/macos/Sources/Features/*`, `scripts/ios/*`, `scripts/macos/package.sh`,
   `docs/operations/*`, `docs/README.md`, and status-line edits in
   `_index/notes/2026-09-20-conversation-send-stream-queue-research.md` and
   `plans/2026-09-20-conversation-send-ux-research.md` (those two look like a
   revert of the later “see implementation plan” wording). Preserve as unrelated
   user work; do not ship them inside a GET-49 commit.

### P3 — polish

6. **`window.confirm` for prioritize.** Delete uses an in-surface confirm.
   Prioritize’s stop consequence deserves the same calm control, not a browser
   modal.

7. **Accepted local message has no status until reconcile.** Intentional quiet
   success, but if the stream is down the bubble sits with neither “sending”
   nor queue placement. A one-line “已在服务端接收” only while not yet in
   snapshot/history would be clearer.

8. **Draft “停止并处理此条” not implemented.** Only queued entries can be
   prioritized. Sending while a run is active still means FIFO queue only
   (matches research phase 1; phase-2 current-turn supplement remains open).

## Safety / integrity (AGENTS.md review rules)

| Check | Result |
| --- | --- |
| Interpretation promoted to confirmed state | No. Queue only reorders Agent intent. |
| External write without approval | No new external effects. |
| Person ranking / prohibited traits | No. |
| Identity / time / idempotency loss | Prioritize reuses mutation idempotency and CAS `expected_revision`. Sequence renumber is session-scoped under the queue lock. |
| Partial/unknown reported as success | Quiet accepted state is local `delivery:accepted` after 202 admit only; unknown/rejected keep recovery. Cancel still stores a truthful stopped turn. |
| Retention / deletion | No new retention. Prioritize does not copy message bodies. |

## Product loop

- In-place lifecycle and quiet accept improve the calm path.
- Controllable supplements stay visible and reversible (edit/withdraw/stop/continue/prioritize).
- Consequence of prioritize is explained when a live run would be stopped.

## Evidence after P1 fixes

- Backend `tsc6 --noEmit` clean; Web typecheck + lint clean.
- Web focused suite green (includes GET-49 surface tests).
- `pnpm docs:check` green after evidence-link path fix.
- Still unproven here: live prioritize with a real runner/PostgreSQL, resident
  Web/macOS readback, TestFlight backend redeploy (backend changed).

## Recommendation

1. Run the conversation-queue integration suite against disposable PostgreSQL
   before merge.
2. Keep GET-49 commit files exclusive of the unrelated dirty tree.
3. Replace `window.confirm` with the existing in-surface confirm pattern when
   touching the queue UI again.
4. Paste or link Linear GET-49 description so acceptance can be checked item by
   item.
