# Agent-driven relationship CRM: product and engineering dossier

Date: 2026-09-03
Audience: product owner, design, engineering, safety review
Snapshot: the current dirty working tree and the sources frozen in
[Agent CRM competitive design and integration research](agent-crm-competitive-design-and-integrations.md)

## Decision question

Should Talent Signal evolve from a recruiter-first tool into a general
relationship CRM organized around one embodied, configurable Agent; and if so,
what product and technical sequence proves that direction without weakening
identity, provenance, memory control, or human approval?

## Executive decision

**Recommendation:** pursue the broader direction as a staged extension of the
existing evidence-first system, not as a homepage rebrand or a generic AI CRM.

The proposed product promise is:

> Capture relationship signals wherever they arrive. Your Agent turns them into
> durable, reviewable relationship memory and prepares the next useful action,
> while you remain the authority for identity, truth, and consequence.

This produces a coherent combination of the four reference products:

- Kin contributes a stable Agent identity and user-governed continuity;
- Mesh contributes a living relationship graph and multi-source retrieval;
- Ohai contributes the artifact-to-proposal execution loop;
- Paired contributes one low-burden, human relationship moment;
- the existing product contributes the evidence, approval, audit, and
  reversibility contract that makes the combination trustworthy.

The Agent does not become the database, the homepage, or the authority. It is a
visible coordination layer over stable records and bounded tools.

The first shippable proof should be a dedicated Agent destination plus one
truthful import path. A decorative Agent page alone does not prove the product;
a broad integrations marketplace would be premature.

## Claim ledger

### Observations

- The current canonical product is recruiter-first and explicitly resists a
  full CRM. The user's current direction asks to change that boundary.
- The repository already has intentional screenshot capture, People, Sessions,
  Today, contact proposals, review, calendar projection, and effect receipts.
- The current top-left mobile mark opens settings; no dedicated Agent identity,
  Memory, or Sources destination exists in the committed baseline.
- Current in-progress Agent code can clarify, search bounded contacts, and
  propose a contact, but does not own apply, merge, message, or schedule effects.
- Official LinkedIn material supports member-controlled export and constrained
  approved APIs; it does not support pretending that arbitrary network sync is
  available.

### Interpretations

- The existing architecture is a better foundation for a trustworthy CRM than
  a greenfield dashboard, because it already separates evidence, proposals,
  confirmation, and effects.
- The main design gap is semantic legibility: users need one place to understand
  who the Agent is, what it remembers, what it can access, and what it can do.
- The main technical gap is governed ingestion: source capability, staging,
  identity resolution, field-level confirmation, and lifecycle receipts.

### Recommendations

- Preserve `Today`, `Sessions`, `People`, and `Calendar` as task-specific
  surfaces.
- Add a persistent Agent avatar entry to a dedicated, sparse Agent destination.
- Make Memory, user context, sources, and action permissions explicit objects,
  not miscellaneous settings.
- Implement one-time LinkedIn/contacts CSV import before promising continuous
  third-party sync.
- Expand from the stable `Person + contextual relationship` model; do not
  introduce a lead score or one mutable CRM row as the product's truth.

### Decision needed

Before canonical documentation or naming changes, the product owner should
confirm that the target audience expands from independent recruiters to people
and small teams maintaining important professional and personal relationships.
The implementation slice below is compatible with both scopes and can gather
evidence without forcing that irreversible positioning decision.

## Product model

### Canonical objects

| Object | Authority | Purpose |
| --- | --- | --- |
| `Person` | confirmed state | Stable identity anchors and reviewed profile fields |
| `Relationship` | confirmed state plus scoped interpretation | The user's context with a person: role, cadence, commitments, open loops, boundaries |
| `SourceArtifact` | evidence | Screenshot, message excerpt, file, contact record, calendar item, or imported row with source and time |
| `MemoryClaim` | proposed or confirmed memory | A reusable fact, preference, pattern, or constraint with scope, evidence, confidence, and review status |
| `Episode` | observed history | A meeting, conversation, import, decision, action, or outcome at a point in time |
| `Proposal` | recommendation | A reversible candidate change or next action; never canonical merely because the Agent emitted it |
| `Effect` | authorized action | Exact external or canonical write approved by a person |
| `Receipt` | observed outcome | Attempt, idempotency key, provider response, readback, and resulting state |
| `SourceConnection` | authorization metadata | Provider, capability, scope, freshness, state, revocation, and deletion policy |
| `AgentProfile` | user-confirmed configuration | Name, presentation, supported capability summary, and links to governed Memory and permissions |

### Memory is not one bucket

1. **About you** — user-confirmed identity, locale, timezone, communication
   preferences, and explicit working constraints.
2. **Relationship memory** — facts and commitments scoped to one person or
   relationship, each with evidence and confirmation state.
3. **Workflow preference** — explicit user preferences such as preferred meeting
   duration or draft tone. These can shape proposals but never authorize
   effects.
4. **Episode history** — immutable or append-only observations and receipts.
5. **Derived patterns** — revisable interpretations with confidence and expiry;
   never silently promoted to facts.

Every memory item requires `scope`, `source`, `observed_at`, `status`,
`sensitivity`, `retention`, and a correction/deletion path. “Shared memory” in
the experience means that one Agent can retrieve governed items across sessions;
it does not mean that every model receives every item.

## Agent capability contract

The Agent follows a consequence ladder:

```text
Answer -> Locate -> Extract -> Relate -> Propose -> Confirm -> Act -> Verify
```

- `Answer`: explain without changing state.
- `Locate`: search only sources and people permitted for the task.
- `Extract`: create typed candidates from evidence.
- `Relate`: suggest identity or relationship links, with ambiguity visible.
- `Propose`: stage memory, contact, event, follow-up, or message changes.
- `Confirm`: a human selects the exact target, fields, and effect.
- `Act`: a bounded adapter performs only the approved effect.
- `Verify`: read back where possible and create a receipt.

An Agent persona can change tone, initiative threshold, summary style, or
default proposal format. It cannot change data access, memory scope, or effect
authority. Those remain system capabilities and user permissions.

## Information architecture

### Primary surfaces

| Surface | One question it answers | Explicitly excluded |
| --- | --- | --- |
| Today | What relationship work deserves attention now? | Agent setup, import administration, generic activity feed |
| Sessions | Which Agent intent should I resume? | Canonical people state |
| People | Who am I looking for and what is the reviewed relationship context? | Unresolved import rows and global settings |
| Calendar | What confirmed or proposed time commitment is relevant? | General memory and source administration |
| Agent | Who is coordinating, what may it remember, what can it read, and which actions require approval? | A second Today feed or a large chat canvas |
| Import review | What will this source add, change, skip, or fail? | Ongoing CRM navigation |

### Agent entry and first screen

Use the persistent top-left Agent mark as the entry. Do not replace Today and do
not add a fifth primary tab merely to advertise AI.

The first screen contains:

1. **Identity header** — small portrait, user-selected Agent name, short role,
   and a quiet status such as “Ready · 2 sources need review.”
2. **Memory** — count of reviewed and proposed items, scope summary, and the
   most important exception.
3. **About you** — only user-confirmed grounding fields.
4. **Sources** — compact capability summary, with partial or failed state taking
   priority over logos.
5. **Action permissions** — “Every contact, calendar, message, or CRM write asks
   for approval,” plus a focused detail page.

No metrics grid, daily queue, animated reasoning, integration marketplace, or
large “Ask Agent” button belongs here. Chat remains available through the global
conversation entry.

### Second-level pages

- `Memory`: reviewed, proposed, expired, and deleted items; filter by scope;
  inspect source; correct, confirm, or delete.
- `About you`: identity, locale/timezone, explicit preferences, and export/delete.
- `Sources`: one row per capability with scope, last import, freshness, error,
  reconnect/revoke, and source data deletion.
- `Action permissions`: contact, calendar, messaging, CRM, and notification
  effects separately described; all consequential writes remain exact-review.

## Onboarding and import design

### Progressive onboarding

1. **Meet the Agent** — choose or accept a name and learn the one-sentence
   contract. Skip is allowed.
2. **About you** — minimal identity and timezone; no personality quiz.
3. **Bring one source** — choose Contacts, LinkedIn export, CSV, or Screenshot.
   Do not ask for every permission.
4. **Preview** — show what the product found and what it could not understand.
5. **Resolve** — confirm duplicates and ambiguous identities.
6. **Commit** — approve exact people/fields to create or update.
7. **Receipt** — show imported, skipped, failed, and retained source data; offer
   deletion of the raw file.
8. **First value** — open one living Person page or one useful proposal, not a
   generic success animation.

### LinkedIn path

The first version is a member-controlled snapshot:

1. Explain how to request the user's LinkedIn data export.
2. Accept the selected archive or connections CSV.
3. Record a hash, file name, import time, and declared source; do not imply live
   sync.
4. Detect encoding and schema. If characters are lost, stop and show the rows
   rather than creating damaged identities.
5. Treat email as optional and potentially absent.
6. Match first-degree connections to existing people using transparent signals;
   never auto-merge on name alone.
7. Stage field-level creates and updates for review.
8. Commit selected changes and write a receipt.
9. Let the user delete the raw archive separately from confirmed records.

### Contacts and CSV path

- Provide explicit field mapping for name, organization, title, email, phone,
  URL, notes, tags, owner, and relationship context.
- Preserve unmapped columns in staging until the import is committed or deleted.
- Detect exact duplicates, possible duplicates, and new identities separately.
- Make partial failure row-specific and retry only failed rows under the same
  import idempotency key.
- Never convert arbitrary notes into confirmed memory without review.

## Technical shape

### New bounded modules

1. `AgentProfile`
   - user-selected display identity;
   - presentation preferences;
   - computed capability summary;
   - no authority fields that can override policy.

2. `MemoryRegistry`
   - scoped memory items and evidence links;
   - proposal/confirmed/expired/deleted lifecycle;
   - access query with purpose, subject, source, and sensitivity filters;
   - audit of which memory identifiers entered an Agent request.

3. `SourceConnectionRegistry`
   - typed source capability state;
   - scopes, account/reference identity, freshness, last success/error;
   - revoke and source-deletion workflow.

4. `ImportStaging`
   - immutable manifest and source hash;
   - parsed rows and validation failures;
   - identity candidates and field-level proposals;
   - commit receipt and idempotent retry.

5. `EffectBroker`
   - receives only approved effect envelopes;
   - validates capability and current permission at execution time;
   - prevents retries from duplicating effects;
   - records provider response and verified readback.

### Capability state contract

```ts
type SourceCapabilityState =
  | "not_available"
  | "available"
  | "connecting"
  | "linked_reference"
  | "connected_read"
  | "import_ready"
  | "importing"
  | "review_required"
  | "connected_write_requires_approval"
  | "partial"
  | "failed"
  | "revoked"
  | "deletion_pending";
```

Each capability record also needs:

```ts
type SourceCapability = {
  sourceId: string;
  capability: "read" | "import" | "propose_write" | "approved_write";
  state: SourceCapabilityState;
  authorizationScope: string[];
  lastSuccessfulAt: string | null;
  freshnessExpiresAt: string | null;
  errorCode: string | null;
  retryToken: string | null;
  retentionPolicy: string;
  revokeState: "available" | "requested" | "complete" | "failed";
};
```

The server owns effective state. Clients render it and may stage connection or
revocation requests; they must not infer “connected” from a locally stored URL
or toggle.

### Import commit contract

The commit request contains the manifest version, selected row decisions,
selected field decisions, duplicate resolution, and an idempotency key. The
server rejects a stale manifest rather than applying against changed canonical
people. A successful response returns created/updated/skipped/failed identifiers
and the receipt. A partial response remains reviewable and retryable.

## Options considered

### A. Make the Agent the homepage

Rejected for the first stage. It is emotionally legible but competes with Today,
encourages AI theater, and forces setup, chat, work, and source health into one
screen.

### B. Keep the Agent invisible and add ordinary settings

Rejected. It preserves current architecture but loses the product's desired
identity and gives users no stable place to understand memory or agency.

### C. Dedicated Agent destination plus governed imports

Recommended. It makes the Agent visible without confusing retrieval, truth, and
action surfaces. It also creates a home for source capability and memory control.

### D. Ship a broad connector marketplace first

Rejected. Logo breadth before identity, lifecycle, and approval contracts would
create inconsistent semantics and misleading status.

## Delivery sequence

### Phase 0 — semantic shell

- Add the dedicated Agent entry and compact first screen.
- Derive every visible status from a real capability or label it unavailable.
- Keep existing Today/Sessions/People/Calendar behavior unchanged.
- Instrument entry, row open, correction attempt, source setup attempt, and
  abandonment without logging sensitive content.

Exit evidence: users can explain what the Agent remembers, what it can access,
and whether it can act; no UI control claims an effect it does not have.

### Phase 1 — one governed import

- Implement generic contacts CSV plus the LinkedIn export schema as a profile.
- Stage, map, validate, deduplicate, review, commit, receipt, retry, and delete.
- No continuous sync and no external writes.

Exit evidence: normal, empty, malformed, alternate encoding, duplicate,
ambiguous identity, partial, retry, stale, cancel, and raw-source deletion cases
are tested on the real surface.

### Phase 2 — governed Memory

- Add proposed and confirmed Memory items with source evidence and scope.
- Let users correct, confirm, expire, and delete.
- Pass only purpose-filtered memory identifiers into Agent requests and record
  that selection.

Exit evidence: users can find why the Agent remembered something, correct it,
and see that deletion changes subsequent retrieval.

### Phase 3 — read adapters

- Add device or Google Contacts read capability first.
- Add narrow calendar read only after the product job and time window are clear.
- Add reconnect, revocation, stale, and deletion states before adding more logos.

### Phase 4 — approved effects

- Extend existing exact-approval patterns to individual contact, calendar,
  message, and CRM effects.
- Verify readback and surface partial or failed receipts.

### Phase 5 — relationship moments

- Test one optional, contextual, evidence-grounded interaction prompt.
- Add reciprocal participation only for explicitly paired relationships.
- Do not ship streaks, scores, or generalized relationship judgments.

## First implementation slice

The smallest useful slice is the mobile Agent destination reached from the
existing top-left mark. It should prove the information architecture and status
truthfulness while reusing existing settings for working capabilities.

Acceptance criteria:

- Today remains the default work surface.
- The top-left mark opens Agent, not a generic settings menu.
- Agent first level has one identity header and four rows only.
- Memory has no functional toggle unless the Agent actually consumes that state.
- A LinkedIn URL is labeled as a reference, not an account connection.
- Action Button reflects the real setup state.
- Calendar says outbound projection and approval, not two-way sync.
- Unimplemented imports are labeled unavailable or planned and cannot be tapped
  as if they work.
- Workspace utilities remain reachable one level deeper.
- VoiceOver order, Dynamic Type, Reduce Motion, and a compact phone viewport are
  verified.

The existing in-progress Agent Studio implementation must be simplified before
acceptance: its multiple explanatory cards and local-only Memory toggles are too
dense and imply behavior that is not wired to Agent retrieval.

## Evaluation program

Freeze one build and test the same artifact across product, safety, and mobile
review. Do not average scores; any active safety veto blocks release.

### Task scenarios

1. A new user opens the Agent and explains what it can remember and do.
2. The user adds a LinkedIn profile URL and correctly understands that it is not
   live sync.
3. The user sees that Action Button is ready and opens its setup.
4. The user sees calendar projection is off, enables it, approves one exact
   event, and inspects the receipt.
5. A future CSV import contains zero rows.
6. A future import contains malformed encoding and Chinese names.
7. Two rows may be the same person; name alone cannot merge them.
8. Import parsing partially fails, then retries without duplicating successes.
9. Canonical person data changes while import review is open; commit becomes
   stale.
10. The user revokes a source and deletes the raw import while keeping confirmed
    contacts.

### Measures

- task completion and time;
- incorrect expectation of autonomous action;
- incorrect expectation of live sync;
- ability to locate and correct Memory provenance;
- duplicate or wrong-identity rate;
- approval comprehension;
- VoiceOver traversal and Dynamic Type truncation;
- sensitive data in analytics or logs: expected zero.

### Required gates

- focused unit and contract tests for typed capability and import lifecycle;
- iOS build and focused UI test;
- real Simulator capture at compact and large text sizes;
- side-by-side comparison with the selected visual target;
- evidence-safety review;
- mobile UX review;
- current-user workflow review;
- `pnpm docs:check`.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Persona creates false trust | Make behavior and limits legible; keep sources and corrections one tap away |
| Memory becomes a surveillance bucket | Purpose-filter retrieval, explicit scope, review state, retention, delete, and access audit |
| Import corrupts identity | Stage first, field-level provenance, explicit ambiguity, stale rejection, reversible merge |
| Connector status misleads | Typed capability per source and action, server-owned effective state |
| Proactive work becomes autonomous | Proposal-first consequence ladder and exact-effect approval |
| Broader CRM becomes feature sprawl | Stable object model, one complete import before more adapters, one question per surface |
| Relationship ritual becomes guilt | Optional, contextual, dismissible prompts with no streak or person score |

## Evidence that would change the decision

- Design-partner research showing that users cannot find or understand the Agent
  unless it is a primary tab or default surface.
- Evidence that a general CRM audience needs account/opportunity pipelines more
  than relationship continuity; that would be a different product, not a UI
  extension.
- Official platform changes that enable safer live LinkedIn or source access.
- Evaluation showing that the embodied Agent increases automation over-trust or
  reduces correction behavior.
- Import tests showing that current identity primitives cannot safely represent
  non-recruiting relationships; resolve the model before broadening acquisition.
