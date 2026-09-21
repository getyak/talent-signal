# GET-38: Inline image messages

## Outcome and boundary

Send text, images, or both in the ordinary conversation. Selected, dropped,
and pasted images preview in the composer; Enter sends one message, and the
Agent analyzes its actual images and replies in the same transcript. There
is no source-intake modal or separate save-and-organize step. Original-image
inspection remains available from the message. Sources/Captures is separate.

User correction supersedes the earlier GET-38 plan and PR #231's product
interpretation. Canonical interaction guidance lives in docs/design-system.md.
No automatic contact confirmation or external action follows image analysis.
Private text-only chat and native iOS are outside this change.

## Baseline and approach

- Latest verified remote main: `224cd37489ee8b9431564a58cdc0327aa8bb2df9`.
- Parent worktree: `get-38-inline-chat-images`; dirty main and concurrent work
  remain untouched.
- Pi implementation task: `20260921-153219-d1f7d252`; parent owns docs,
  independent review, acceptance, and delivery.
- Extend existing queue admission with immutable ordered image manifests and
  atomic bounded image storage. Preserve message identity across unknown
  responses, retries, and reloads. Bytes never enter session JSON or logs.
- A scope-bound expiring browser attachment outbox retains pending bytes;
  server images follow Session ownership, deletion and expiry. Provider input
  contains real images with message provenance and bounded follow-up context.
- Removing the source modal alone is insufficient: current unscoped provider
  paths explicitly reject images and must admit user-sent conversation images.

## Milestones

1. [x] Confirm the corrected interaction and isolate latest-main baseline.
2. [x] Implement inline composition, durable admission, image readback, Agent
   input, and failure/recovery tests.
3. [ ] Independently review and close findings; prove real multimodal chat
   using synthetic images in an isolated expiring workspace.
4. [ ] Pass current-head CI, merge, verify resident runtime and Linear state.

## Completion evidence

Exercise text-only, image-only and mixed messages; file/drop/paste parity;
inline previews and removal; IME/newlines; pending/active/history rendering;
unknown admission retry and reload; ownership, expiry, deletion and cleanup.
Prove the actual Agent can identify image content not supplied in prompt text,
then answer a follow-up in the same conversation. Check narrow layout and
original-image viewing. Run affected contracts, provider, backend and Web
checks, actual PostgreSQL integration, docs checks and current-head CI.
No Simulator or TestFlight release is required.

## Current status

Pi was stopped after 296 turns; the parent adopted its isolated changes and
completed lifecycle, receipt-uncertainty, bounded byte-read, and image-order
fixes. Independent review closed every confirmed P1; no unresolved P0/P1.

Verified: 30 PostgreSQL queue/stream tests, 26 backend image/readiness/chat
tests, 59 provider/observation tests, 44 focused Web tests, backend/Agent
typechecking, docs and architecture checks. Browser synthetic fixture proved
images-only and pasted image-plus-text admission, inline reply without a modal,
and no horizontal overflow at 390 px. This fixture used a mocked API and is
not real-model acceptance; it was removed from source after verification.

Resident deployment, real-model image recognition/follow-up, current-head CI,
merge, and Linear readback are still pending. The task-owned PostgreSQL lives
in `/private/tmp/ai-test-get-38-inline.unEdkq`, Compose project
`talent-signal-get38-inline-test`, loopback port 32770; remove its volume and
registered artifact after delivery. Linear last showed a network error.

Storage audit reports 119 GiB available, no devices
outside the shared pool, and no registered task artifacts. One pre-existing
unregistered artifact is outside this task's cleanup authority. GET-38 must
remain open until the corrected acceptance is proven.
