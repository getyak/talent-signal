# Local work integration and remote preservation

Status: active
Owner: Codex
Started: 2026-09-03

## Outcome

Preserve every valuable local source, test, durable plan, and synthetic proof
that is not already represented on the remote, integrate it with the current
`origin/main`, and push a reviewable remote branch without adding raw build
products, private candidate material, transient logs, or superseded WIP.

Completion is observable when the pushed branch is based on the current remote
main, the remote branch readback contains every new commit, focused checks and
documentation validation pass, no secret-like material is tracked, and the
remaining local-only files are classified generated artifacts rather than
unpublished product work.

## Boundary

In scope:

- current-worktree TypeScript, Swift, package, test, script, and configuration
  changes;
- the repository-owned Evaluation V2 core, runner, 36 synthetic cases, Opik
  adapter, review boundary, and synthetic proof packet;
- completed implementation plans and curated synthetic visual/runtime evidence;
- repository-wide auditing of local branches, worktrees, stashes, and remote
  reachability;
- synchronization with `origin/main`, conflict resolution, focused verification,
  push, and remote readback.

Out of scope:

- raw `.xcresult` bundles, built `.app` products, release archives, profiler
  output, transient service logs, and repeated RC/staging captures;
- any private or user-authorized candidate conversation, screenshot, attachment,
  secret, credential, or external-provider payload;
- reviving historical WIP whose shipped behavior is already represented by a
  later remote PR;
- pushing directly to protected `main` or claiming release authority from
  synthetic evaluation evidence.

## Current evidence and decisions

- The starting branch tip `90dd83d` is already contained in `origin/main` via
  PR #98. The remote topic branch was deleted after merge.
- The starting worktree had 58 modified tracked files and 33,169 truly local
  untracked files. Only 652 untracked files resembled source, contracts, plans,
  or documentation; most of the remainder came from large native result bundles.
- Other extant worktrees are clean and there is no stash. Prunable worktree
  registrations point to already-removed temporary directories.
- Recent feature tips that are not graph ancestors of `origin/main` are
  patch-equivalent squash merges. The older contact-intake snapshot and mobile
  runtime branches are superseded by PR #83 and PR #84; all paths they introduced
  exist on the remote main and later commits continue their behavior.
- Evaluation evidence selected for version control must be explicitly synthetic,
  purpose-limited, and content-addressed. Raw runner output and host-local bundles
  are not proof and remain ignored.
- A new branch, `codex/integrate-local-work-20260903`, owns this integration so
  the already-merged macOS branch is not silently recreated with unrelated work.

## Chosen approach

1. Add narrow ignore rules for known raw evaluation/build outputs while keeping
   curated manifests, reviews, receipts, and screenshots available for review.
2. Commit coherent local source and evidence slices before integrating remote
   main so the original work remains recoverable.
3. Merge the latest `origin/main` with three-way conflict resolution. Prefer
   the remote version for already-shipped feature evolution and retain local
   code only where it adds a distinct tested capability.
4. Run the Evaluation, Agent/backend, documentation, secret, diff, and relevant
   iOS checks in proportion to the final diff.
5. Push the integration branch and verify its exact tip and commit reachability
   through a fresh remote readback.

## Milestones

1. **Complete — repository-wide inventory.** Classified the current worktree,
   local branches, worktrees, stashes, remote ancestry, and generated-artifact
   concentration.
2. **In progress — local preservation.** Stage and commit valuable local source,
   tests, plans, and synthetic evidence while excluding raw outputs.
3. **Pending — remote integration.** Merge `origin/main` and resolve duplicate or
   divergent feature work against the current shipped implementations.
4. **Pending — verification.** Run focused checks, secret scanning, documentation
   validation, and final evidence-safety review.
5. **Pending — remote readback.** Push the branch and prove the remote reference
   resolves to the verified local tip.

## Replanning signals

- Stop if a prospective artifact contains non-synthetic candidate or client
  content, a credential, or an external identifier outside the documented proof
  boundary.
- Re-plan if merging reveals that local behavior would regress a newer remote
  authority, identity, retry, deletion, or external-effect boundary.
- Keep the branch review-only if required checks fail; a remote backup is not a
  release or merge approval.
