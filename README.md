# Talent Signal

> The candidate-momentum workspace for independent recruiters.

Talent Signal turns recruiter-controlled conversation screenshots into reviewable actions and evidence-backed next-step intelligence. It is not an ATS replacement or a generic relationship CRM.

## MVP loop

1. Import a chat screenshot and optional context.
2. Extract explicit facts and proposed actions.
3. Require confirmation before writing a contact or meeting change.
4. Present one prioritized insight and a concrete next step.

## Repository map

- [`docs/README.md`](docs/README.md) — task-routed project knowledge map.
- [`_index/`](_index/README.md) — raw wiki sources, notes, article drafts, and
  publishable source pages.
- `apps/ios/` — iOS capture and timely-briefing client.
- `apps/web/` — product narrative and browser-safe evidence-review demo.
- `packages/domain/` — shared product vocabulary and contracts.
- `.agents/skills/` — Codex-discoverable product, review, and knowledge Skills.
- `.github/` — CI and contribution conventions.

## Status

The repository contains a native iOS product shell, a web narrative and
evidence-review experience, shared product contracts, and the foundations of a
governed evidence-to-action system.

## Web development

```bash
pnpm install
pnpm dev
```

Run the complete web quality gate with:

```bash
pnpm check
```

Compile and validate the project wiki with:

```bash
pnpm wiki:build
pnpm wiki:test
pnpm wiki:check
pnpm hooks:install
```

The hook installation is local and one-time. It prevents pushes containing a
stale `_index/` to `docs/` compilation; CI enforces the same check.

The optional, server-only AI evidence route and its privacy boundary are
documented in [`docs/integrations.md`](docs/integrations.md).
