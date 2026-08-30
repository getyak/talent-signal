# Living contact page and relationship memory

## Research question

How should Talent Signal grow from a contact index into a CRM-quality person
record without becoming a generic field warehouse, flattening relationship
context, or letting generated Memory become canonical truth?

The reviewed artifact is the authenticated Web People table and living person
page. The target user is an independent recruiter moving between several live
searches. The page must answer:

> Who is this person, what contact data is currently safe to rely on, what is
> true in this relationship, what remains unresolved, and what is the smallest
> safe next step?

## Findings from current CRM patterns

The strongest record systems separate stable records from workflow-specific
entries. Attio distinguishes object attributes on the stable Person record
from list attributes that apply only inside one workflow; the same person can
therefore participate in two recruiting entries without one role overwriting
the other. Its record page combines details, related lists, and an activity
timeline rather than treating one panel as the entire record. See Attio's
[data model](https://attio.com/help/reference/attio-101/attios-data-model/understanding-attio-data-model),
[lists](https://attio.com/help/reference/attio-101/attios-data-model/understanding-lists),
and [record pages](https://attio.com/help/reference/managing-your-data/records/create-and-view-records).

Field history is as important as field presence. HubSpot exposes prior values,
the source of each change, timestamps, and restoration from record property
history. This supports a field-level interaction: current value first, history
on demand. See HubSpot's
[property history](https://knowledge.hubspot.com/records/view-record-property-history)
and [record layout](https://knowledge.hubspot.com/records/work-with-records).

Progressive disclosure is the correct response to a wide schema. Apple's
[disclosure guidance](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls)
recommends keeping the most-used information visible and hiding advanced
detail until relevant. Empty optional fields should not turn the ordinary
contact page into an intake form.

Agent-memory systems reinforce one useful distinction but do not supply the
product boundary. Persistent memory benefits from separately representing
facts, episodes, and procedures, and from attaching/detaching scoped memory
instead of putting everything in every prompt. Letta's
[memory blocks](https://docs.letta.com/tutorials/attaching-detaching-blocks/)
illustrate scoped attachment; current graph-memory work also emphasizes
temporal context and provenance. Talent Signal should adopt the distinction,
not a vendor's authority model: a retrieval score or extracted graph edge is
never a confirmed relationship fact.

## Decision: three governed layers

### 1. Person record: stable structured identity

`Person` remains the stable cross-context entity. These fields may be shown on
every living person page when they exist:

| Field family | Examples | Authority | Default presentation |
| --- | --- | --- | --- |
| Display identity | display name, preferred name, pronunciation | user-confirmed record | identity header |
| Contact points | email, phone, WeChat, LinkedIn, public professional URL | current confirmed handle with source and review deadline | masked value plus source/freshness |
| Authored orientation | short headline and summary | explicitly user-authored, not evidence | concise introduction with authoring label |
| Organization relationships | current and historical organizations | versioned, sourced relationship records | collapsed unless useful to the open context |
| Working locality | city/region, timezone, languages used for communication | source-linked or user-confirmed fact | only when decision-relevant |

Missing optional fields are absent. The page does not show a grid of empty
labels, infer values to achieve completeness, or collect identity documents,
financial data, family data, protected traits, personality, culture fit, or
acceptance probability.

Contact values remain masked in broad directory and page readbacks. A current
value carries a stable field ID, type, source resource, valid-from time, review
deadline, confirmer/lifecycle history, and deletion dependency. An expired,
revoked, contested, or unauthorized value is not displayed as current; it
remains available through review/history when policy permits.

### 2. Relationship memory: scoped semantic state

The same person can be a candidate, referrer, client stakeholder, or advisor
in different outcomes. The following therefore belongs to the exact
relationship context or Pursuit, never the global Person record:

- role and outcome context;
- decision drivers and explicitly expressed preferences;
- constraints and dependencies;
- commitments made by either side;
- explicit deadlines and time zones;
- open questions and conflicting evidence;
- current next action or intentional `no_action`.

Each memory item is a versioned projection over canonical evidence, reviewed
fact state, action state, or outcome. Its minimum contract is:

```text
MemoryItem {
  id, person_id, relationship_context_id,
  type, headline, structured_payload,
  status: proposed | confirmed | contested | expired | superseded | deleted,
  valid_from, valid_until, freshness_until,
  sensitivity,
  dependencies[],
  compiler_version, policy_version
}
```

The generated Memory view is rebuildable. It may compress and organize, but it
cannot confirm a claim, bind identity, extend retention, authorize an action,
or survive the loss of every supporting authority as if still current.

### 3. Episodes and operations: what happened

Episodes retain the temporal story without turning the primary page into a
feed. They include source capture, review decisions, corrections, identity
changes, proposals, approved actions, attempts, verified outcomes, reversals,
and deletion. Current state remains calm; episodes open progressively through
"Changes and outcomes", exact source review, and durable Agent history.

This separation gives the product semantic memory (what is currently true in
scope), episodic memory (what happened), and procedural capability (which
typed tool can safely be used) without confusing an Agent's remembered text
with domain authority.

## Page design

### Desktop composition

```text
People table
┌ Contact ────── Introduction ───── Relationships ─── Sources/activity ┐
│ ZY  Zhou Yu   Product leader       CPO search         4 · 30 Aug      │
└───────────────────────────────────────────────────────────────────────┘

Living person page
┌ Agent rail ┐  [ZY] Zhou Yu            [Ask Agent] [Add information]
│ scoped     │       Product leader · CPO search
│ tools and  │       Current dependency: evidence needs review
│ receipts   │
└────────────┘  ───────────────────────────────────────────────────────
                 Authored orientation | Current confirmed contact points
                ───────────────────────────────────────────────────────
                 RELATIONSHIP MEMORY
                 Current understanding     Next safe step
                 Valuable relationship memory | Still unresolved
                 ▸ Changes and outcomes
```

The header identifies the stable person and open relationship context before
showing tools. A single dependency receives attention; no visual device ranks
the person. Structured contact points and authored orientation share one
record band but carry different authority labels. Memory follows after a hard
semantic seam because it is relationship-scoped.

The supplied reference image supports the use of whitespace, small icons, and
grouped rows instead of an undifferentiated list. Its document and banking
sections are deliberately rejected: they are unrelated to Talent Signal's
purpose and would normalize excessive collection.

### Responsive behavior

On narrow screens the identity remains first, followed by two 44-pixel-class
actions, the current dependency, authored orientation, and contact points.
Memory sections become one column. History stays collapsed. Values wrap; name,
source, deadline, ambiguity, and action effect never rely on truncation alone.
The persistent desktop Agent rail becomes the existing focused mobile Agent
surface rather than squeezing beside the record.

### State behavior

- Loading preserves the page skeleton without inventing cached truth.
- Empty optional fields are hidden; an entirely empty record offers one
  purpose-bound "Add information" action.
- Proposed, confirmed, contested, expired, superseded, and deleted remain
  textually distinct, with color as reinforcement only.
- A contact value opens its source/history. A Memory item opens its exact
  dependencies. A proposed action opens a separate effect review.
- Failure preserves input and says which state did not change.
- Deletion and authorization loss retract dependent current projections and
  retain only the audit references policy allows.

## Agent Tools contract

The Agent coordinates typed capabilities; it does not edit the record through
DOM automation or free-form database writes.

| Tool | Read/write class | Result |
| --- | --- | --- |
| `read_person_record` | scoped read | current structured Person projection |
| `read_relationship_memory` | scoped read | snapshot-bound Memory plus dependencies |
| `propose_create_contact` | proposal | duplicate check and editable person/context draft |
| `propose_contact_patch` | proposal | before/after field patch with source and freshness |
| `attach_governed_source` | staged internal write | reviewed source receipt; facts remain proposed |
| `propose_memory_change` | proposal | typed relationship fact for field-level review |
| `compile_relationship_memory` | generated projection | cited snapshot; no new authority |
| `preview_person_merge` | proposal | ownership, conflicts, blockers, and reversal boundary |
| `propose_external_action` | proposal | exact target/effect preview; separate approval required |

The existing Agent already proves the first safe subset: staged contact
creation, source intake, pending-fact navigation, duplicate review, Memory
compilation, and operation receipts. Further tools should reuse the same
control plane and idempotent readback, not add a second Agent-owned store.

## Evaluation gates

### Product usefulness

- A recruiter identifies the person, relationship, current dependency, and
  next safe action within five seconds without reading Agent output.
- Creating a contact through Agent requires less repeated entry than a manual
  form while still catching same-name and current/historical handle conflicts.
- One person can participate in two searches without role-specific fields
  overwriting one another.
- `no_action` is complete and calm; the UI does not manufacture fields or work.

### Data and safety

- Every current contact point has field-level source and freshness, and no raw
  value appears in directory logs or broad readbacks.
- Authored profile, confirmed fact, model interpretation, action proposal, and
  observed outcome are visibly and technically distinct.
- Expiry, revocation, conflict, source deletion, identity correction, merge,
  retry, and reversal preserve provenance and current-state honesty.
- No page or Agent path ranks a person, infers sensitive traits, or performs an
  external effect without exact-effect approval and destination verification.

### UX and accessibility

- Semantic parity holds between People table and living person page.
- Long mixed-script names, missing avatar/profile/contact points, three contact
  points, stale evidence, and ambiguous identity remain legible.
- Keyboard order follows identity → actions → details → Memory → evidence;
  visible focus and non-color status labels are present.
- Desktop, 390-pixel mobile, dark mode, increased contrast, and reduced motion
  preserve meaning without horizontal overflow.
- History is available without dominating the current page.

## Reconsideration signals

Add configurable custom fields only after repeated field research demonstrates
a high-frequency, decision-relevant gap that cannot be expressed as stable
Person data or relationship-scoped memory. Add automatic enrichment only after
the product can show purpose, identity match, source terms, freshness,
retention, deletion, and recruiter approval before derived data becomes
usable.
