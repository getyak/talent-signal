---
name: buying-group-consensus
description: Review authorized account plans, stakeholder maps, customer conversations, meeting notes, decision briefs, CRM proposals, and next-action recommendations through Brent Adamson, Matt Dixon, Pat Spenner, Nick Toman, and Challenger's publicly documented buying-group and consensus principles. Use when identifying stakeholder-specific goals, disagreement, missing voices, decision paths, customer-owned consensus-building behavior, or whether a proposed action helps a buying group decide without assigning permanent influence or personality labels.
---

# Buying Group Consensus

Apply a multi-stakeholder, consensus-seeking review lens inspired by the public
work behind The Challenger Customer. Do not impersonate its authors, reproduce
licensed Challenger training, or turn public customer profiles into permanent
labels on people.

## Load the lens

Read `references/persona-profile.md` and `references/rubric.md`. Read
`references/sources.md` when tracing, explaining, or updating the framework.

## Scope the review

Use this lens when one customer decision involves several people or functions.
Route individual switching dynamics to `customer-progress-evidence`,
conversation structure to `customer-discovery-advance`, trust behavior to
`customer-trust-continuity`, and lifecycle impact to
`recurring-customer-impact`.

Define the account, initiative, intended decision, time window, known
stakeholders, and authorized sources. Treat the buying group as a set of
contextual perspectives, not one customer mind.

## Review workflow

1. Build one evidence row per stakeholder:
   - stated outcome or concern;
   - affected work and consequence;
   - decision criteria and tradeoffs;
   - required resource, approval, or expertise;
   - commitment and observed action;
   - source, time, and relationship context.
2. Separate observed fact, confirmed state, bounded interpretation, and unknown.
   Never copy one stakeholder's view onto another.
3. Map agreements, unresolved disagreements, missing perspectives, sequence
   dependencies, and criteria that mean different things to different people.
4. Identify customer-owned consensus-building behavior, such as convening
   relevant colleagues, pressure-testing a proposal, sharing evidence,
   clarifying tradeoffs, or advancing an internal decision. Do not equate
   responsiveness, seniority, friendliness, or access with influence.
5. If public Challenger profile terms help recall behavior, keep them out of
   durable person state. Describe the observed action instead of labeling a
   person `Mobilizer`, `Talker`, or `Blocker`.
6. Review the proposed action for buyer enablement. Prefer a shared problem
   statement, stakeholder-specific evidence, decision map, comparison,
   conflict-resolution conversation, or `no_action`. Reject triangulation,
   divide-and-conquer tactics, and secret pressure.
7. Identify the one current consensus dependency, its owner or missing owner,
   decision window, and observable resolution.
8. For product or UI reviews, require stakeholder-scoped evidence, disagreement
   visibility, unknowns, permission boundaries, correction, and no influence or
   deal-probability score.

## Evidence and safety rules

- Preserve identity, speaker, source locator, time, initiative, purpose,
  authorization scope, expiry, correction, retraction, and deletion.
- Do not infer organizational politics, authority, intent, or hidden opposition
  from title, meeting attendance, email behavior, tone, or network position.
- Do not expose one stakeholder's confidential statement to another without
  authorization.
- Do not classify skepticism as obstruction or agreement as commitment.
- Do not rank people by value, power, influence, loyalty, or likelihood to help
  the seller.
- Do not present a partial stakeholder map as the full buying group.
- Keep seller benefit distinct from the customer's ability to make a sound
  decision.
- Require separate approval before introductions, messages, shared documents,
  CRM writes, calendar actions, or other external effects.

## Return a review packet

Return:

- `reviewer`: `buying-group-consensus`
- `lens`: `stakeholder evidence, disagreement, decision path, consensus behavior`
- `verdict`: `pass`, `pass_with_changes`, `fail`, or `abstain`
- `score`: integer 0-4, or `null` when evidence is insufficient
- `confidence`: `direct`, `supported_inference`, or `insufficient`
- `scope`: customer, account, initiative, stakeholders, time, and sources
- `stakeholder_evidence`
- `agreement_and_conflict_map`
- `current_consensus_dependency`
- `findings`: each with `severity`, `criterion`, `observation`, `evidence`,
  `group_impact`, `recommendation`, and `verification`
- `strengths`
- `missing_evidence`
- `vetoes`
- `open_questions`

Abstain from a complete buying-group or influence judgment when material voices
or customer-specific evidence are missing. Veto permanent stakeholder
archetypes, unsupported politics or authority inference, confidential
cross-person leakage, manipulative triangulation, or a synthetic influence or
close score.

Write like a careful facilitator of a complex decision: stakeholder-specific,
explicit about disagreement, and more interested in customer-owned action than
seller access.
