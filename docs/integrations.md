# Integration boundaries

## Purpose

Integrate another system only when it advances the evidence-to-action loop
without silently widening access to candidate data or bypassing review.

## Integration classes

### Local and device capabilities

Use the device when privacy, platform ownership, or user presence is part of
the trust boundary. Local processing may reduce exposure, while Contacts and
Calendar effects remain visible to the user and platform.

An iOS App Shortcut may accept one user-selected image, validate that it is an
image, stage it in the device-owned pending-capture inbox, and open the app's
ordinary review. The shortcut is an entry adapter: it has no identity,
relationship, compilation, or external-write authority.

Sign in with Apple is an account-entry adapter. The iOS client requests a
nonce-bound identity assertion; the backend verifies it and owns account
binding, session issuance, replay prevention, and revocation. Apple profile
fields may be available only on the first authorization and are not evidence
about any candidate relationship. Sign-out revokes the server session when
reachable, always clears the protected device credential, and returns to the
account boundary so a prior workspace cannot remain visible.

### Shared services

Use the shared backend for cross-surface identity, evidence, review, action,
outcome, and audit state.

### Model providers

Models are bounded processors of authorized context. Provider choice may vary
by quality, language, latency, cost, and retention posture, but no provider
becomes canonical memory or permission authority.

A provider is not admitted for private conversation evidence until its
contract and observed configuration establish processing location,
subprocessors, training use, human access, operational logging, retention,
deletion propagation, incident notice, and commercial-use rights. A stateless
API flag or security marketing claim is not a substitute for that evidence.

Provider capabilities are admitted independently. Selecting a model for image
generation does not make that model, credential, or data path suitable for
understanding private conversation evidence.

### Public-web providers

Public search is admitted separately from model processing and private
evidence. A search provider receives only a query formed inside an explicitly
authorized company/market research Run. Talent Signal normalizes provider
results, fetches only same-Run result handles through its own guarded HTTPS
boundary, and preserves cited output only as a draft artifact.

A local Agent-host registry owns stable capability contracts, provider
selection, budgets, and failure semantics for open-world reads. Infisical owns
scoped credential delivery and rotation; each vendor still owns its commercial
subscription and invoice. The shared backend receives neither these search
credentials nor implicit publication authority. A provider registry or MCP
catalog never grants runtime authority by discovery alone.

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
- Keep private evidence out of provider products that claim broad or
  irrevocable data rights for training or service improvement.
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
