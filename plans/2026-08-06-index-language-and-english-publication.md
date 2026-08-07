# Index Language and English Publication

## Status

Completed on 2026-08-06.

## Outcome

Preserve source and working knowledge in its natural language inside `_index/`
while requiring every Wiki page published into `docs/` to be reviewed English
before deterministic compilation.

## Boundary

In scope:

- define language responsibilities for each `_index/` layer;
- preserve the existing Chinese cloud-privacy research draft;
- replace its published source with a faithful English editorial projection;
- require page language metadata and reject non-English published pages;
- update the Wiki workflow, templates, compiler tests, and generated docs.

Out of scope:

- translating human-maintained historical research that is not generated from
  `_index/pages/`;
- translating raw sources merely for consistency;
- using a model dynamically during `pnpm wiki:build`;
- changing the substance of accepted privacy or provider decisions.

## Approach

1. Record the language lifecycle in the canonical documentation system and Wiki
   workflow.
2. Add language metadata to page templates and every current page.
3. Enforce `language: en` for published pages in the deterministic compiler.
4. Move the Chinese cloud-privacy publishing draft to `_index/inbox/`.
5. Create an English reviewed page with the same claims, links, and target.
6. Compile, test, and inspect the language and meaning of generated output.

## Milestones

- [x] Update language policy and templates.
- [x] Add compiler validation and a regression test.
- [x] Preserve the Chinese source-language draft.
- [x] Publish the English cloud-privacy page.
- [x] Compile and verify all generated pages.

## Completion evidence

- raw and working layers explicitly allow source language;
- every `_index/pages/` file declares its language;
- a non-English published page fails compilation;
- the Chinese cloud-privacy draft remains retrievable in `_index/inbox/`;
- its generated `docs/research/` projection is English;
- `pnpm wiki:test`, `pnpm wiki:check`, and `pnpm docs:check` pass.
