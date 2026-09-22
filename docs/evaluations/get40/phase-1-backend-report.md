# GET-40 phase 1 — three-scope Memory backend report

Date: 2026-09-22
Status: Bounded backend/contracts/Agent slice implemented; real host/adapter
entrypoints for the reviewed paths are exercised by integration tests. This is
not product, visual, native, or real-model acceptance.

This report is written by the implementing worker. It records verified local
evidence and explicitly pending work. It does not present skipped or mocked
checks as passing, and it does not claim phase-1 delivery until the parent's
independent review and the phase-2 surfaces land.

## Scope delivered

- Migrations `076_memory_review`, `077_memory_review_corrections`,
  `078_memory_review_hardening`, `079_memory_source_authority`: accepted memory,
  independently retained minimal evidence, proposals/items, purpose-bound review
  scopes and multiple credentials, drafts, commits, receipts, rebase log,
  projection outbox, source-revocation ledger, dismissals, epoch-aware capture
  snapshots, and directed relationship ownership.
- `memoryReviewPolicy.ts`: pure admission, dependence, temporal, judgment,
  selection, edit, undo, and reclaim rules.
- `memoryReviewStore.ts`: row/provenance access, identity binding, strict
  Session source authority, governed capture source authority, lineage.
- `memorySourceVerification.ts`: pending source revalidation (message, ordered
  images, capture epoch, resource authorization, deadlines, ledger).
- `memoryReviewStage.ts`: bounded staging, guarded identity rebase, and the
  regeneration path with governed target recall and admitted image loading.
- `memoryRegenerationAgent.ts`: provider-backed bounded reproposer using real
  `inputParts` image bytes and the `memory_review`-independent regeneration
  prompt.
- `memoryReviewRead.ts`: purpose-scoped listing, credential-bound review
  open/read/draft merge, and scoped dismiss.
- `memoryReviewCommit.ts`: atomic commit, receipt, source revalidation under
  locks, truthful readback, undo, correction/delete.
- `memoryReviewRecall.ts`: authorization-first recall and explicit
  deletion/revocation/rebind propagation.
- `memoryReviewRoutes.ts` and `app.ts`: additive authenticated routes including
  the POST rebase regeneration route wired to the governed image loader.
- `packages/contracts/src/memorySchemas.ts` and additive event/response fields.
- `apps/agent` typed `memory_review` tool and provider wiring; `chat.ts` and
  `unscopedChat.ts` recall/stage integration with the optional memory reference
  beside `agent_event`.

## Source authority and retention (current, single description)

- Pending proposals require the original admitted source to still be available:
  exact Session message text, ordered image attachment/digest, capture epoch,
  resource authorization, authorization/retention deadlines, and access state.
  Reads, drafts, commits, and reproposals fail closed otherwise.
- Accepted minimum evidence is independently retained after a successful human
  commit. Two distinct lifecycle classes apply afterwards:
  - Natural Session/image TTL and natural source-authorization expiry keep the
    accepted evidence recallable.
  - Explicit Session/capture/artifact deletion and explicit authorization
    revoke remove dependent Memory from every read path immediately.
- `memory_source_revocations` is epoch-aware: explicit delete writes an
  all-epoch tombstone; explicit revoke and identity rebind tombstone only the
  revoked `captures.version`. A later restore or rebind establishes a new epoch
  that can stage and accept fresh evidence while the old epoch stays gone.

## Identity, review, and safety

- `contact_status` and dependence are host-derived. A tentative model name is a
  `proposal_target` draft, never a resolved identity; only a current
  stable-handle match or an authenticated human selection resolves an existing
  target. Relationship memory is directed to author + contact + context and is
  never shared to another same-account user.
- A self sentence that declares or names a contact dependence is bound or
  flagged `self_scope_escape`; commit applies the same invariant to edited text.
- Review scopes are purpose-bound and carry multiple independent credentials;
  business proposals cannot be widened into private Chat, and restricted views
  never serialize private self text, ids, or hidden counts.
- Commit idempotency is bound to the exact review scope, so an operation key
  cannot be replayed through another legitimate scope.
- Temporal non-destructiveness: a new future plan never supersedes a non-future
  fact; plan-to-evidence completion and same-plan reschedules still update.

## Verification performed locally

Synthetic isolated database:
`postgres://get40_test@127.0.0.1:55440/get40_test` (no production data).

- `pnpm --filter @talent-signal/backend typecheck` — passed.
- `pnpm --filter @talent-signal/backend exec vitest run src/modules/memoryReview.test.ts` — 7 passed.
- `DATABASE_URL=postgres://get40_test@127.0.0.1:55440/get40_test pnpm --filter @talent-signal/backend migrate` — applied 84 migrations.
- `CONTACT_AGENT_TEST_DATABASE_URL=postgres://get40_test@127.0.0.1:55440/get40_test pnpm --filter @talent-signal/backend exec vitest run src/modules/memoryReview.integration.test.ts` — 43 passed, including:
  - pending TTL/deadline/message-mutation/missing-or-changed-image rejection and contact-only-after-delete;
  - explicit delete and explicit revoke/restore, plus natural authorization
    expiry through the real `sweepDueSourceAuthorizations` service (accepted
    evidence survives, pending cannot be accepted, capture epoch increments);
  - the real `executeUnscopedChatTask` host for an empty-objective image-only
    message and the real `createChatTask` relationship host, each staged by a
    scripted provider through the production `memoryReview.stage` seam, then
    opened and committed;
  - the real `createMemoryProposalRegenerator` adapter with ordered admitted
    image `inputParts` bytes/hashes, governed target recall, unrelated directed
    memory excluded, an authenticated POST rebase route round trip, and a
    provider-wait race where a Session delete or image removal during inference
    rejects with no revision/target/item/draft change;
  - same-account privacy, identity authority, truthful replay, idempotency
    scope binding, dismiss, conflict-undo preservation, and a two-connection
    source-delete-versus-commit lock barrier.
- Full backend unit suite — 695 passed, 260 skipped.
- `workspaceConversationAgent.test.ts` — 31 passed (optional memory reference
  beside `agent_event`, answer survival when the optional stage fails, helpful
  answer after search without leaking contact provenance).
- `pnpm --filter @talent-signal/agent test` — 288 passed, 1 skipped.
- `pnpm docs:check` — passed (84 migrations; hotspot/diagram checks pass).
- `git diff --check` — passed.

`scripts/check-architecture-boundaries.mjs` changed only
`FROZEN_MIGRATION_COUNT` (80→84) and `FROZEN_MIGRATION_DIGEST` for the four
manifest-registered Memory migrations; no other checker logic, threshold,
exclusion, or migration history was altered.

## Pending (not claimed as done)

- Phase 2, parent-scheduled: conversation-queue completion and Session
  restoration lifecycle acceptance; HTTP Fastify `inject` acceptance for the
  POST rebase regeneration route (the adapter and route wiring are exercised,
  but not a full authenticated HTTP round trip); scope-bound operation
  recovery/undo.
- Shared Web review surface and the fold/inline/loose-note visual states,
  390px/1280px evidence.
- No native UI or runtime change was requested for this issue. The response
  contract stays additive and the memory reference is not an `agent_event`
  kind, so backward-compatible contract checks (native-acceptable event union)
  remain covered by the workspace Agent tests.
- Real-model A/B/C evaluation on the frozen cases and independent human
  verification; no live model call was made here.
- No production deploy, no real candidate data.

## Routes and handoff

See `plans/2026-09-22-get-40-memory.md` for the route table, request/response
contracts, credential header, and synthetic fixture instructions.

## Independent phase-one checkpoint

On 2026-09-22, the parent independently reran 53 Memory tests (46 PostgreSQL integration and 7 policy), backend typecheck, documentation/architecture checks, and diff whitespace checks successfully. The independent implementation reviewer closed the source, scope, identity, temporal and regeneration P0/P1 findings in this phase. The last correction prevents delayed regeneration from writing any candidate or excerpt after source deletion, expiry or mutation.

This checkpoint authorizes continued Web implementation only. Production Chat/People/Pursuit rendering, completed Session restoration, scope-bound operation recovery/undo, actual browser interaction evidence, model quality evaluation and final delivery remain to be verified. No production deployment or native release is part of GET-40.
