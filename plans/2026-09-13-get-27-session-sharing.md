# GET-27 Session sharing

## Outcome

Replace the raw transcript share action with a reviewable Session card flow that helps a recipient understand the Session without implying that live state, pending decisions, source access, or execution authority were transferred.

## Boundary

- The iOS app exports a local snapshot through the system share sheet.
- No public link, backend copy, recipient account, permission, or revocation state is created.
- The default card contains the minimum useful context; sharing a full readable transcript remains an explicit secondary choice.
- Identity-review and otherwise unresolved Sessions cannot export person identity as confirmed context.
- Pending objectives, action identifiers, citations, media, and execution authority never leave the app through this flow.

## Current evidence

- `RelationshipAskView` directly shares `AgentSessionContextPolicy.exportMarkdown`, so there is no preview or scope decision.
- `exportMarkdown` includes every readable turn plus contact receipt labels and pending objectives.
- Forking already strips action authority, but export policy has weaker minimization rules.
- Existing tests cover removal of action IDs from Markdown but not disclosure modes, unresolved identity, card content, or the review UI.

## Chosen slice

1. Introduce a pure Session share policy that produces a minimal card payload and a separately selected full-conversation snapshot.
2. Add an in-app share preview sheet with visible content scope, authority boundary, and an explicit final system-share action.
3. Render a stable card image while including accessible plain text in the shared item.
4. Cover resolved, unresolved, stale/forked, empty, and pending-action cases with unit and UI tests.
5. Verify on the real iOS surface, complete independent review, merge the latest green PR head, and close GET-27 only after readback.

## Completion evidence

- Narrow unit/UI tests pass from an artifact directory created by `dev-storage-guard`.
- Screenshots show the preview, scope control, safety boundary, and system share sheet from the latest commit.
- Independent review has no open P0/P1 findings.
- GitHub PR is merged with all required checks green at the merged head.
- The merged app surface is re-verified and Linear GET-27 reads back as completed.
