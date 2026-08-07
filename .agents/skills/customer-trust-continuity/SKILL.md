---
name: customer-trust-continuity
description: Audit authorized customer relationship histories, sales messages, follow-up plans, service recovery, account reviews, automation, and next-action proposals through Charles H. Green and Trusted Advisor Associates' publicly documented trust-based relationship principles. Use when examining credibility, reliability, relational safety, self-orientation, reciprocity, promises, candor, conflicts of interest, trust rupture, or repair without assigning a synthetic trust score.
---

# Customer Trust Continuity

Apply a relationship-first review lens inspired by Charles H. Green and Trusted
Advisor Associates' public work. Review observable trust-relevant behavior; do
not impersonate Green, reproduce the Trust Quotient diagnostic, or claim to
measure what another person privately feels.

## Load the lens

Read `references/persona-profile.md` and `references/rubric.md`. Read
`references/sources.md` when tracing, explaining, or updating the framework.

## Scope the review

Use this lens for the quality and continuity of a commercial relationship.
Route buying progress to `customer-progress-evidence`, discovery structure to
`customer-discovery-advance`, group alignment to `buying-group-consensus`, and
customer-impact handoff to `recurring-customer-impact`.

Name the customer relationship, initiative, affected people, time window, and
authorized sources. Do not flatten trust across accounts, initiatives, or
individuals.

## Review workflow

1. Build a chronological ledger of relevant events: promise, owner, due time,
   delivery or failure, correction, disclosure, recommendation, customer
   response, and observed recovery.
2. Review evidence through four public trustworthiness factors:
   - `credibility`: accuracy, competence, candor, and limits;
   - `reliability`: promises, consistency, timing, and follow-through;
   - `relational_safety`: whether difficult information can be raised and
     handled respectfully;
   - `self_orientation`: whether seller goals dominate customer interests.
3. Inspect the interaction sequence: engage, listen, frame, envision, commit.
   Flag framing, pitching, or commitment that occurs before adequate listening.
4. Surface conflicts of interest, concealed incentives, selective disclosure,
   and pressure. Separate an honest commercial interest from customer-hostile
   self-orientation.
5. Identify any rupture: what occurred, whose interpretation it is, what harm
   is observable, and what remains unknown. Never infer distrust from silence,
   tone, response delay, or sentiment.
6. Propose the smallest repair or trust-preserving action: acknowledge, correct,
   disclose, keep a promise, reset an expectation, offer a real choice, or
   `no_action`.
7. For product or UI reviews, require provenance, promise status, correction,
   ownership, undo, and a human approval path without a relationship-health
   score.

## Evidence and safety rules

- Preserve identity, speaker, source locator, time, initiative, purpose,
  authorization scope, expiry, correction, retraction, and deletion.
- Describe trustworthiness-relevant behavior, not a person's inner trust state.
- Do not infer intimacy, vulnerability, emotion, or relationship strength from
  private or sensitive information.
- Do not recommend synthetic vulnerability, faux empathy, deceptive
  personalization, or reciprocity pressure.
- Do not turn the Trust Equation into an automated customer or seller score.
- Do not prescribe recommending a competitor as a universal trust tactic; use
  customer interest and honest fit as the governing principle.
- Preserve disagreements and customer corrections as evidence.
- Require separate approval before customer communication, CRM writes,
  concessions, refunds, or other external effects.

## Return a review packet

Return:

- `reviewer`: `customer-trust-continuity`
- `lens`: `credibility, reliability, relational safety, client orientation`
- `verdict`: `pass`, `pass_with_changes`, `fail`, or `abstain`
- `score`: integer 0-4, or `null` when evidence is insufficient
- `confidence`: `direct`, `supported_inference`, or `insufficient`
- `scope`: customer, account, initiative, people, time window, and sources
- `promise_ledger`
- `rupture_or_risk`
- `repair_or_preservation_step`
- `findings`: each with `severity`, `criterion`, `observation`, `evidence`,
  `relationship_impact`, `recommendation`, and `verification`
- `strengths`
- `missing_evidence`
- `vetoes`
- `open_questions`

Abstain from claims that a customer trusts or distrusts someone unless the
customer states it in the authorized context. Veto deception, concealed
material conflict, coercive reciprocity, invented emotional state, or a
synthetic trust or relationship score.

Write with candor, restraint, and client focus. Prefer a kept promise or honest
correction over polished relationship language.
