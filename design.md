# Design specification

## Product position

Talent Signal is a candidate-momentum assistant for independent recruiters and boutique search firms. It treats a screenshot as an intentional evidence import, not as a surveillance channel.

## Primary iOS flow

1. **Import** — share or select a screenshot, optionally add context, and see an explicit data-use notice.
2. **Review actions** — show only concrete, high-confidence cards: create contact, update contact, create meeting. Every card includes source evidence plus Confirm, Edit, and Dismiss.
3. **Candidate brief** — show verified facts, commitments, constraints, and upcoming actions as a compact timeline.
4. **Momentum insight** — lead with `Advance`, `Resolve blocker`, `At risk`, or `Wait`, explain why, and give one smallest next action.

## Example

Input: “I have another offer and need to decide by Wednesday. I can speak Tuesday afternoon, but remote work is important.”

Cards: update competing-offer status; update decision deadline; update remote-work preference; create Tuesday meeting.

Insight: `At risk` — Alex has a near decision window and an unresolved constraint. Confirm remote policy before scheduling a generic interview.

## Visual rules

- Quiet, editorial, and confidence-building; avoid dashboard density.
- Use action cards as documents of consent, not AI magic.
- Keep the Today screen to three prioritized candidate briefs.

## Web experience

The web surface is a product narrative plus a browser-safe interaction demo. It is not a full ATS or a simulated production workspace.

### Design read

- Audience: independent recruiters and boutique search teams running high-value, relationship-led searches.
- Language: editorial precision with restrained product materiality.
- `DESIGN_VARIANCE: 8`: asymmetric composition and varied section structures.
- `MOTION_INTENSITY: 7`: sequenced entry, state feedback, and a lightweight spatial signal model.
- `VISUAL_DENSITY: 4`: concise content with enough operational detail to establish trust.

### Visual system

- Use Manrope for display and interface text, with IBM Plex Mono for evidence metadata.
- Use pearl grey, graphite, and off-white neutrals with one vermilion signal accent.
- Cards use a 20px radius, fields use a 12px radius, and buttons use a full-pill radius.
- Support light and dark themes with matching hierarchy and the same accent hue.
- Use generated editorial photography only when it strengthens the evidence or recruiter-judgment story.

### Motion and Three.js

- Motion must communicate hierarchy, feedback, or a change in evidence state.
- The hero Three.js field represents fragmented evidence converging into one recommended action.
- Render an accessible static signal poster first. Activate Three.js only after
  desktop pointer intent; keep mobile and reduced-motion contexts static.
- Pointer movement may adjust the field orientation without changing product state.
- The scene must cap device pixel ratio, resize without layout shift, and
  dispose all WebGL resources on unmount.

### Accessibility and SEO

- Keep one semantic `h1` per route and preserve a logical heading hierarchy.
- Support keyboard navigation, visible focus, reduced motion, and WCAG AA contrast.
- Publish route-specific titles and descriptions, canonical links, structured data, Open Graph imagery, `robots.txt`, and `sitemap.xml`.
- Keep the primary value proposition in server-rendered HTML. Three.js and product interactions remain isolated client components.

## Non-goals

- No full ATS.
- No automatic messaging in v1.
- No silent import from chat applications.
- No scoring of personality, protected traits, or unverifiable claims.
