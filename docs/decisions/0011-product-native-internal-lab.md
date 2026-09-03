# ADR 0011: Make Internal Evaluation a Product-Native Lab

## Status

Accepted.

## Context

A conventional debug menu makes environment and feature controls accessible,
but it does not make a product result understandable or reproducible to a
cross-functional tester. Talent Signal also cannot let debugging shortcuts
collapse observation, interpretation, confirmed state, and action authority.

The existing evaluation control plane can store account-scoped traces and
annotations. It needs a product-level entry point that connects a visible
experience to an exact synthetic evidence snapshot, version envelope, and
review decision without importing production candidate data.

## Decision

Internal builds expose Talent Signal Lab as four user tasks: identify the
current world, replay a named scenario, inspect why a result appeared, and
record an issue.

A Lab Session binds one repository-owned scenario revision, frozen synthetic
evidence hash, disposable Lab workspace, test identity, and baseline/candidate
version envelopes. A replay produces an immutable Lab Run and account-scoped
Trace. Baseline comparison is valid only when both runs use the identical
snapshot.

Signal Lens displays observation, system interpretation, uncertainty, evidence
status, and runtime provenance as distinct layers. It explains persisted
product output and never exposes hidden reasoning or upgrades an interpretation
to confirmed state.

A Reality Receipt freezes the scenario, output, versions, Trace reference,
canonical revision, and a structured redacted surface snapshot. It becomes a
versioned, candidate-blocking `human_gold` Eval Case only after an explicit
human promotion decision. Lab mutation contracts accept only resource
identifiers and typed decisions; receipt summaries and promotion notes are
derived from synthetic scenario state rather than tester-authored free text.

Lab persistence is a separate quality-control namespace. Database constraints
keep canonical mutation and external-effect counts at zero. The runtime never
queries or clones production candidate evidence. The backend capability is off
in production and must be explicitly enabled by an internal deployment.

## Consequences

- Testers work with recognizable product situations instead of assembling
  arbitrary flag combinations.
- A subjective issue can become reproducible evidence with exact lineage.
- Normal authenticated accounts may own Lab quality records on an enabled
  internal deployment, but their product data never enters a Lab scenario.
- TestFlight can exercise the real authentication boundary without enabling
  simulated login or weakening production deployment defaults.
- Full time travel, packet capture, arbitrary flag composition, raw screenshot
  retention, and bearer-token copying remain outside this decision.

## Reconsider when

Reconsider the fixed-scenario boundary when repeated evaluation needs cannot be
represented without combinatorial explosion and a safe typed scenario composer
has demonstrated clear value. Reconsider receipt content only when redaction,
retention, deletion, and model-exposure behavior can be proven end to end.

## Verification owners

Contracts and database constraints own object shape and zero-effect
invariants. Scenario tests own deterministic replay behavior. The Web surface
owns progressive explanation and explicit promotion. Deployment configuration
owns the internal-on, production-off capability boundary.
