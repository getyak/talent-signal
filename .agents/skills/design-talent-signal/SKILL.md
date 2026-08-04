---
name: design-talent-signal
description: Design, implement, or review Talent Signal product and marketing surfaces using its quiet relational-intelligence system. Use for candidate cards and lists, living candidate pages, evidence review, audit timelines, relationship graphs, Today briefs, iOS capture, visual tokens, interaction states, or any UI change that must preserve evidence provenance and recruiter control.
---

# Design Talent Signal

## Load the product context

Read these files completely before making design decisions:

1. `../../../agent.md`
2. `../../../docs/product.md`
3. `../../../docs/design-system.md`

For marketing-site work, also read `../../../design.md` and
`../../../docs/web-experience.md`.

For evidence, action, timeline, graph, or audit work, read the relevant sections
of `../../../docs/deep-research-candidate-momentum-loop.md` before designing the
data presentation.

## Classify the surface

Choose one primary surface:

- Marketing narrative
- Desktop knowledge workspace
- Candidate library
- Living candidate page
- Evidence review
- Timeline and audit history
- Relationship graph
- iOS capture or Today

State the user question the surface answers. Do not begin with components or a
visual trend.

## Map meaning before layout

Identify:

- the canonical entity;
- which objects are only views or projections;
- the verified facts, proposals, inferences, and superseded states;
- the exact provenance path;
- the mutation, approval, and failure states;
- the one item that deserves visual attention.

Treat the candidate page as canonical. Build Card, List, Timeline, and Graph as
consistent views of the same domain objects.

## Declare the design read

State the surface, audience, visual character, and design dials.

Use these defaults:

| Surface | Variance | Motion | Density |
| --- | ---: | ---: | ---: |
| Marketing | 8 | 7 | 4 |
| Desktop workspace | 5 | 3 | 6 |
| Evidence review | 4 | 2 | 6 |
| Relationship graph | 6 | 4 | 5 |
| iOS capture and Today | 4 | 2 | 5 |

Lower motion when implementation scope cannot support correct state
transitions or reduced-motion behavior.

## Compose the surface

Apply these rules:

1. Use page and whitespace grouping before adding cards.
2. Give a card materiality only when it is selectable, comparable, draggable,
   approvable, or temporarily focused.
3. Keep one information order across Card and List.
4. Put exact evidence one click from every decision-relevant fact.
5. Show before and after when a fact changes.
6. Separate proposed, confirmed, edited, inferred, dismissed, and superseded
   states without relying on color alone.
7. Use Graph only to answer a relationship question. Make every edge typed,
   time-bounded, and traceable.
8. Use trends only for a real historical series tied to a decision.
9. Use visual weight for work attention, never candidate worth.

## Apply the visual system

- Reuse the pearl, graphite, off-white, and vermilion semantic tokens already
  defined by the project.
- Use Manrope for display and interface text.
- Use IBM Plex Mono only for operational evidence metadata.
- Use level 0 or 1 materiality for default content and lists.
- Use 12-14px radii and a restrained warm shadow for object cards.
- Keep tags neutral by default and show at most three on a candidate card.
- Keep Phosphor on web and SF Symbols on iOS.
- Do not introduce a second palette, icon family, or competing radius system.

## Implement complete states

Include the states relevant to the surface:

- loading;
- empty;
- insufficient evidence or ambiguity;
- proposed;
- confirmed;
- edited;
- dismissed;
- execution failed;
- expired;
- superseded;
- deleted or pending derivative deletion.

Keep actions reversible where the product contract allows. Never let a polished
success state hide a failed or unverified mutation.

## Protect the relationship graph

- Start with a one-hop ego network.
- Expand to two hops only on request.
- Keep node size independent of human value.
- Map edge width to confirmed interaction count in the selected time window.
- Map edge opacity to recency.
- Use dashed edges for proposed or unverified relationships.
- Open relationship evidence from an edge.
- Provide a list equivalent.
- Stop force motion after layout settles.
- Never display an unexplained relationship-energy score.

## Verify

Before finishing:

- Compare Card and List for semantic parity.
- Trace at least one current fact to exact evidence and through history.
- Test long names, missing avatars, no tags, three tags, stale evidence, and an
  ambiguous identity.
- Test keyboard navigation and a textual graph alternative.
- Test light, dark, reduced-motion, desktop, and mobile states that are in
  scope.
- Confirm that color, card elevation, and large type remain scarce.
- Confirm that no visual device ranks a person.
- Run the repository's relevant lint, typecheck, tests, and build.

Report which canonical objects, provenance states, and attention hierarchy the
design uses.
