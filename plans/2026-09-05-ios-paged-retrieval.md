# iOS paged retrieval

Status: implementation complete; focused Simulator interaction verification is
pending because another repository worktree owns the machine-wide iOS automation
lock for a long-running full suite.

## Outcome

Make Today, Sessions, and People feel like one continuous mobile retrieval
space: a horizontal page gesture changes the primary destination, the top
selection visibly follows that movement, and row-level secondary commands no
longer compete for the same gesture.

## Boundary

- In scope: the primary retrieval pager and header motion, Session and People
  row command entry points, accessibility equivalents, canonical interaction
  guidance, and focused regression tests.
- Out of scope: changes to governed relationship state, Session persistence,
  People identity, external writes, or the visual hierarchy inside each page.
- Preserve all unrelated work already present in the dirty worktree.

## Current evidence

- The current shell switches `selectedPage` through a non-paging `ZStack`.
- Session and People rows currently own native horizontal `swipeActions`.
- Existing tests intentionally assert that content-wide swipes do not navigate.
- The user has explicitly chosen the opposite ownership model: pages own the
  horizontal axis; rows use tap, long press, an explicit menu, and accessibility
  actions.

## Approach

1. Restore a native page-style container so the page transition follows the
   finger and preserves platform paging physics.
2. Report live page geometry to the header and render a restrained stretching
   selection indicator; Reduce Motion keeps a simple non-elastic treatment.
3. Replace Session and People row swipe actions with a 44-point trailing menu,
   keep the matching context menu, and preserve explicit confirmation for local
   Session deletion.
4. Rewrite focused UI tests around page swiping, menu equivalence, destination
   stability, and accessibility identifiers.
5. Update the canonical mobile rule and verify build/tests/docs.

## Rejected alternatives

- Keeping both page paging and row swipes: repeats ambiguous same-axis gesture
  arbitration.
- Custom velocity/angle thresholds: adds recognizer, RTL, accessibility, and
  physics debt without improving the ownership model.
- Long press as the only row shortcut: too hidden; the visible menu is the
  discoverable equivalent.

## Completion evidence

- A drag on Today changes to Sessions, then People, and reverses reliably.
- Session and People row commands are reachable from both the visible menu and
  long press, without row swipe actions.
- Top selection stays semantically selected and visibly follows page progress.
- Scroll/search state remains owned by each destination.
- Relevant iOS build/tests and `pnpm docs:check` pass, or any environmental
  blocker is recorded precisely.

## Verification record

- `xcodebuild ... CODE_SIGNING_ALLOWED=NO build`: passed for the Debug app and
  both bundled extensions on the iOS 26.5 Simulator SDK.
- `xcrun swiftc -parse apps/ios/UITests/CandidateSignalUITests.swift`: passed.
- `node scripts/ios/check-localization.mjs`: passed with both new menu labels in
  the string catalog.
- `pnpm docs:check`: passed, including wiki and architecture diagram checks.
- `git diff --check`: passed.
- Focused UI tests were updated but not executed: the machine-wide automation
  lock is held by `/tmp/talent-signal-ios-check-remaining.sh` in another
  worktree. The queued run was stopped without interrupting that owner.
