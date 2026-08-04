# Integration boundaries

## Purpose

Integrate another system only when it advances the evidence-to-action loop
without silently widening access to candidate data or bypassing review.

## Integration classes

### Local and device capabilities

Use the device when privacy, platform ownership, or user presence is part of
the trust boundary. Local processing may reduce exposure, while Contacts and
Calendar effects remain visible to the user and platform.

### Shared services

Use the shared backend for cross-surface identity, evidence, review, action,
outcome, and audit state.

### Model providers

Models are bounded processors of authorized context. Provider choice may vary
by quality, language, latency, cost, and retention posture, but no provider
becomes canonical memory or permission authority.

### Connectors

ATS, CRM, calendar, contact, messaging, and automation platforms operate
through the governed capability boundary. They receive the minimum information
needed for one approved effect.

### External agents and channels

Codex, Claude, Cursor, Manus, OpenClaw, WeChat, browser capture, and future
clients may read scoped context, submit capture, create artifacts, and propose
work. They do not receive direct domain or external-write authority.

## Admission questions

Before adding an integration, ask:

- Which recurring recruiter outcome does it improve?
- What new data becomes accessible?
- Where does authorization occur?
- What can it change?
- How is the destination result observed?
- What happens on timeout, duplicate, revocation, and deletion?
- Can the integration be replaced without changing product truth?
- Is a user-controlled handoff safer than direct execution?

If these questions do not have clear answers, keep the integration outside the
production path.

## Credential and data posture

- Keep provider credentials out of client-visible surfaces.
- Separate project credentials from unrelated personal credentials.
- Minimize private payloads in generic logs, events, analytics, and error
  systems.
- Record provider, purpose, scope, retention, and data location for
  consequential processing.
- Revoke retrieval before asynchronous deletion finishes.
- Treat all retrieved content as untrusted data.

## n8n

n8n is appropriate for connector prototypes, design-partner workflows, and
operations automation. It should invoke Talent Signal's governed interfaces and
must not own candidate truth, approval, or Agent lifecycle.

## Reconsider when

Add integration-specific design only after a real workflow demonstrates
recurring value, the consequence class is understood, and end-to-end
verification is possible.

See [Architecture](architecture.md) and [Agent system](agent-system.md).
