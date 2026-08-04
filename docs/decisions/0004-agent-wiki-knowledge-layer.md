# ADR 0004: Agent Wiki as a compiled knowledge layer

## Status

Accepted as the long-term memory boundary for human and Agent understanding.

## Context

Talent Signal must help a recruiter or Agent recover relationship context
across many sources, events, assignments, and prior runs.

Raw evidence is too detailed for orientation. Versioned facts and outcomes are
precise but do not by themselves explain a relationship, a research trail, or
an unresolved decision. A model session or compacted transcript is convenient
working state but cannot provide durable authority, access control, deletion,
or reproducibility.

Treating a Wiki only as presentation would discard a useful Agent-readable
knowledge interface. Treating generated Wiki prose as the system of record
would allow summaries and unsupported inferences to compound into apparent
truth.

## Decision

Maintain a versioned Agent Wiki as a compiled semantic layer shared by people
and Agents.

The Wiki is a primary interface for navigation, retrieval, synthesis, and
longitudinal understanding. The governed sources underneath it remain:

- intentionally captured evidence;
- reviewed temporal fact and event versions;
- observed external outcomes;
- approved procedural knowledge;
- sourced research artifacts with explicit freshness.

Pages are composed from addressable knowledge blocks with enough provenance,
status, time, scope, and sensitivity information to resolve a material claim
back to governed state. Human-readable pages, Agent-readable documents,
structured retrieval, search, and relationship navigation are representations
of the same knowledge layer rather than independent memories.

Retrieval proceeds from compact maps and summaries toward relevant blocks,
fact versions, and exact evidence. Each Agent run pins an immutable knowledge
snapshot and records a context manifest that explains what was included and
why.

An Agent may create an artifact or propose a Wiki patch against its snapshot.
It may not directly confirm a fact, overwrite governed history, approve a
consequential action, or turn a generated summary into authority. Accepted
changes update the appropriate governed source before compiling a new Wiki
version.

Authorization is enforced when knowledge is retrieved, not only when it is
indexed. Correction, expiry, permission change, retention, and source deletion
must propagate through pages, search indexes, embeddings, caches, snapshots,
and other registered derivatives.

## Consequences

### Benefits

- people and Agents share one navigable model of relationship context;
- progressive retrieval reduces prompt size without losing traceability;
- Agent runs remain explainable across compaction, pause, provider change, and
  resume;
- summaries can evolve without corrupting evidence or reviewed truth;
- the same knowledge can serve Web, iOS, search, research, and external Agents.

### Costs

- knowledge compilation, invalidation, and snapshot lifecycle become explicit
  backend responsibilities;
- every material block needs provenance and scope rather than free-floating
  prose;
- retrieval evaluation must test grounding, staleness, conflict, permissions,
  and deletion, not only semantic relevance;
- Agent-authored learning requires a patch and review path.

## Rejected alternatives

### Wiki as the system of record

Rejected because generated narrative obscures source identity, temporal
conflict, authority, and deletion lineage.

### Wiki as a human-only presentation layer

Rejected because it duplicates the most useful semantic organization while
forcing Agents to reconstruct context from low-level records on every run.

### Whole-Wiki prompting or vector retrieval alone

Rejected because unbounded context is costly and noisy, while similarity alone
does not establish authority, recency, scope, or support.

### Provider session as long-term memory

Rejected because provider state is runtime-specific, difficult to authorize
and delete precisely, and insufficient to reconstruct what governed state
supported a decision.

## Reconsider when

Revisit this decision if governed records can provide equally effective
progressive understanding without a compiled layer, or if measured retrieval
quality shows that the Wiki adds more staleness and ambiguity than useful
context.

The authority boundary should not be relaxed merely because a model or provider
offers a larger context window or persistent session.

## Canonical source

Current Agent memory and context truth lives in
[Agent system](../agent-system.md). System-of-record boundaries live in
[Architecture](../architecture.md).
