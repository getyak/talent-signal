# Conversation sending, progress, and follow-up research

- Date: 2026-09-20
- Owner: Codex
- Status: Complete; research and interaction demonstration only

## Outcome and scope

Explain the waiting behavior shown in the supplied Session screenshot, compare
documented ChatGPT, Claude, and Manus patterns, and propose a recoverable
message/progress/queue experience for Talent Signal. Produce a source-linked
research note and a local synthetic interaction demonstration.

This records the initial research request. The subsequent implementation request
is tracked in [the implementation plan](2026-09-20-conversation-send-stream-queue.md).
Competitor-account writes and live provider timing measurements were not performed.

## Evidence and unknowns

- Baseline inspected: local `main`, `e631705c`.
- Existing unrelated iOS tooling and documentation changes are preserved.
- Session `sending` spans draft persistence, a complete JSON answer, and
  canonical Session readback; it locks the composer throughout.
- The existing Pursuit event stream is a reusable pattern, but its semantic
  text chunks are emitted from artifact readback. It is not proof of live
  provider answer streaming in the ordinary Session route.
- Competitor documentation distinguishes Chat, Code, agent tasks, and APIs.
  No undocumented queue semantics or account-specific availability is assumed.
- Screenshot duration and active deployed revision are unknown.

## Milestones

1. [x] Inspect screenshot-related source paths and scoped product rules.
2. [x] Verify primary competitor sources and separate evidence from inference.
3. [x] Write the research note and demonstrate immediate echo plus FIFO queue.
4. [x] Check documentation and demonstration interactions, then hand off.

## Approach

Separate local echo, durable admission, run progress, partial answer, committed
answer, and next-turn input. Recommend a visible FIFO next-turn queue first;
current-run steering is a separate explicit capability. Avoid fabricated
progress, post-completion typewriter delays, and an unlocked composer attached
to the old single-draft state machine.

## Completion evidence

- [Research note](../_index/notes/2026-09-20-conversation-send-stream-queue-research.md)
  with dated primary sources, exact local code pointers, state transitions,
  failure semantics, and measurable acceptance targets.
- Synthetic demonstration: immediate local echo, active input, queue editing
  and withdrawal, stop/resume, and sequential processing; clearly no backend.
- `pnpm docs:check`, fragment syntax, and narrow/desktop interaction inspection.

## Verification and handoff

- `pnpm docs:check` passed, including wiki and architecture checks.
- Fragment JavaScript syntax passed; no API/network calls in the demonstration.
- In-app browser readback verified immediate echo, three sequential submitted
  messages, two visible queued entries, stop with queue preservation, queued
  message editing/withdrawal, resume, partial text, and final text. A new unsent
  draft remained intact when the previous queued answer completed.
- Default desktop screenshot and 360 px viewport inspected; the 360 px preview
  had a 328 px content width and no horizontal overflow.
- The Playwright extension connector was unavailable; verification used the
  Codex in-app browser instead. No extension was installed.
- The demonstration lives in this task's visualization directory as
  `conversation-send-queue.html`; it is synthetic and has no persistence or API.
- Remaining uncertainty: real deployed send timings, current competitor UI
  account/platform behavior, and production streaming/queue implementation.
  These do not block the requested design research.
