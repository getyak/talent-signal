# Integrate ready pull requests

## Outcome and boundary

Update the primary checkout to main and integrate useful ready PRs against the
current main baseline. Preserve original commits, unrelated worktrees and local
untracked files. Do not promote drafts or bypass repository rules.

## Current evidence and decisions

- Baseline: main `97aca735`; primary checkout switched to main with `.workbuddy/`
  retained. The clean previous main worktree was detached at its original commit.
- Include #176: test workspace return recovery and navigation visibility.
- Include #164: pinned pnpm/action-setup 6.1.0 update.
- Include #162: Fastlane 2.239.0 update and resolved dependency lockfile.
- Defer #169: explicitly draft, conflicting, with incomplete acceptance items.
- Defer #173: CI fails for SDK version reporting and Opik runtime proof mismatch.
  The latter binds a real historical SDK/server integration receipt; changing its
  version fields would fabricate evidence. A dependency upgrade needs fresh
  integration verification and is outside this maintenance slice.
- Use an integration PR retaining the three original branch histories. Merge
  with a merge commit so GitHub can mark the original PR commits as integrated.

## Milestones

1. Complete: inventory, primary main update, clean integration of selected PRs.
2. Active: review integrated diff, run docs/localization checks and current-head CI.
3. Pending: merge through repository gates, read back original PR states, update
   primary main and confirm it matches origin/main.

## Completion proof

Exact final PR head passes all applicable CI/Security checks and has no unresolved
P0/P1 findings; repository reports merged; original commits are reachable from
main; primary main equals origin/main. This task does not claim a new TestFlight
release or completion of unrelated Linear acceptance.
