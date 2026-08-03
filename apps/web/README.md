# Talent Signal web

The web app is a production-ready product narrative and browser-safe interaction demo for Talent Signal. It presents the evidence-first value proposition without implying a full ATS or a deployed candidate-data backend.

## Routes

- `/`: product narrative, interactive candidate brief, privacy boundaries, and FAQ.
- `/demo`: deterministic evidence extraction with loading, empty, error, edit, confirm, dismiss, and restore states.
- `/privacy`: product privacy principles and demo data-handling disclosure.
- `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, and `/opengraph-image`: SEO and sharing infrastructure.

## Stack

- Next.js App Router and React
- Tailwind CSS v4 as the CSS build foundation
- Browser-native reveals for the marketing surface and Motion for demo state transitions
- Three.js as a pointer-activated desktop enhancement for the hero evidence field
- Phosphor Icons

## Local development

From the repository root:

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The live demo is deterministic and browser-side. It does not upload or persist the conversation text.
