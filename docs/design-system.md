# Design system

> Quiet relational intelligence for evidence-first recruiting.

## Design thesis

Talent Signal should feel like a well-edited professional notebook with the
precision of an evidence instrument.

It is not an ATS dashboard, an AI command center, a sales CRM with candidate
labels, or a collection of decorative cards.

The design helps the recruiter move through:

> evidence → change → dependency → next action → outcome

without making the system feel more important than the relationship.

## Ownable causal grammar

The product should make its governing relationship visible, not merely describe
it. On a public proof surface, exact source evidence and the proposed
relationship change belong in one composition, joined by a clear causal seam.
Removing or contesting source evidence must retract the interpretation and any
dependent action.

The vermilion redline is that seam. It marks a consequential, reviewable change
between what was said and what may become current understanding. It is not a
decorative progress indicator, generic brand stripe, or confidence signal.

Prefer product behavior as trust evidence. Photography, abstract diagrams, and
polished containers cannot substitute for showing provenance, correction,
separate fact confirmation, separate action approval, and observed outcome.

## Experience principles

### Evidence before interpretation

Show what was observed before what the system thinks it means. Decision-relevant
claims should open their source and history without forcing the user into an
audit interface for ordinary work.

### Change before completeness

Lead with what changed since the recruiter last understood the relationship.
Do not require a complete profile before the next useful decision can be made.

### Dependency before score

Make the current unresolved dependency legible. Never compress a person into a
quality, fit, risk, or probability score.

### One calm next step

Prefer one timely action with a clear reason over a wall of recommendations.
`no_action` should feel intentional, not empty.

### Control at consequence

Keep routine reading light. Increase explicitness as consequence increases:
evidence correction, fact confirmation, action approval, and recovery deserve
progressively stronger attention.

### History without clutter

The current state should be simple, while prior values, conflicts, corrections,
and outcomes remain available through progressive disclosure.

## Information model

The canonical working object is a person within a selected relationship or
assignment context.

The primary surfaces answer different questions:

| Surface | Question |
| --- | --- |
| Today | What deserves attention now? |
| Library | Who or what am I looking for? |
| Candidate page | What is currently true in this assignment? |
| Timeline | How did understanding and action change? |
| Evidence review | What supports or contradicts this state? |
| Relationship graph | Which connections matter to this question? |

These are views, not competing records.

## Attention hierarchy

Within a page, prioritize:

1. identity and current context;
2. the meaningful change or dependency;
3. exact supporting evidence;
4. the smallest next action;
5. history, alternatives, and deeper analysis.

AI provenance should be visible but secondary. The interface should describe
the work, not advertise that AI exists.

## Visual character

Use:

- quiet warm neutrals;
- one restrained vermilion accent for consequential attention;
- soft semantic distinction for evidence, confirmation, uncertainty, and
  verified outcome;
- strong typography and spacing before borders or elevation;
- surfaces that feel composed rather than tiled;
- motion only when it explains a state transition.

Exact tokens, typography choices, breakpoints, and component behavior belong in
the implementation. The surrounding product is the reference for density and
idiom.

Avoid:

- generic gradients and glowing AI decoration;
- excessive glass, shadows, and floating panels;
- large KPI dashboards for a relationship workflow;
- unexplained color as the only state signal;
- animated confidence or candidate ranking;
- hiding critical evidence behind novelty interactions.

## State language

The design must distinguish:

- proposed;
- ambiguous;
- edited;
- confirmed;
- dismissed;
- approved;
- executing;
- verified;
- failed;
- unknown;
- expired;
- contested;
- superseded.

Use plain language that describes what the user can do next. Never make a
failed or uncertain state look complete.

## Candidate page

The living page is a current, assignment-scoped explanation of the
relationship. It should combine:

- the current dependency;
- confirmed decision drivers;
- open questions and contradictions;
- recent meaningful changes;
- action and outcome history;
- one next step when appropriate.

It is a governed projection, not a permanent generated essay. The user should
be able to reach exact evidence and earlier state from every important claim.

## Timeline

The timeline is the trust surface. It explains what was observed, what changed,
who decided, what action occurred, and what result was seen.

Group low-value system mechanics so human decisions and relationship changes
remain legible.

## Relationship graph

Use the graph only when connections answer a real question, such as influence,
introduction path, prior collaboration, or assignment context.

The graph should reveal provenance and scope. It should not imply social value
or turn weak associations into authoritative relationships.

## Surface adaptation

### Mobile

Optimize for capture, one-thumb review, Today, interruption, and device-owned
action.

### Desktop

Optimize for comparison, provenance, conflict resolution, research, and
longitudinal editing.

### Channel

Optimize for concise capture, status, and handoff. Do not compress high-risk
review into a chat reply.

## Accessibility and privacy

- Preserve meaning without relying on color alone.
- Keep text and controls legible at platform accessibility sizes.
- Make focus, keyboard, screen-reader, and reduced-motion behavior first-class.
- Avoid private conversation content in generic notifications or previews.
- Let the user understand retention, source access, and deletion consequences.

## Review questions

- Can the recruiter identify what changed within a few seconds?
- Can they inspect why the system believes it?
- Is fact review distinct from action approval?
- Is one current dependency more prominent than broad analysis?
- Can the user correct, decline, recover, and delete?
- Does the design preserve human dignity and avoid person-scoring?
- Does the surface feel specific to trusted recruiting work?

Functional audits gate release but do not establish design quality. Responsive,
accessibility, performance, and test results cannot prove that a direction is
distinctive or preferred. For a consequential visual change, compare at least
two rendered structural directions against product truth, logo-off ownability,
five-second clarity, and accessibility risk before spending effort on
micro-detail.

See [Product](product.md) and [Capture to action](capture-to-action.md).
