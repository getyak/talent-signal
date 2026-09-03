# Agent CRM competitive design and integration research

Date: 2026-09-03
Status: decision input, not canonical product policy

## Research frame

This scan tests a broader product direction: an evidence-first relationship CRM
for individuals and small teams, with one visible, configurable Agent that
coordinates capture, memory, relationship context, proposals, and approved
actions.

The comparison is intentionally narrow:

- Kin: embodied identity and long-term understanding;
- Mesh: relationship graph and multi-source context;
- Ohai: artifact-to-action coordination;
- Paired: low-effort reciprocal interaction;
- Apple, Google, and LinkedIn: the actual capability and policy boundaries for
  capture, contacts, calendar, and import.

Public material was checked on 2026-09-03. Product websites and platform
documentation establish supported behavior. Store reviews and public forum
threads are directional anecdotes, not representative usage research. Claims
below are labeled as observations, interpretations, or recommendations.

## Executive read

No reference product supplies the whole answer.

- Kin makes an AI feel continuous by giving it an identity and editable shared
  memory. It demonstrates emotional continuity, not a trustworthy CRM data
  model.
- Mesh makes a person's relationship context feel discoverable across sources.
  It demonstrates the value of a quiet relationship graph, but passive
  aggregation can obscure provenance unless the product deliberately restores
  it.
- Ohai demonstrates the shortest loop from an incoming artifact to useful
  operational work. Its breadth also shows why access scope and approval state
  must be visible.
- Paired demonstrates that relationship behavior can be sustained by one small,
  reciprocal moment. Public feedback also shows that a daily ritual quickly
  becomes homework when it is repetitive, compulsory, or paywall-heavy.

The product opportunity is therefore not an AI dashboard. It is one calm,
embodied Agent over a governed relationship system:

1. intentional capture;
2. evidence and provenance preserved;
3. stable people and contextual relationships resolved;
4. memory proposed or confirmed at the right scope;
5. actions staged with exact effects;
6. a person approves consequential writes;
7. the result is read back and recorded.

The Agent needs its own destination, reached from a persistent avatar or product
mark. `Today` should remain an attention surface. `People` should remain the
identity surface. Imports need a separate progressive flow. Chat remains a
global way to ask the Agent to work, not the place where all configuration is
stored.

## Observed product mechanisms

| Product | Observed public mechanism | What is worth borrowing | What must not be copied blindly |
| --- | --- | --- | --- |
| Kin | A board of named AI advisors sharing memory, plus a daily brief and editable memory | One stable embodied Agent, continuity across sessions, visible and editable memory | Advisor proliferation, vague memory authority, or a persona that implies autonomous truth |
| Mesh | Contact cards and a relationship graph assembled from contacts, email, calendar, messaging, social sources, and manual imports | Quiet multi-source context, low-manual-entry onboarding, natural-language retrieval, duplicate resolution | Source blending without field-level provenance, ambient collection, or claiming a live connector where only import exists |
| Ohai | A named assistant turns calendars, email, documents, images, and screenshots into tasks, reminders, plans, and schedules | Artifact-to-proposal speed, multimodal capture, coordinated execution | Broad content access without purpose boundaries, invisible automation, or writes that skip exact approval |
| Paired | Five-minute prompts, quizzes, games, and answer reveal after both partners participate | One optional relationship moment, reciprocal participation, delayed reveal when two people are involved | Streak pressure, generic prompts, guilt notifications, repetitive content, or treating relationship maintenance as a score |

### Kin observations

- **Observation:** Kin's current App Store positioning describes a shared memory
  across AI advisors, a daily briefing, fast capture, and the ability to
  remember people. The listing checked on 2026-09-03 showed version `0.16.0`,
  dated 2026-06-12.
- **Observation:** Kin's own memory explanation argues for a memory system that
  is separate from a single model and can be inspected and edited by the user.
- **Observation, weak user signal:** App Store reviews praise continuity and
  “memory nodes,” while individual reviews also mention cross-device continuity,
  avatar quality, early review prompts, and paywall friction. These are anecdotes
  and should generate test questions, not conclusions.
- **Interpretation:** The valuable pattern is not the number of personalities.
  It is a stable social contract: the user knows who is responding, what that
  entity remembers, and where to correct it.

Sources:

- [Kin App Store](https://apps.apple.com/us/app/kin-ai-advisors-journal/id6473448146)
- [Why Kin has its own memory](https://mykin.ai/resources/why-kin-has-its-own-memory)
- [Kin](https://mykin.ai/)

### Mesh observations

- **Observation:** Mesh describes a relationship system built from contacts,
  email, calendar, LinkedIn, X, iMessage, phone calls, and manual imports from
  files and work tools.
- **Observation:** Its Nexus assistant can navigate the graph and propose or
  perform bounded organizational work such as notes, groups, and duplicate
  resolution.
- **Observation:** Mesh's source guides use concrete permission language,
  including limits around message bodies, sending, and stored credentials.
- **Interpretation:** A relationship CRM should feel populated quickly, but
  every derived field still needs a visible source, time, and confidence path.

Sources:

- [Mesh getting started](https://library.me.sh/knowledge-base/getting-started/)
- [Mesh Nexus](https://library.me.sh/knowledge-base/nexus/)
- [Mesh App Store](https://apps.apple.com/us/app/mesh-contacts-crm/id1463073824)

### Ohai observations

- **Observation:** Ohai presents one named assistant that accepts text or voice
  and works across calendars, tasks, email, documents, photos, and screenshots.
- **Observation:** Its public feature descriptions emphasize extracting events,
  reminders, schedules, and plans from incoming artifacts.
- **Observation:** Its terms describe processing email bodies, metadata, and
  attachments when the user connects email.
- **Interpretation:** The strong pattern is the short path from “I received
  something” to “here is the work it implies.” The corresponding trust cost is
  broad source access, so the product must expose scope, last access, and
  revocation rather than hiding them in generic settings.

Sources:

- [Ohai](https://www.ohai.ai/)
- [Ohai features](https://www.ohai.ai/features/)
- [Ohai terms of use](https://www.ohai.ai/pdfs/OhaiAI.TOU.2025-12-01.pdf)

### Paired observations

- **Observation:** Paired publicly promises short daily relationship activities,
  including questions, quizzes, games, and expert-led material. Pairing makes
  the experience reciprocal rather than a solo content feed.
- **Observation, weak user signal:** Recent public Reddit discussions contain
  both long-term positive use and repeated descriptions of relationship apps as
  “homework,” repetitive, cluttered, or overly monetized. Some users report
  that one free question is enough and that a prompt is valuable when it starts
  a real conversation.
- **Interpretation:** The transferable unit is one optional, contextual nudge
  that creates a human interaction. It is not a daily streak, content library,
  or engagement quota.

Sources:

- [Paired](https://www.paired.com/)
- [Paired pairing help](https://support.paired.com/en/articles/164636-how-do-i-pair-with-my-partner)
- [Reddit: are couple apps worth the money?](https://www.reddit.com/r/Marriage/comments/1qt8f1l/are_couple_apps_worth_the_money/)
- [Reddit: experiences with couples apps](https://www.reddit.com/r/IndianRelationships/comments/1oyqis9/has_any_couples_app_paired_agap%C3%A9_etc_genuinely/)
- [Reddit: couples apps felt cluttered](https://www.reddit.com/r/apps/comments/1rjm4ub/we_tried_every_couples_app_out_there_none_felt/)

## Ranked UX problems to solve

Severity uses `P0` for a trust or data-integrity failure, `P1` for a primary-flow
failure, and `P2` for meaningful friction. Frequency and confidence are based on
the current repository plus the public evidence above, not production analytics.

| Rank | Problem | Severity | Expected frequency | Confidence | Required response |
| --- | --- | --- | --- | --- | --- |
| 1 | The Agent can make interpretation look like confirmed relationship truth | P0 | recurrent | high | Visually and structurally separate evidence, inference, proposed memory, confirmed memory, action, and receipt |
| 2 | Multi-source import can create or merge the wrong person | P0 | recurrent during onboarding | high | Stage records, expose exact source fields, resolve identity before canonical writes, keep merge reversible |
| 3 | “Connected” can conceal whether a source is a snapshot, live read, or approved write path | P1 | recurrent | high | Use a typed capability state and plain-language status, not a single connected badge |
| 4 | An embodied Agent page can collapse into a settings dashboard | P1 | frequent | high | Keep the first screen to identity plus four rows: Memory, About you, Sources, Action permissions |
| 5 | Proactive execution can feel like invisible automation | P1 | recurrent | high | Show what triggered the proposal, the exact effect, approval boundary, and observed result |
| 6 | Imported data can become stale while still looking current | P1 | recurrent | high | Show source time, last successful import, partial state, retry, revocation, and deletion lifecycle |
| 7 | Relationship nudges can become guilt or repetitive homework | P1 | daily if enabled | medium | Make nudges optional, contextual, dismissible, and outcome-aware; never score a person or streak |
| 8 | Memory controls can imply functionality that is not actually connected to Agent behavior | P1 | recurrent | high | Only expose controls with a real read/write contract; otherwise show an honest unavailable or planned state |
| 9 | Permission requests can arrive before the user sees value | P2 | onboarding | medium | Ask source-by-source at the moment of import, with preview and least privilege |
| 10 | A large AI hero can displace actual CRM work | P2 | every visit | high | Put the Agent behind a persistent avatar destination; keep Today and People task-led |

## Opportunity map

### Immediate: prove the semantic shell

- Give the top-left Agent mark a dedicated destination.
- Show a stable Agent identity and a one-sentence role.
- Present only `Memory`, `About you`, `Sources`, and `Action permissions` on the
  first level.
- Use truthful source states derived from actual capability.
- Keep chat globally available, rather than adding a large chat CTA to the
  Agent configuration page.

### Next: prove one governed import

- Support a user-selected LinkedIn connections export or generic contacts CSV.
- Parse into a staging area without creating people.
- Show encoding/schema problems, missing fields, duplicates, and ambiguous
  identity before confirmation.
- Write canonical people only after review, then create a receipt with source
  manifest, selected decisions, and resulting identifiers.
- Support retry, cancel, and source-file deletion without deleting confirmed
  people silently.

### Later: add source adapters by capability, not logo count

- Device and iCloud contacts through user-selected vCard or platform permission.
- Google Contacts through least-privilege OAuth and explicit sync semantics.
- Calendar as separately described read and write capabilities.
- Email only when a narrow product job justifies body or attachment exposure.
- CRM adapters only when identity mapping, ownership, conflict, idempotency, and
  revocation are defined.

### Conditional: reciprocal relationship moments

- Offer a single suggested question, acknowledgement, or follow-up only when it
  is grounded in recent evidence and the relationship context permits it.
- If two people participate, reveal comparative or shared content only after
  both opt in.
- Do not add streaks, relationship scores, compatibility scores, or acceptance
  predictions.

## Integration capability matrix

`Available` means the platform supports the path. It does not mean Talent Signal
currently implements it.

| Source | Available path | Product semantics | External write | Principal constraints | Recommended first state |
| --- | --- | --- | --- | --- | --- |
| LinkedIn connections | Member-requested data export, then ZIP/CSV import | One-time snapshot; first-degree connections only | none | Email is only present where the connection permits export; LinkedIn warns that some extended characters may not export correctly | `import_ready` after file selection, then `review_required` |
| LinkedIn profile | User-provided profile URL; approved member API only when authorized | Identity anchor, not background sync | none in first slice | Do not scrape; official APIs do not imply arbitrary network access | `linked_reference`, never generic `connected` |
| Apple/iCloud Contacts | User-exported vCard or device Contacts permission | Snapshot import or explicitly described device read | proposed canonical person creation only | Least privilege, identity resolution, revoke permission, source deletion | `connected_read` or `import_ready` |
| Google Contacts | People API OAuth | Read or managed contacts depending granted scope | only as separately approved write | Readonly and contacts scopes differ; mutations need conflict/idempotency discipline | `connected_read`; writes disabled initially |
| Generic CSV | User-selected file | One-time snapshot | proposed canonical creation only | Encoding, schema mapping, partial failure, duplicate review, source retention | `import_ready` |
| Apple Calendar | EventKit / current outbound projection | Read and write must be separate capabilities | exact approved event write | Device permission, stale proposal, duplicate event, verified readback | `connected_write_requires_approval` for current outbound path |
| Google/Microsoft calendar | OAuth adapter | Explicit read window and separately approved write | exact approved event write | Token scope, tenant policy, revocation, recurring events, timezone | `available`, not `connected`, until implemented |
| Email | Provider OAuth or user-forwarded artifact | Narrow message or attachment ingestion | no sending in initial CRM | Highly sensitive bodies and attachments; purpose and retention must be explicit | `available_with_scope`; default off |
| Screenshot / Share Sheet | User-selected screenshot or shared content | Intentional evidence capture | none | Preserve original, time, source context, review, and deletion | `ready` |
| iPhone Action Button | Apple Shortcut launching an App Intent | Fast entry adapter to capture/review | none by itself | Supported devices only; no hidden long-press behavior inside the app | `ready` after Shortcut setup |
| Existing CRM | Vendor OAuth or user-exported CSV | Snapshot or typed read sync | separately approved write only | Ownership, custom fields, deletion, merge, rate limit, and audit semantics vary by vendor | begin with CSV; adapters later |

Platform sources:

- [LinkedIn: export connections](https://www.linkedin.com/help/linkedin/answer/a566336/export-connections-from-linkedin)
- [LinkedIn API terms](https://www.linkedin.com/legal/l/api-terms-of-use)
- [LinkedIn Profile API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api)
- [Apple: import or export contacts in iCloud](https://support.apple.com/en-gb/guide/icloud/mmfba748b2/icloud)
- [Google People API](https://developers.google.com/people)
- [Google People contacts guide](https://developers.google.com/people/v1/contacts)
- [Apple: run shortcuts with the Action button](https://support.apple.com/en-euro/guide/shortcuts/apdfea15680b/ios)

## Typed source state

A single “connected” boolean is insufficient. UI and contracts should derive
plain language from a typed state:

```text
not_available
available
connecting
linked_reference
connected_read
import_ready
importing
review_required
connected_write_requires_approval
partial
failed
revoked
deletion_pending
```

The state must travel with source identity, authorization scope, last successful
read, freshness, error, retry token, and deletion policy. Product copy should
translate the type into specific language such as “LinkedIn export ready to
review” or “Calendar can write one approved event,” never a vague green check.

## Source-to-state pipeline

```text
intentional source selection
  -> immutable import manifest and provenance
  -> parse into staging
  -> encoding and schema validation
  -> identity and duplicate review
  -> field-level proposals
  -> explicit confirmation
  -> canonical writes
  -> receipt and verified readback
  -> source retention or deletion choice
```

Failure at any step must leave earlier evidence inspectable and must not imply a
successful import. Retry must be idempotent. Deleting a raw import later must
not silently delete confirmed people; deleting confirmed people must be a
separate, explicit, reversible operation where possible.

## Design implications

### Surface roles

- `Today`: decisions and work that deserve attention now.
- `Sessions`: resumable Agent intent.
- `People`: stable identity and relationship retrieval.
- `Calendar`: direct projection and approved scheduling surface.
- `Agent`: identity, Memory, About you, Sources, and Action permissions.
- `Import review`: a dedicated temporary workflow, never a dashboard card.

### Agent destination

The first screen should be visually quiet:

1. small portrait or abstract character, user-selected name, and one-line role;
2. Memory row with scope and review state;
3. About you row with only grounding information;
4. Sources row with a compact count and the most important exception;
5. Action permissions row stating that consequential writes require approval.

Each row opens a focused second level. Connection logos, event histories,
technical errors, and per-source controls belong there. A large red “Ask” button
does not belong on this configuration page; chat already has a global entry.

### Visual character

Continue the existing quiet system: warm neutral surfaces, strong whitespace,
serif hierarchy, restrained vermilion only at the causal or review seam, real
icons, and no glowing AI theater. The Agent's “soul” should come from stable
identity, memory continuity, precise language, and accountable behavior rather
than animation or decorative density.

## Evidence limits and open research

- Public descriptions do not prove retention, trust, or import quality in real
  use.
- App Store and Reddit feedback is self-selected and may include competitor or
  builder promotion.
- LinkedIn capability and terms can change; re-check before implementation and
  release.
- A general relationship CRM audience still needs direct design-partner
  interviews. The next study should compare three tasks: importing an existing
  network, correcting Agent memory, and approving an external action.
- The repository's current recruiter-first positioning conflicts with the
  general CRM direction. This document records the option; it does not silently
  redefine canonical scope.
