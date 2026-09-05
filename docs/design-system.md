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

Calendar scanning leads with time, person, and activity. Keep secondary
properties and inactive filters behind a named control; reveal an active filter
where it affects the view. Avoid repeating time, normal sync status, and scope
across stacked chrome and cards. Compactness removes repetition and framing,
not readable type or touch targets. Calendar views change time layout; filters
change which records appear. Preserve that distinction, and keep conflicts,
uncertain writes, and recovery visible when metadata is collapsed.

### Space is part of the hierarchy

Breathing room gives each mobile viewport one visual resting point and open
space before the next decision. Avoid feed frames, generic search, repeated
boundary prose, or decorative cards; prefer interaction when copy adds no decision.

## Information model

The canonical working object is a Pursuit with a target outcome, time horizon,
and governed resources. People are stable identities whose roles and evidence
remain scoped to each Pursuit.

The primary surfaces answer different questions:

| Surface | Question |
| --- | --- |
| Today | What deserves attention now? |
| Sessions | Which recent Agent conversation should I resume? |
| Pursuits | Which outcome am I trying to advance? |
| People | Who or what am I looking for? |
| Pursuit page | What outcome, milestone, gap, and action are current? |
| Candidate page | What is currently true for this person in this Pursuit? |
| Timeline | How did understanding and action change? |
| Evidence review | What supports or contradicts this state? |
| Relationship graph | Which connections matter to this question? |

Internal Lab surfaces use named scenarios and progressive explanation rather than loose flags; Signal Lens preserves the same evidence-before-interpretation grammar described in [ADR 0011](decisions/0011-product-native-internal-lab.md).

On mobile, Today is the default return surface when unread Agent work or an
evidence-supported Pursuit dependency deserves judgment. Sessions preserves
recent conversational intent, and People remains the stable cross-goal
retrieval destination. Pursuit rooms remain directly reachable without
competing for primary navigation. Evidence opens from its claim or record;
Today stays sparse with one lead dependency and a complete no-action state.

The Agent is a contextual threshold; Sessions retrieves conversations without owning truth or execution authority. On mobile, familiar top navigation owns
retrieval and one bottom global composer owns intent; never combine them.
Scope, capture, and record navigation follow intent. Text, one image, or voice
becomes proposed structure before consequential review stays explicit. Mobile and Web composers treat multi-stage marked text as provisional: input methods own candidate selection, and Send remains unavailable until the text is committed. Draft recovery preserves committed whitespace and line breaks, coalesces persistence for responsive input, and flushes at true lifecycle boundaries. A system permission overlay is not itself a background cancellation; protected capture begins only after authorization and an active foreground, while real backgrounding or audio interruption stops capture with truthful recovery feedback. Diagnostics record only closed lifecycle states, never message, transcript, person, or relationship content.

## Agent-operated relationship workspace

On desktop, the default working composition pairs a persistent, Pursuit-scoped
Agent surface with the Pursuit room and selected living person page. The Agent
owns intent and coordination; the governed pages own structured understanding
and review. Neither may obscure the other at the moment of a material decision.

Agent operations follow a visible consequence ladder:

- navigation and scoped reading may happen directly;
- compilation produces cited, snapshot-bound artifacts;
- internal relationship changes are staged on the affected object and remain
  reviewable and reversible;
- device or external writes require a separate exact-effect approval and
  verified result.

The interface should show the affected object and a compact operation receipt,
not hidden DOM automation or theatrical chains of thought. On small screens,
the Agent may expand into a focused temporary surface after explicit intent,
while stable navigation preserves direct access to Today, People, Library,
sources, and review state.

The rationale and rejected workspace structures are recorded in
[ADR 0005](decisions/0005-agent-operated-relationship-workspace.md).

### Inline identity comparison

Identity resolution is an Agent operation on the living relationship, not a
separate contact-management destination. When one clue yields several temporal
owners, use one compact comparison inside the Agent rail:

- order current source-linked authority before historical evidence;
- label the reason as `Current clue` or `Historical clue`, never as a person
  score or confidence ranking;
- do not preselect a person;
- keep historical evidence visible, but disable relationship and source
  attachment while another person is current;
- offer `Save for identity review` as a normal outcome when the recruiter
  cannot decide;
- keep `Create new person` unavailable while a current owner conflict exists;
- after explicit selection, change the staged operation and consequence copy
  before enabling submission.

On narrow screens, both temporal roles and their consequences should remain
visible without horizontal scrolling. State must use text and iconography in
addition to color. Wider comparison belongs in progressive disclosure only
when the compact decision lacks enough governed distinguishing evidence.

## Attention hierarchy

Prioritize identity and current context, then meaningful change or dependency,
exact supporting evidence, and the smallest next action. History, alternatives,
and deeper analysis follow.

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

Exact tokens, breakpoints, and component behavior belong in implementation;
the surrounding product is the reference for density and idiom.

Mobile reading preferences keep `Text size` and `Card density` independent. Text shifts only standard Dynamic Type categories and never reduces an accessibility category.
Density changes card spacing, shape, and avatars without shrinking controls below 44 points; Settings previews the result and compact is the retrieval default.
People and Sessions use independent stroked cards, concise title/context/recency metadata, and vertical accessibility fallbacks instead of source counts or answer excerpts.

On working surfaces, headings name the current object, date, state, or
decision within a bounded operational scale. Page and object titles never
behave like marketing heroes, and metadata remains legible rather than tiny.
Reserve narrative promises and oversized type for public proof or onboarding;
there too, evidence and interaction must carry the depth instead of empty space.

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

## Pursuit and candidate pages

The Pursuit page explains one target outcome. It leads with outcome, deadline, milestone, supported blockers, and the smallest next step before the broader resource map.

The living candidate page is a current, Pursuit-scoped explanation of the relationship. It should combine:

- the current dependency;
- confirmed decision drivers;
- open questions and contradictions;
- recent meaningful changes;
- action and outcome history;
- one next step when appropriate.

It is a governed projection, not a permanent generated essay. Every important claim should reach exact evidence and earlier state.

## Timeline

The timeline is the trust surface: what was observed, what changed, who decided, what action occurred, and what result was seen.

Group low-value system mechanics so human decisions and relationship changes remain legible.

## Relationship graph

Use the graph only when connections answer a real question, such as influence,
introduction path, prior collaboration, or assignment context.

The graph should reveal provenance and scope. It should not imply social value
or turn weak associations into authoritative relationships.

## Surface adaptation

### Mobile

Optimize for capture, one-thumb review, Today, interruption, and device-owned action.

Today, Sessions, and People form one horizontal pager. Pages follow the finger
while the measured top indicator tracks real label positions in LTR and RTL;
navigation preserves each page's search, filter, and scroll state. Rows reserve
horizontal movement for paging: tap opens, while a 44-point menu, native context
menu, and accessibility actions expose the same secondary commands. See the [iOS gesture research](research/ios-relationship-library-design-benchmark.md#sixth-iteration-pages-own-the-horizontal-axis).
Treat screenshot intake as one progressive decision, not a miniature contact
form or a success toast:

1. show the device-owned source and editable recognized text;
2. mark unsupported speaker attribution explicitly;
3. collect a minimal identity clue and relationship purpose;
4. compare current and historical owners without preselection;
5. enable only a temporally valid binding or an unresolved outcome;
6. finish with the actual Wiki quality, affected identifiers, and a direct
   return to the person.

At accessibility text sizes, preserve this order in a vertical scroll rather
than compressing evidence, identity, and consequence into columns. The primary
action belongs after the information it commits.

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

Functional audits gate release but do not establish design quality or
preference. For a consequential visual change, compare at least two rendered
directions against product truth, logo-off ownability, five-second clarity, and
accessibility risk before micro-detail.

See the [brand system](../brand/README.md) for approved marks and usage, and the
[Design reference catalog](research/design-reference-catalog.md) and
[iOS relationship library benchmark](research/ios-relationship-library-design-benchmark.md) for borrowing boundaries.
