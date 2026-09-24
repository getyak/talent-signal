# GET-49 send in-place processing and controllable supplements — local evidence

Date: 2026-09-24
Plan: [`plans/2026-09-24-get-49-send-inplace-supplements.md`](../../../plans/2026-09-24-get-49-send-inplace-supplements.md)

## What changed

| Layer | Change |
| --- | --- |
| Contract | `ConversationQueueMutationRequest` gains `prioritize` (queued entry only). |
| Database | `082_conversation_queue_prioritize.sql` adds `cancel_auto_continue`. |
| Backend | `prioritize` stops a live run with auto-continue, renumbers waiting work with the target first, clears pause. Cancel finalize honors `cancel_auto_continue`; plain stop still pauses. |
| Web (macOS hybrid inherits) | Accepted local messages omit “已送达”. Unknown/rejected keep recoverable identity. Queue is labeled `可控补充` with an explicit `优先` control and stop/pause consequence copy. |

## Checks run here

- Contracts + agent build; backend `tsc6 --noEmit` clean.
- Web typecheck and lint clean.
- Web focused suite: 11 files / 86 tests passed, including
  `queued-conversation-send-supplements.test.ts` (quiet accepted delivery + prioritize mutation body).
- `pnpm docs:check` passed after advancing the reviewed migration freeze to 86 entries (`082_conversation_queue_prioritize`).

## Not claimed

- ~~Disposable-PostgreSQL integration cases~~ **Closed:** full
  `conversationQueue.integration.test.ts` (31) passed on disposable Postgres 18
  (`get49_test@127.0.0.1:55450`) after migration through 082, including both
  P1 regressions (plain stop after prioritize pauses; prioritize refuses over
  failed/interrupted).
- No resident deploy, authenticated browser readback, or iOS TestFlight backend
  redeploy in this pass. Backend changed; `./scripts/deploy/testflight-local.sh`
  remains a delivery gate when the installed iOS app must receive it.
- Mid-run current-turn supplement injection is still out of scope.

## macOS boundary

The installed macOS hybrid loads the same Web conversation surface, so the
in-place lifecycle and prioritize control apply there without a separate native
composer change.
