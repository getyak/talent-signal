# ADR 0005: Agent-operated relationship workspace

## Status

Accepted for the default Web workspace.

## Context

Recruiters usually enter Talent Signal with an immediate intent: recover a
person before a conversation, preserve a new source, resolve a changed fact, or
prepare the next move. The earlier Web structure treated Chat, People, and
Captures as separate destinations. That made Chat a generated-summary page and
forced the recruiter to reconstruct how a response related to the person,
evidence, and proposed state change.

A full command canvas with separate chat, object, run-inspector, and source
timeline panels would make complex identity investigation and research visible,
but it imposes cockpit-level density on ordinary relationship work.

## Decision

Use a relationship editor as the default desktop composition:

- a narrow global rail changes product-level scope;
- a persistent Agent surface is bound to the selected person and relationship
  context;
- the living person page remains visible beside it and owns structured state,
  evidence review, and action approval;
- Agent navigation and scoped reads may complete directly;
- compilation returns cited artifacts pinned to governed snapshots;
- internal changes appear as staged updates on the affected object before they
  become reviewed state;
- external effects retain separate preview, approval, execution, and outcome
  verification.

The Agent operates through typed product capabilities rather than arbitrary DOM
automation. Its visible states describe the operation, affected object, and
authority boundary. Generated reasoning is not presented as authority or
product state.

On small screens, the Agent may take the first viewport because it is the
highest-frequency intent surface. The person page and review surfaces remain
directly reachable and use the same canonical relationship state.

Identity ambiguity stays in this same composition. The Agent may present
current and historical owners as a compact comparison, but it cannot preselect
a person or make a historical owner actionable while another person has
current source-linked authority. The recruiter can keep the source unresolved;
only an explicit current relationship choice changes the staged operation to
source attachment.

## Consequences

### Benefits

- intent and structured truth remain in one visual context;
- a proposed change can move from Chat to the exact review surface without a
  second search;
- creating a person begins with an explicit relationship context and governed
  source rather than an empty CRM record;
- the same typed operation model can serve Web, mobile, browser capture, and
  future external Agents;
- trust is expressed through provenance, staging, and receipts instead of Agent
  spectacle.

### Costs

- the Agent panel consumes persistent desktop width and needs deliberate
  responsive behavior;
- operation state, object state, and conversation state must be synchronized
  without turning Chat into the system of record;
- complex research and identity-resolution tasks may still need a denser,
  temporary workbench.

## Rejected alternatives

### Chat, People, and Captures as peer destinations

Rejected as the default because it separates intent from the object being read
or changed and makes the user perform the relationship between screens.

### Full command canvas as the ordinary workspace

Rejected as the default because its run inspector and source timeline add
constant density for work that normally needs one person, one change, and one
next step. It remains a possible advanced mode for bounded research, identity
resolution, merge review, and conflict investigation.

### Agent-controlled DOM automation

Rejected because hidden page manipulation is difficult to authorize, validate,
replay, and reverse. Typed capabilities preserve scope and make effects
testable.

## Reconsider when

Revisit the composition if field evidence shows that recruiters spend more
time in structured batch comparison than relationship-specific intent, the
persistent panel materially reduces reading or accessibility, or advanced
research and identity work becomes the dominant daily task.

## Canonical sources

Current experience truth lives in [Design system](../design-system.md). Agent
authority and capability classes live in [Agent system](../agent-system.md).
The canonical working object lives in [Product](../product.md).
