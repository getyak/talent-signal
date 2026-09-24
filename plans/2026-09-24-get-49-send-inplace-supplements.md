# GET-49 · Web/macOS send experience — in-place processing and controllable supplements

Base: `fd5d0e59` (main). Surfaces: Web conversation canvas and the installed
macOS hybrid host that loads the same Web UI.

## Outcome

Sending a conversation message keeps that message **in place** through its full
lifecycle (send → admit → wait → process → answer). While a turn runs, later
messages remain **controllable supplements**: visible FIFO queue entries that
can be edited, withdrawn, stopped around, or explicitly prioritized
(“停止并处理此条”) without inventing mid-run model injection.

## Why

The 2026-09-20 send research (`_index/notes/2026-09-20-conversation-send-stream-queue-research.md`)
separated delivery, run, and stream lifecycles and defined queue vs current-turn
supplement semantics. PR #217 shipped recoverable admission, a durable FIFO
queue, forming preview, and stop/continue. GET-49 finishes the product
contract named in the research for the Web/macOS send surface:

1. **原位即时处理** — the sent message is the unit the user watches; routine
   success chrome is omitted; stage and forming text stay on that turn.
2. **可控补充** — follow-ups never become an opaque backlog. The default is
   visible FIFO. The explicit `优先处理` action stops a live run when needed
   and processes the chosen message next, leaving other queue order visible.

## Boundaries

- No mid-run provider injection. A single tool-bearing run cannot honestly
  claim “已纳入本次处理” for text typed after the provider call started.
  Supplements that must affect the current answer stay future work.
- No concurrent second run per Session. Prioritize reorders and continues the
  same one-at-a-time runner.
- Fact confirmation and external writes stay outside this path. A queued
  message is intent to the Agent only.
- iOS native send is unchanged; macOS uses the shared Web surface.

## Key decisions

| Decision | Choice | Rejected |
| --- | --- | --- |
| Supplement default | Visible FIFO queue after the current turn | Silent merge or model-guessed steering |
| Explicit control | `prioritize` mutation: optional stop of the live run, move one `queued` entry to the front, clear pause | Client-only reordering (lost across devices) |
| Stop + prioritize | One server mutation sets `cancel_auto_continue` on the live run so cancel finalize does not re-pause the queue | Racing stop/continue pairs from the client |
| Happy-path delivery | Quiet after durable admit; recovery UI only for `unknown` / `rejected` | Persistent “已送达” footnotes (design system: omit routine success notices) |
| Failure / stop | Still pause the queue and require explicit Continue, except prioritize’s own stop | Auto-running later work on incomplete premises |

## Modules

- `packages/contracts/src/conversationQueueSchemas.ts` — `prioritize` mutation.
- `apps/backend/src/database/082_conversation_queue_prioritize.sql` — `cancel_auto_continue`.
- `apps/backend/src/modules/conversationQueueAdmission.ts` — apply `prioritize`.
- `apps/backend/src/modules/conversationQueueState.ts` — cancel finalize honors `cancel_auto_continue`.
- `apps/web/components/conversation/queued-conversation.tsx` — in-place lifecycle + prioritize control.
- `apps/web/components/conversation/use-conversation.ts` — no API change (existing `mutate`).

## Milestones

1. [x] Design pass from product rules, send research, and current queue code.
2. [x] Contract + migration + backend `prioritize` with plain-stop pause preserved.
3. [x] Web in-place lifecycle and prioritize control (macOS inherits).
4. [x] Focused tests: mutation union, stop+prioritize vs plain stop, UI recovery copy.
5. [x] Local typecheck/tests and architecture freeze advance for migration 082.

## Completion evidence

- `prioritize` is the only new mutation kind; edit/withdraw/retry/continue/stop keep their contracts.
- Plain stop still pauses. Prioritize that stops a live run sets `cancel_auto_continue` so cancel finalize leaves the queue running into the chosen entry.
- Accepted local messages no longer show a success footnote; unknown/rejected keep recoverable identity.
- Queue order after prioritize is server-authoritative and visible in the list; the surface is labeled `可控补充`.
- Web: 86 focused conversation tests pass (including 2 GET-49 surface tests). Backend/Web typecheck, Web lint, and `pnpm docs:check` pass.
- Disposable-PostgreSQL: `conversationQueue.integration.test.ts` 31/31 passed on Postgres 18 (`get49_test@127.0.0.1:55450`) after migration through 082. Review P1 fixes proven: plain stop after prioritize still pauses; prioritize refuses over failed/interrupted.

## Open risks

- True current-turn supplement (inject at a tool boundary with a consume receipt) remains out of scope.
- Live multi-process preview limits still apply from the queue release.
- Resident deployment and authenticated release readback are separate delivery gates.
