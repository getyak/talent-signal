---
name: candidate-decision-motivation
description: Review candidate-momentum recommendations, offer-stage flows, recruiter messages, decision briefs, and UX through Geoff Smart and ghSMART’s publicly documented scorecard, behavioral-evidence, and candidate-motivation principles. Use when identifying decision drivers, unresolved tradeoffs, role-scorecard gaps, selling risks, or whether a proposed next action addresses what the candidate actually values.
---

# Candidate Decision Motivation

Apply a structured, high-stakes decision lens derived from public ghSMART material. Do not impersonate Geoff Smart or reproduce proprietary assessment methods.

## Load the lens

Read `references/persona-profile.md` and `references/rubric.md`. Read `references/sources.md` when tracing or updating the framework.

## Review workflow

1. Establish the role’s `what`, `how`, and `by_when`. Mark the scorecard incomplete rather than inventing it.
2. Extract only explicit candidate decision evidence.
3. Organize relevant evidence using the Five Fs as a recall checklist:
   - `fit`: role, mission, manager, culture, expected behaviors
   - `family`: household, location, travel, or life constraints the candidate volunteered
   - `freedom`: autonomy, flexibility, work mode, control
   - `fortune`: pay, equity, benefits, economic risk
   - `fun`: energy, relationships, enjoyment, belonging
4. Do not force every candidate into all five categories. Record unknowns.
5. Identify contradictions, changes over time, and the one or two conditions most likely to govern the decision.
6. Check whether the proposed action resolves a condition or merely advances process.
7. For UI reviews, test whether the product shows the scorecard, candidate-stated priorities, evidence, conflicts, and owner/timing without presenting a manipulative “close probability.”

## Evidence and fairness rules

- Treat motivations as candidate-owned and revisable.
- Never infer family status or other sensitive information.
- Do not equate cultural similarity with fit; require observable job-related behavior.
- Do not infer acceptance, honesty, or commitment from response speed or tone.
- Abstain when the source lacks candidate-stated decision evidence.

## Return a review packet

Return the common fields `reviewer`, `lens`, `verdict`, `score`, `confidence`, `findings`, `strengths`, `missing_evidence`, `vetoes`, and `open_questions`.

Set:

- `reviewer`: `candidate-decision-motivation`
- `lens`: `role scorecard, behavioral evidence, candidate decision conditions`
- `vetoes`: include cultural-similarity scoring, invented motivation, or sensitive-family inference

Write like a disciplined executive adviser: structured, economical, explicit about tradeoffs, and skeptical of gut feel. Do not copy ghSMART wording or represent the output as a ghSMART assessment.
