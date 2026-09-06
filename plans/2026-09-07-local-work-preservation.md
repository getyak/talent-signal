# Local work preservation and remote synchronization

Status: in progress
Owner: Codex
Started: 2026-09-07

## Outcome and boundary

Preserve useful unpublished source, tests, prompt assets, operational knowledge,
and curated synthetic evidence on a reviewable remote branch. Exclude dependency
caches, machine-local configuration, raw runner output, and superseded copies.
Do not replace newer shipped behavior with an older local implementation.
No production deployment or direct update to `main` is part of this task.

## Evidence and approach

- Initial checkout: `codex/add-ios-action-button-capture` at `c7c5495`; its remote
  branch has been deleted. Remote main is `773979a` after fetching.
- Initial status: 151 modified tracked files and 750 untracked files (about
  93 MB). Most untracked bytes are evaluation images; size alone does not decide
  whether evidence is useful.
- Many local changes have already shipped through later squash merges. Compare
  file contents with remote main before selecting changes.
- Inspect other registered worktrees and stashes for distinct unpublished work.
  Preserve other working directories in place.
- Keep reusable evidence and source inputs in their existing knowledge layers;
  ignore only clearly reproducible or transient material.

## Milestones

1. Active: audit current files, other worktrees, and remote equivalence.
2. Pending: select useful changes and narrow ignore rules; integrate remote main.
3. Pending: run checks appropriate to the actual new diff and inspect secret risk.
4. Pending: commit, push, and independently verify the remote branch tip.

## Completion evidence

Record selected and excluded categories, actual checks and limitations, the
remote branch, and destination readback. A backup commit does not certify a
feature release. Re-plan if an artifact contains private evidence or a local
change conflicts with newer remote behavior.
