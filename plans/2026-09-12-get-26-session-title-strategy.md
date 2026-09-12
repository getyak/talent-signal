# GET-26: Session title strategy

## Outcome and boundary

Make Session titles recognizable to a person returning after several weeks.
Issue: https://linear.app/getyak/issue/GET-26

Titles are display-only retrieval metadata. They do not become evidence,
confirmed state, identity authority, or permission to act. The implementation
must not add a second model request or silently rename an established Session.

## Design

- Formal conversation prompts define a good title as one concrete, single-line
  phrase in the user's language, preferably verb plus object, with at most 32
  user-perceived characters and no generic reply/greeting labels.
- Structured providers return an independent optional `session_title`, keeping
  the answer block's `title` as the heading for that specific reply. Claude
  natural output carries a leading `session_title` metadata envelope in that
  same final response; the adapter removes it before displaying the body.
- Backend responses expose optional `session_title` only when the persisted
  Session has no recorded turn or carried screenshot context. This remains
  false even if prior answer text later becomes unavailable. The backend collapses
  whitespace, rejects generic labels, applies the shared 32-character limit,
  and falls back to the user's objective.
- Web and iOS create an immediate bounded objective-derived label, replace it
  once from the first canonical answer, and preserve it on retry and later
  turns. Older servers and stored Sessions remain compatible because the field
  is optional.

## Milestones

1. **Complete:** read issue intent and trace prompt, backend, Web, and iOS title
   ownership.
2. **Complete:** implement same-call generation, canonicalization, first-result
   persistence, tests, and product documentation.
3. **Complete:** relevant Agent, backend, Web, docs, PostgreSQL, and iOS checks
   pass; independent review has no remaining findings or unresolved P0/P1.
4. **Complete:** the implementation was integrated through [PR 180](https://github.com/getyak/talent-signal/pull/180),
   passed current-head CI, Security, and the full iOS release smoke, merged as
   `d3978dd52c78418cd2acc3e6ed2058b9b90c8891`, and was verified on the local
   TestFlight backend. Linear GET-26 was read back as Done on 2026-09-13.

## Verification

- Prompt regressions cover scoped, unscoped, and workspace conversation paths.
- Canonicalization covers multiline input, generic proposals, Unicode length,
  and objective fallback.
- Backend tests prove the field appears only on the first context-free result.
- Web and iOS tests prove first-answer replacement and later-turn stability.
- Full relevant TypeScript checks, iOS checks, docs checks, and repository CI
  passed on integration head `be3cde0277223b5e186c6afb1f34f3564a2c283a`.
- The deployed backend revision `61c99524252ea464ce52d271e32750c2edf7ba5a`
  has the same Backend, Agent, and Contracts tree as merged `main`; the API is
  healthy and its database includes migration `069_account_access_event_details`.
- [PR 184](https://github.com/getyak/talent-signal/pull/184) was closed as
  superseded. Its later unproven AX5 waiver and color adjustment were not
  shipped.
