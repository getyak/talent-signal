# Worktree reconciliation and cleanup

## Outcome and boundary

Audit every Talent Signal worktree, preserve unpublished source in verified remote
refs, recover useful omissions through review and CI, and remove inactive copies.
Never delete an active task checkout, service mount, database, personal memory,
or credential file to make the inventory appear clean.

## Evidence

The initial inventory contains 108 registrations: 91 existing directories and
17 stale registrations. Two worktrees belong to the active workspace experience
task. Runtime checkouts are identified from process working directories,
LaunchAgents, Docker bind mounts, current symlinks, and cross-checkout links.

Thirteen inactive dirty source trees were independently reviewed. Old cookie,
screenshot authorization, workspace UI, capture observability, account auditing,
budget, meeting-draft, health and accessibility drafts are already incorporated
or superseded by stronger main implementations. The abandoned session test
truncation must not remove the current test suite. Preserve their exact source
snapshots in `codex/archive/20260920/worktree-draft-*`; these refs are recovery
material, not production merge candidates. Personal `.workbuddy` records,
credentials, dependencies and generated artifacts are excluded from publication.

The unfinished CI draft contains one useful omission: checkouts in CI and
Security unnecessarily retain repository credentials. Set `persist-credentials:
false` consistently in those read-only workflows. Do not introduce the unused
baseline helper or partially wired merge-queue support merely to merge old work.

## Milestones

1. Completed: inventory source, remote history, active owners and service paths.
2. In progress: publish and SHA-readback source archives; review the narrow CI fix.
3. Pending: latest-head CI, merge, inactive worktree removal and service readback.

## Completion proof

Record each removed path and its remote preservation reference, list protected
active paths with reasons, verify the final main commit and all applicable CI,
and probe existing services after cleanup. The local audit ledger contains
private paths and ignored-file preservation details and is not published.
