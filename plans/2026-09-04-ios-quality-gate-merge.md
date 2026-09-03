# iOS quality-gate hardening and merge

## Outcome

Turn the reproduced iOS release-gate failures into deterministic checks,
preserve the compact one-row Chat entry and governed evidence behavior, and
merge the quality-gate correction only after required checks and direct
Simulator evidence pass.

## Boundary

- Start from merged Chat sheet commit `576aea8` in an isolated worktree, then
  rebase the correction onto current `origin/main` before publishing it.
- Use synthetic fixture accounts and the existing local capability-limited
  backend only. Do not access production candidate data or perform external
  writes.
- Keep the current Action Button, contact-import, and other uncommitted work in
  `/Users/cubxxw/data/talent-signal` out of these commits.
- Treat Simulator interaction as level-1 executable evidence, but do not claim
  physical-device ergonomics or human VoiceOver validation.

## Current evidence and unknowns

- The current Chat sheet renders its four compact actions in one row and passes
  four focused iPhone 17 Pro journeys.
- The canonical Ask journey originally failed because a generic query matched
  both the SwiftUI accessibility proxy and its `TextField` for `ask-composer`.
- After fixing the element query, the same journey exposed a second stale
  contract: `What changed?` expected implicit contact search even though the
  workspace Agent requires a person clue grounded in the user's message.
- The small-device test expects a 150-point minimum while the intentional
  134-point detent renders at about 128 points and still preserves four 44-point
  hittable controls.
- A custom `TS_IOS_BACKEND_URL` can silently start its fixture service against
  the default PostgreSQL port unless the matching fixture database is explicit.
- The host-side iOS fixture services import the contracts package from `dist`;
  a fresh checkout must build that package instead of relying on stale output.
- The first fully isolated remote-model run proved fixture setup but failed all
  five canonical Chat journeys: the Agent treated an empty current-contact
  scope as a reason to clarify even when the message named Leila or Robin, so
  it never invoked the bounded `contact_workspace` search.
- Pending-turn identity, preserved user text, disabled composer state, and the
  requesting phase already prove submission progress; the extra
  `ask-loading` proxy is not consistently exposed by XCTest and is not part of
  the user-visible contract.
- The corrected prompt reached the contact Tool loop, but the two-step
  search/read route exhausted the old 15-second whole-Run deadline and silently
  fell back to an uncited unscoped answer. An authorized unique read can close
  deterministically as `use_contact`; it does not need a third model turn.
- A post-rebase 4/5 run exposed one remaining nondeterministic route: the model
  sometimes ignored the named-clue search contract and immediately asked the
  recruiter to select a relationship. High-confidence explicit named queries
  now route through deterministic exact-clue search and a unique relationship-
  header read; zero or multiple matches still stop for clarification.
- PR #111's Lab journey passed locally and in the required iOS smoke check; the
  PR merged as `03527f6` before this follow-up branch was published.

## Approach

1. Make Chat composer UI tests query the semantic `TextField`, require
   relationship-specific prompts where governed contact search is expected,
   and assert the compact detent by its intended bounded behavior rather than
   an obsolete height range.
2. Require a custom backend to carry its matching, secret-managed
   `DATABASE_URL` into fixture setup and fail before test execution when the
   pairing is absent; keep self-managed Docker behavior unchanged.
3. Build host-side fixture contracts inside the gate, then run syntax,
   localization, focused iOS unit/UI, canonical true-backend, small
   device, and repeated Lab checks with inspectable result bundles.
4. Require the unbound Agent to search on a specific named relationship clue
   before clarifying, while preserving exact message grounding, unique
   same-Run resolution, one-scope reads, and ambiguity fallback.
5. Deterministically route high-confidence explicit named questions through
   exact-clue search and at most one uniquely authorized relationship-header
   read, close a successful read as `use_contact`, preserve cancellation, and
   keep the model Tool loop for less explicit requests.
6. Rebase the correction onto the merged Lab change, publish one focused PR,
   wait for required GitHub checks, review the final diff, and merge it.

## Milestones

1. **Completed — deterministic corrections.** Chat tests now select the
   semantic text field and use explicit relationship clues, the compact-height
   assertion matches the intentional detent, custom-backend fixture setup
   requires an explicit database, and a fresh checkout builds the fixture
   contracts before starting helper services.
2. **Complete — direct verification.** Chat, small-device, canonical Ask, unit,
   and Lab behavior pass from current builds. Backend tests pass 261/261, and
   the post-rebase five-path isolated Zhipu model run passes 5/5 in 128 seconds
   with governed citations, reviewed-contact context, Chinese AX5 layout, and
   same-intent retry.
3. **In progress — remote review.** Rebase, commit, push a focused quality-gate PR,
   and confirm required checks and mergeability.
4. **Pending — merge and readback.** Merge the approved PRs and verify
   `origin/main` contains the expected commits with no unrelated local changes.

## Completion evidence

- Generic Ask queries no longer produce multiple-match failures.
- The minimized sheet remains one row with four hittable controls on a small
  supported iPhone and expands back to the full composer.
- A custom backend cannot prepare fixtures against an implicit database.
- The native Lab journey and required checks passed before PR #111 merged.
- GitHub reports the merged pull request(s), and `origin/main` contains the
  resulting commits.

## Re-plan triggers

- If a fix changes user-facing evidence, identity, or action authority, stop
  and run evidence-safety review before proceeding.
- If the two open PRs conflict after the first merge, rebase in an isolated
  worktree and rerun affected iOS evidence before the second merge.
- If required CI is unavailable rather than failing, retain the PR and report
  the missing merge proof instead of bypassing branch protection.
