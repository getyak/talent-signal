# Web experience

## Objective

Make Talent Signal legible to design-conscious independent recruiters and boutique search firms. The page should feel more specific, calm, and trustworthy than broad productivity-product marketing.

## Positioning

The page does not sell feature volume. It demonstrates one defensible loop:

1. Import one meaningful candidate conversation with intent.
2. Separate explicit evidence from inference.
3. Review every proposed contact or calendar change.
4. Receive one evidence-backed verdict and the smallest useful next action.

## Information architecture

- Hero: concise value proposition and a spatial evidence-to-action model.
- Product guarantees: source retention, editability, and no silent mutation.
- Evidence story: generated editorial photography that visualizes fragmented context becoming a clear path.
- Interactive brief: evidence toggles update the verdict and next action.
- Method: capture, confirm, and advance without replacing recruiter judgment.
- Principles: facts before inference, consent before mutation, and deletion across derivatives.
- FAQ and privacy: answer boundary questions in indexable server-rendered content.
- Live demo: exercise loading, success, empty, error, edit, confirm, dismiss, and restore states.

## Design system

### Typography

- Manrope carries display and interface text.
- IBM Plex Mono marks evidence metadata and system state.
- Headlines use tight tracking and short line lengths without oversized four-line compositions.

### Color

- Neutral foundation: pearl grey, smoke, graphite, and off-white.
- Accent: one vermilion hue, adjusted only for contrast across light and dark themes.
- No purple glow, blue neon, or generic AI gradient language.

### Shape

- Marketing and product cards: 20px.
- Inputs: 12px.
- Interactive buttons and evidence chips: full pill.

### Motion

- Browser-native section reveals establish reading order without adding a
  marketing-page animation runtime.
- Evidence toggles animate only the changed recommendation.
- Product actions provide immediate state feedback.
- The desktop Three.js field uses pointer orientation and a restrained pulse
  to show convergence.
- All motion becomes static under `prefers-reduced-motion`.

## Three.js rationale

The scene is not a decorative background. Five source nodes connect to one central action, matching the product's core claim that scattered evidence can support one explainable next step. An accessible CSS poster renders first on every device. The lazy Three.js client island activates only after pointer intent on desktop; mobile and reduced-motion contexts keep the static poster. The renderer caps pixel ratio, observes resize without layout shift, avoids React state in its animation loop, and disposes every WebGL resource on unmount.

## SEO

- Route-level metadata and canonical URLs.
- Organization, software application, and FAQ structured data.
- Generated Open Graph image.
- Static `robots.txt`, `sitemap.xml`, and web manifest.
- Server-rendered product copy and semantic heading hierarchy.
- Configurable public origin through `NEXT_PUBLIC_SITE_URL`.

## Production verification

The final local production build was verified at desktop and mobile viewport
sizes with no horizontal overflow and no browser-console warnings. The mobile
Lighthouse run scored 97 Performance, 100 Accessibility, 100 Best Practices,
and 100 SEO, with 1.8s LCP, 190ms TBT, and zero CLS. The desktop run scored 95,
100, 100, and 100, with 0.9s LCP, 0ms TBT, and zero CLS.

## Generated image assets

The built-in image-generation workflow produced two project assets:

- `apps/web/public/images/evidence-thread.webp`: a wide editorial still life of evidence fragments, optical glass, graphite, and one vermilion thread.
- `apps/web/public/images/recruiter-notes.webp`: a portrait editorial scene of a recruiter reviewing notes with one vermilion pencil.

Both assets avoid readable personal data, logos, visible application interfaces, and identifiable faces.
