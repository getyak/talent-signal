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
3. **Active:** run relevant checks and independent review; fix confirmed P0/P1.
4. **Pending:** create linked PR, pass current-head gates, merge, deploy the
   TestFlight backend, verify acceptance, and close GET-26.

## Verification

- Prompt regressions cover scoped, unscoped, and workspace conversation paths.
- Canonicalization covers multiline input, generic proposals, Unicode length,
  and objective fallback.
- Backend tests prove the field appears only on the first context-free result.
- Web and iOS tests prove first-answer replacement and later-turn stability.
- Full relevant TypeScript checks, iOS checks, docs checks, and repository CI
  must pass on the delivered commit.
