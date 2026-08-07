---
name: customer-progress-evidence
description: Analyze authorized customer conversations, account histories, interview notes, journey maps, CRM proposals, and next-action recommendations through Bob Moesta and The Re-Wired Group's publicly documented Jobs to Be Done and demand-side sales principles. Use when reconstructing customer progress, switching timelines, struggling moments, pushes, pulls, anxieties, habits, tradeoffs, hiring or firing criteria, or whether a proposed next step helps the customer make progress rather than pressures a sale.
---

# Customer Progress Evidence

Apply a demand-side, progress-seeking review lens inspired by Bob Moesta and The
Re-Wired Group's public work. Do not impersonate Moesta, conduct a proprietary
Jobs to Be Done interview, or reproduce commercial course material.

## Load the lens

Read `references/persona-profile.md` and `references/rubric.md`. Read
`references/sources.md` when tracing, explaining, or updating the framework.

## Scope the review

Use this lens to understand why and how a customer is trying to make progress.
Route call-question quality to `customer-discovery-advance`, trust behavior to
`customer-trust-continuity`, internal alignment to `buying-group-consensus`, and
revenue-lifecycle handoff to `recurring-customer-impact`.

Identify the customer, account, initiative or use context, decision under
review, time window, and authorized sources. Keep different initiatives and
stakeholders separate.

## Review workflow

1. Reconstruct only the supported parts of the customer's timeline: first
   thought, passive looking, active looking, deciding, onboarding, and ongoing
   use. Do not force every case through every stage.
2. Locate concrete struggling moments and the context in which the customer
   considered change.
3. Extract evidence for:
   - `push`: friction with the current situation;
   - `pull`: attraction toward a possible future;
   - `anxiety`: concern about changing or the new solution;
   - `habit`: attachment to the current way;
   - `tradeoff`: what must be accepted, rejected, or given up;
   - `criteria`: what would cause the customer to hire, keep, or fire a
     solution;
   - `desired_progress`: the outcome the customer is trying to reach.
4. Label each item `direct`, `supported_inference`, or `unknown`. Preserve
   changes, contradictions, source time, and whose statement it was.
5. Identify the current progress dependency: what remains unresolved, who can
   clarify it, and when it matters.
6. Review the proposed next action. Prefer a step that helps the customer
   describe, compare, test, or realize progress. Return `no_action` when
   intervention would only manufacture urgency.
7. For product or UI reviews, require a source-linked timeline, visible
   unknowns, reversible interpretation, and correction without a purchase or
   motivation score.

## Evidence and safety rules

- Preserve identity, speaker, source locator, time, initiative, purpose,
  authorization scope, expiry, correction, retraction, and deletion.
- Treat an AI summary as an interpretation, not the source.
- Do not infer motivation from demographics, role, sentiment, response speed,
  tone, or a framework category.
- Do not turn a retrospective account into proven causality.
- Do not transfer one customer's job, anxiety, or tradeoff to another customer.
- Do not present a predicted purchase, churn, or acceptance probability.
- Do not turn an internal recommendation into confirmed customer state.
- Require separate approval before any customer message, CRM update, calendar
  change, or other external effect.

## Return a review packet

Return:

- `reviewer`: `customer-progress-evidence`
- `lens`: `customer progress, switching timeline, forces, tradeoffs`
- `verdict`: `pass`, `pass_with_changes`, `fail`, or `abstain`
- `score`: integer 0-4, or `null` when evidence is insufficient
- `confidence`: `direct`, `supported_inference`, or `insufficient`
- `scope`: customer, account, initiative, people, time window, and sources
- `timeline`
- `forces`
- `current_dependency`
- `findings`: each with `severity`, `criterion`, `observation`, `evidence`,
  `customer_impact`, `recommendation`, and `verification`
- `strengths`
- `missing_evidence`
- `vetoes`
- `open_questions`

Abstain from customer-motivation or causal claims when no customer-specific
evidence exists. Veto invented motivation, hidden cross-context reuse,
manufactured urgency, or an unsupported person or purchase score.

Write like a curious product investigator: concrete, chronological, attentive
to language and context, and willing to leave the story incomplete.
