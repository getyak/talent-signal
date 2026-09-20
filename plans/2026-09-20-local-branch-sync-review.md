# Local branch synchronization and high-priority review

## Outcome and boundary

Audit every local branch and worktree against fetched origin/main, preserve
uncommitted work, publish genuinely missing history, and merge reviewed P0/P1
fixes through current-head CI. Do not restore superseded implementations or
claim an archived branch is production code. No database changes or new releases
are required by this source delivery.

## Baseline and audit method

Baseline: `e88458bc` (PR #207), fetched 2026-09-20. Inventory contains 147 local
branches, no stashes, and 12 dirty worktrees. The main checkout remains at
`9b803fa2` with existing uncommitted system-health work; it is not a safe place
to fast-forward. Delivery uses an isolated worktree and task branch.

Compare commit reachability, exact merged PR heads, patch equivalence, containing
PR heads, and current file/behavior differences. A missing upstream or nonzero
ahead count alone does not establish unshipped work.

- 81 original branch tips are ancestors of main.
- 66 tips are not ancestors; 54 exactly match merged PR heads.
- Pi AX5 commit `82ddc679` is patch-equivalent to main.
- Pi GET-31/GET-30 plan commits are in merged PR #202/#203 heads.
- Login commits `4120beab`/`c20c54d7` are in merged PR #206. Trial cherry-picks
  produce no code changes and were skipped; no duplicate delivery is needed.
- Eight residual history branches require explicit disposition below.

## Residual branch disposition

| Branch suffix under codex/ | Decision and evidence |
| --- | --- |
| contact-intake-snapshot | Old WIP; current intake was delivered through PR #83 and later revisions. Preserve history; do not merge stale UI/domain snapshot. |
| fix-ios-post-merge-gates | Old integration history superseded by reconciled mobile runtime on main (`54069fab`, `28f910ce`, PR #84). Preserve history. |
| ship-mobile-ai-runtime | Same superseded integration lineage; preserve history rather than reintroduce removed local media/environment paths. |
| get-23-testflight-integration | Already remote; implementation delivered in PR #170, later acceptance documentation superseded on main. Preserve current remote branch. |
| get-26-title-strategy | Already remote; PR #184 was closed. Current AX5 coverage repaired separately (`9baddbbf`, `6032cef4`). Do not reopen obsolete test split. |
| pi-20260913-083850-9a6a578d | Included in main PR #186 (`9b803fa2`) and subsequently hardened; dirty test deletion is rejected. |
| web-capture-pipeline | Reconciled delivery is PR #175 (`674ce92b`); old direct merge conflicts with later authority/retention fixes. Preserve history. |
| get-8-release-proof | Genuine missing release receipt `4f46e882`; recovered by cherry-pick after GitHub run/release verification. |

The recovered receipt was checked against successful release run `34560737733`,
successful main CI `34558561982`, matching merge SHA `87ee93fa`, and existing
GitHub prerelease `v0.1.74`. This is historical release evidence, not a new release.

Six missing residual history tips were atomically published and SHA-read back as
`codex/archive/20260920/{contact-intake-snapshot,fix-ios-post-merge-gates,get-8-release-proof,pi-20260913-083850-9a6a578d,ship-mobile-ai-runtime,web-capture-pipeline}`.
The two other residual tips already exist on remote branches. Credential-pattern
review found only explicit historical test fixtures; no credential values are
included in this record. Archive publication does not authorize production use.

## Uncommitted work

Dirty Pi trees retain intermediate source even after reviewed implementations
were copied into delivery branches. The current system-health implementation
on main supersedes the incompatible root draft (array/schema_version contract,
authenticated registration, 070/071 migration checks). Do not overwrite it.

The CI worktree contains optional, unfinished merge-group/checkout-credential
hardening and an unused helper. Current main already implements cumulative
trusted-release detection and newer fail-closed classification. Preserve these
local drafts; merging the old workflow wholesale would regress current gates.

## Confirmed review findings

1. P1: Firecrawl accepted final redirected content using the original sourceURL
   as provenance. Require and independently validate actual metadata.url under
   the exact-source policy; reject missing, private, HTTP, and changed sources.
2. P1: Session send completion unconditionally cleared the newest server draft.
   Preserve exact draft/timestamp cleanup identity through retry; keep competing
   server and browser drafts, and retain revision checks on cleanup writes.

Independent reviewers examined PR #202-204 runtime and PR #205-207 Web changes.
No P0 was confirmed. This is scoped deep review, not proof the entire repository
has no defects. GitHub Dependabot was also read back: two high PostCSS findings
(#8/#22) belong to archived design-prototype development lockfiles; medium
findings cover those snapshots, Hono, and the macOS Hybrid Cargo dependency graph.
They remain outside these two confirmed production-path P1 fixes; no claim is
made that all dependency advisories are resolved.

## Milestones and verification

- Complete: baseline, branch/PR/patch audit, independent initial P1 review.
- Complete: Pi implementation plus parent corrections; independent reviewers
  closed both P1 findings on the final source. The Web review required additional
  combined-race coverage and a conflict gate before all pending rebases.
- Complete: Web 736 tests passed / one existing skipped, Agent Host 80 passed;
  Web/Agent Host typechecks, changed-file ESLint, docs/architecture, secret
  hygiene and diff whitespace checks passed.
- Active: latest-head GitHub CI/Security, merge and main readback.

The Firecrawl contract is checked against the upstream scraper metadata
assignment (`sourceURL` original versus `url` final). No live paid-provider
request or deployment is claimed. Server and competing browser draft tests use
synthetic data, including legacy send records and inactive session readbacks.

Retain original worktrees and uncommitted files. Archive refs are history only;
never treat publication as review approval or production integration.
