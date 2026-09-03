# Project knowledge map

This directory is a retrieval system, not a memory dump. Read the smallest
branch that can answer the current question.

## Canonical foundation

These documents describe durable project truth. They should remain concise,
stable, and free of implementation-level detail.

| Question | Canonical document |
| --- | --- |
| Why should this product exist? | [Principles](principles.md) |
| Who is it for and what does it do? | [Product](product.md) |
| What owns truth and where are the boundaries? | [Architecture](architecture.md) |
| How do agents participate safely? | [Agent system](agent-system.md) |
| How does one capture become one safe action? | [Capture to action](capture-to-action.md) |
| What should the product feel like? | [Design system](design-system.md) |
| What should be built next? | [Delivery](delivery.md) |
| Which integrations are allowed? | [Integrations](integrations.md) |

Read only the documents needed for the task. For example, a visual change
usually needs Product and Design System, while a retention change needs
Architecture and Agent System.

## How the project works

- [Documentation system](documentation.md): where knowledge belongs, how it is
  written, and how it is pruned.
- [Wiki authoring workflow](wiki-workflow.md): how raw sources, notes, and LLM
  drafts are compiled into checked, bidirectionally linked pages.
- [Codex work system](codex-work-system.md): how plans, goals, verification,
  skills, memory, worktrees, and recurring work fit together.
- [`AGENTS.md`](../AGENTS.md): small always-on repository guidance.
- [`PLANS.md`](../PLANS.md): resumable plan contract for substantial work.
- [`REVIEW.md`](../REVIEW.md): outcome and safety review standard.

## Decision records

[`decisions/`](decisions/) preserves why consequential choices were made.
Decisions should describe context, choice, consequences, and reconsideration
signals. They should not become parallel architecture specifications.

## Research

[`research/`](research/) contains evidence, market scans, and external-system
comparisons. Research may be detailed because it is loaded selectively. It
does not override canonical project decisions until those decisions are
updated.

- [Cloud screenshot processing privacy](research/cloud-screenshot-processing-privacy.md):
  China-first cloud-model, recruiter-data, retention, deletion, and hiring-AI
  release boundaries.
- [Recruiter discovery and relationship-continuity wedge validation](research/recruiter-discovery-and-wedge-validation.md):
  separates concept feedback from field evidence and defines the bilateral
  recruiter interview and concierge-test protocol.
- [Talent Signal Agent module blueprint](research/talent-signal-agent-module-blueprint.md):
  maps the current executable control plane to the smallest durable Agent
  runtime proposal without granting models domain or effect authority.
- [Agent public-web tooling](research/agent-public-web-tooling.md): separates
  search, fetch, citations, provider management, credentials, and draft
  research authority.
- [Living contact page and relationship memory](research/living-contact-page-and-memory.md):
  separates stable person data, relationship-scoped memory, episodic history,
  and typed Agent tools for the Web People experience.
- [Agent CRM competitive design and integration research](research/agent-crm-competitive-design-and-integrations.md):
  compares Kin, Mesh, Ohai, and Paired, then records current platform import
  boundaries, source-state semantics, and ranked UX risks.
- [Agent-driven relationship CRM dossier](research/agent-crm-product-engineering-dossier.md):
  defines the product decision, governed object model, mobile information
  architecture, import pipeline, delivery sequence, and evaluation program.
- [iOS relationship library design benchmark](research/ios-relationship-library-design-benchmark.md):
  compares the mobile relationship workspace with adjacent products and records
  the current row-swipe, long-press, dismissal, motion, and navigation-gesture
  decision.

## Operations and evaluation

- [`operations/`](operations/) contains recurring operational expectations.
- [Production backend operations](operations/backend-production.md) defines the
  no-seed PostgreSQL, migration, API, and HTTPS deployment boundary.
- [Secret delivery](operations/secrets.md) defines Infisical ownership, local
  injection, workload identity, environment isolation, and rotation.
- [Internal TestFlight backend on Tailscale](operations/testflight-local-backend.md)
  defines the owner-operated Mac, loopback, tailnet, and no-seed testing
  boundary.
- [`evaluations/`](evaluations/) contains dated review evidence and generated
  findings.
- Editable architecture sources and rendered diagrams live beside the
  canonical document that explains them.

These materials support verification. They are not default context.

## Authority order

When documents disagree:

1. current user intent and applicable safety policy;
2. `AGENTS.md`;
3. canonical foundation documents;
4. accepted decision records;
5. current code, tests, and observed product behavior;
6. operations and evaluations;
7. research and historical material.

Resolve meaningful contradictions instead of silently choosing one source.
