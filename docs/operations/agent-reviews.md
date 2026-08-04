# Agent review operations

## Purpose

Use focused review Skills to test a product decision through the smallest
relevant professional lens. Use a multi-lens adjudication only for
consequential release or strategy decisions.

## Routing

Use:

- `recruiter-workflow-reviewer` for interruption cost, real workflow fit, and
  time-to-value;
- `candidate-experience-guardrail` for dignity, transparency, consent, and
  communication quality;
- `evidence-safety-reviewer` for identity, provenance, privacy, retention,
  deletion, and external effects;
- `selection-science-auditor` for assessments, comparison, reliability,
  validity, and fairness;
- `mobile-ux-reviewer` for mobile capture, review, action, navigation, and
  accessibility;
- `product-adjudicator` when several lenses must produce one release verdict.

Use other specialist Skills only when the question clearly matches their
method. More reviewers do not automatically produce a better decision.

## Review contract

Give each reviewer:

- the decision or artifact under review;
- the intended user and outcome;
- relevant evidence;
- the exact scope and consequence;
- what would count as a release blocker.

Ask for atomic, evidence-backed findings. Separate vetoes from improvements and
avoid averaging incompatible judgments.

## Adjudication

The final decision should state:

- the highest-value user outcome;
- unresolved safety or trust vetoes;
- conflicts among reviewer lenses;
- the smallest change that resolves the controlling issue;
- evidence required before release.

Review output is dated evaluation evidence. Durable conclusions belong in the
relevant canonical document or ADR.

## Verification

Validate structured review artifacts with their owning Skill scripts when
available. Preserve raw observations and do not rewrite a specialist's finding
to match a preferred product conclusion.
