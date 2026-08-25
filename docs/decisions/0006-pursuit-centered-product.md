# ADR 0006: Pursuit-centered product

## Context

The relationship-intelligence foundation can explain what changed around a
person, but it cannot consistently answer what business or recruiting outcome
that change should advance. A contact-first or relationship-first navigation
therefore risks becoming a polished reminder system without a clear definition
of progress.

## Decision

Make a `Pursuit` the primary V1 working context: one target outcome with a time
horizon, contextual people and organizations, criteria, evidence-backed gaps,
and owned actions.

Recruiting and executive search are the complete flagship template. A thin
sales fixture may validate that the contract is reusable, but V1 does not build
a general CRM or a parallel sales domain.

Person identity and governed evidence remain stable across Pursuits. Roles,
claims, gaps, and actions remain scoped. Today, Pursuits, and People become the
primary mobile retrieval surfaces; evidence stays reachable from the decision
that depends on it instead of becoming a top-level browsing destination.

## Alternatives considered

- Keep Relationship as the primary object: preserves the current prototype but
  leaves outcome and progress implicit.
- Build a recruiting-only ATS object model: sharpens the first scenario but
  collapses long-lived identity and relationship context into a pipeline.
- Build a configurable general CRM: maximizes hypothetical range while making
  the first complete evidence-to-outcome loop too broad to verify.

## Consequences

- canonical contracts must add Pursuit outcome, role, criterion, gap, action,
  revision, and template semantics without duplicating people or evidence;
- iOS navigation and fixtures must move from Today/People/Library to
  Today/Pursuits/People;
- Agent context and proposals must carry a Pursuit scope but gain no new write
  authority;
- progress is evidenced by resolved gaps or completed actions, never a score of
  a person or relationship;
- existing relationship, identity, provenance, recovery, and deletion controls
  remain prerequisites rather than discarded prototype work.

## Reconsider when

Revisit the flagship template if design-partner behavior shows repeated paid
value in another Pursuit type and little recruiting use. Revisit the abstraction
if the recruiting loop repeatedly requires domain behavior that cannot be
expressed without type checks or if users cannot explain the Pursuit model in
field testing.
