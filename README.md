# Talent Signal

> The candidate-momentum workspace for independent recruiters.

Talent Signal turns recruiter-controlled conversation screenshots into reviewable actions and evidence-backed next-step intelligence. It is not an ATS replacement or a generic relationship CRM.

## MVP loop

1. Import a chat screenshot and optional context.
2. Extract explicit facts and proposed actions.
3. Require confirmation before writing a contact or meeting change.
4. Present one prioritized insight and a concrete next step.

## Repository map

- `docs/` — product, design, architecture, research, and delivery decisions.
- `apps/ios/` — iOS capture and timely-briefing client.
- `apps/web/` — product narrative and browser-safe evidence-review demo.
- `packages/domain/` — shared product vocabulary and contracts.
- `.agent/skills/` — canonical project-local review skills; `.agents/skills/` keeps discovery aliases and the existing candidate-signal workflow.
- `.github/` — CI and contribution conventions.

## Status

The native iOS MVP shell and web product site are implemented. The iOS release
pipeline targets `com.talentsignal.app` and supports App Store Connect/TestFlight
delivery through Fastlane.

## Web development

```bash
pnpm install
pnpm dev
```

Run the complete web quality gate with:

```bash
pnpm check
```

The optional, server-only AI evidence route and its privacy boundary are
documented in [`docs/integrations.md`](docs/integrations.md).
