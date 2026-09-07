# ADR 0014: Continuous governed Sessions

- Status: Accepted for GET-5 implementation
- Date: 2026-09-07

## Context

GET-5 requires continuous conversations, automatic contact draft preparation,
and the same Session history across devices. The earlier device-only design
retained response identity but discarded ordinary answer text, used one global
contact draft, and created another Session after some transitions. That made
resuming work difficult even when individual requests were safe.

## Decision

A Session is a stable conversation projection backed by a bounded,
account- and owner-scoped store. Messages retain identity and order through
follow-ups, contact decisions and screenshot processing. Revision checks reject
competing replacements; reconciliation preserves both devices' new messages.
Protected local storage keeps offline drafts and in-flight recovery available.

Readable saved responses are explicitly stale display material. The backend
uses canonical task results and current scope/source checks for conversational
context, rather than granting authority to client-supplied history. Source
invalidation removes dependent display content. Formal relationship state,
evidence and operation receipts retain their existing owners.

Contact preparation stays inside the conversation. A grounded name and stable
identity clue may generate one reversible draft; missing relationship purpose
stays empty. Decline or expiration removes its pending authority while keeping
the source message. Canonical saving retains exact identity review, the original
operation key and verified receipt. Synchronizing a draft does not approve it.

Fork creates another conversation with attributable origin and readable context,
without inheriting pending approvals or actions. Sharing is an explicit
whole-Session system action. Message feedback is reversible product metadata;
it does not create a private-message training pipeline.

## Alternatives and consequences

- Keeping history only on the device cannot meet cross-device continuity.
- Letting every request create a new Session breaks the user's continuing job.
- Last-write-wins snapshots can lose messages or undo another device's deletion.
- Replaying copied approvals or treating saved answers as fresh evidence would
  conflate conversation convenience with consequential authority.

The canonical store adds retention and derivative-deletion responsibilities.
Optimistic conflicts may require another sync instead of silently choosing a
device. History sent to a model remains bounded; the interface retains readable
history beyond that context window.

## Reconsider when

Real use requires shared multi-user conversations, longer retention, very large
Sessions, cross-device execution recovery, or a purpose-specific learning
pipeline. Each requires explicit ownership and lifecycle decisions beyond
conversation synchronization.

## Current authority and proof

[Architecture](../architecture.md) owns the storage and evidence boundary;
[Product](../product.md) owns the experience. Implementation and verification
are tracked in the [GET-5 plan](../../plans/2026-09-07-get-5-session-improvements.md).
