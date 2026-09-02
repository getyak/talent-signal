# Local work integration and remote preservation

Status: complete
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
- Commit `2005f09` preserves the valuable local source, tests, evaluation
  platform, 36 synthetic cases, durable plans, and curated proof before remote
  integration. It excludes ignored raw result bundles, application/archive
  products, transient logs, dependencies, and environment-local files.
- `origin/main` at `573ad21` is merged into the integration branch. Conflict
  resolution retains the remote shipped authority and safety behavior while
  preserving distinct local retrieval, recovery, evaluation, and iOS tests.
- The merge exposed duplicate localization keys and one stale Chinese assertion.
  The 11 duplicate keys introduced by the merge were removed, the remote
  terminology was retained, and the corrected assertion now passes. No new
  localization duplicates remain relative to `origin/main`.
- Verification passed for `pnpm eval:ci`, `pnpm agent:check`,
  `pnpm backend:check`, `pnpm docs:check`, the secret scan, a Release iOS build,
  all 265 iOS unit tests, and the two locally added iOS retrieval UI regressions.
  The deterministic evaluation safety cases passed 12/12; their release-readiness
  result remains `needs_review` and is not treated as approval.
- The integration merge `6c7b0bb` was pushed to
  `origin/codex/integrate-local-work-20260903`; an independent `ls-remote`
  readback returned the exact same full commit ID. The branch contains
  `origin/main` and no force push or direct update to `main` was used.

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
2. **Complete — local preservation.** Valuable local source, tests, plans, and
   synthetic evidence are preserved in `2005f09`; raw outputs remain excluded.
3. **Complete — remote integration.** Current `origin/main` is merged and all
   conflicts are resolved against the shipped authority and safety boundaries.
4. **Complete — verification.** Evaluation, Agent, backend, documentation,
   secrets, iOS Release, unit, and locally added UI regression checks pass.
5. **Complete — remote readback.** The branch was pushed without force, and the
   remote reference resolved exactly to the verified local merge tip.

## Replanning signals

- Stop if a prospective artifact contains non-synthetic candidate or client
  content, a credential, or an external identifier outside the documented proof
  boundary.
- Re-plan if merging reveals that local behavior would regress a newer remote
  authority, identity, retry, deletion, or external-effect boundary.
- Keep the branch review-only if required checks fail; a remote backup is not a
  release or merge approval.
