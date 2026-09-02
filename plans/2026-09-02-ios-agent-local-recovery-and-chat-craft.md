# iOS Agent local recovery and chat craft

Status: complete
Owner: Codex
Started: 2026-09-02

## Outcome

The iOS Agent answers deterministic workspace questions such as contact count
from the current on-device workspace snapshot without a model call, turns a
missing current source review into an understandable review path instead of a
blind retry, and presents the conversation with a calmer, provider-neutral
hierarchy.

Completion is observable when a scoped or unscoped `查看我有多少个联系人`
turn returns the synchronized People count with zero Agent request, a missing
review authority exposes the exact source and a deliberate review decision,
and the focused Swift, backend, and UI checks pass without weakening remote
authorization or external-effect approval.

## Boundary

In scope:

- deterministic local workspace-count intent and answer;
- preserving the current server-side account, person, relationship, source,
  and external-effect gates;
- source-review recovery for the legacy `reviewed` state that lacks a current
  review record;
- scoped error copy, header/scope density, response provenance hierarchy, and
  composer-adjacent recovery layout;
- focused unit/UI coverage and a rendered mobile verification.

Out of scope:

- moving candidate evidence, identity authority, or consequential writes to a
  device-only trust boundary;
- general offline semantic search over candidate conversations;
- changing retention, deletion, provider credentials, or TestFlight rollout;
- redesigning Today, Sessions, People, or the living person page.

## Current evidence

- The supplied screenshot shows a scoped Session where the centered identity
  and the scope selector repeat `neo`, the remote provider name dominates the
  answer title, and an English review-authority error compresses beside a blind
  Retry action.
- `RelationshipAskReadback.validated` correctly rejects a cited fragment that
  has no `last_review_id`, but the error discards the citation needed for an
  inline repair path.
- The composer routes every selected-scope text turn to remote Ask before
  considering whether the current workspace snapshot can answer it
  deterministically.

## Chosen approach

1. Recognize a small, explicit contact-count grammar and compute the result
   from the already authenticated `PursuitWorkspaceSnapshot`. Label the answer
   as on-device and snapshot-bound; do not open evidence or call a model.
2. Keep remote authorization authoritative. When the client detects a legacy
   citation without current review authority, carry that exact citation into a
   review sheet so the recruiter can inspect and deliberately review or dispute
   it. A successful review restores the draft; it does not auto-send a new Ask.
3. Make the header name the Agent once, let the compact scope row own identity,
   move provider provenance out of the headline, and give errors a vertical
   explanation/action layout that survives Chinese and Dynamic Type.

## Milestones

1. **Complete — Behavior and recovery.** Added local routing, source-review
   requirement transport, and safe review/retry state.
2. **Complete — Visual refinement.** Applied the provider-neutral response and
   compact mobile hierarchy.
3. **Complete — Proof.** Backend typecheck and 9 focused tests passed; 79 iOS
   unit tests passed; the focused Chinese iPhone UI test passed with zero Agent
   requests and a preserved screenshot; `pnpm docs:check` passed.
4. **Complete — Review.** Applied `REVIEW.md` and the evidence-safety/mobile UX
   vetoes. The deterministic path remains limited to workspace-index metadata,
   while evidence authority and external effects remain server governed.

## Replanning signals

- Stop if a local answer would require raw conversation content rather than the
  synchronized workspace index.
- Re-plan if the citation readback does not contain an exact excerpt and source
  scope; such a source must remain blocked and cannot be repaired inline.
- Do not replace server authorization with cached client state, even if the
  client can predict the failure.
