# GET-24: Relationship time workspace

## Outcome and boundary

Implement the approved Web/macOS design as a real authenticated time workspace:
retrieve people created, Sessions active, and calendar work for a date/range;
filter by stable person identity; inspect and open the original object; review
past work and prepare future work; create/edit/cancel internal schedules and
hand reviewed events to the system calendar without claiming an unverified write.

The macOS product window consumes the same Web implementation under ADR 0016.
No script bridge or new remote-page native authority is introduced. Calendar
file handoff is explicit; downloaded files do not prove import. Agent range
reviews remain attributed, bounded, read-only projections and do not become
permanent Memory or confirmed relationship facts automatically.

## Baseline and ownership

- Frozen starting point: `e631705c4ad80b78655588f0414ce0215d7eefdf` (`origin/main`).
- Delivery branch: `codex/get-24-time-workspace` in the dedicated GET-24 worktree.
- The original checkout contains another task's iOS/documentation work and is
  read-only for this task. Existing runtime releases and Pi tasks are unrelated.
- Codex owns scope, frontend and platform integration, acceptance, independent
  reviewer coordination, PR/CI/merge, deployment and issue readback.
- Pi owns the backend implementation in its runner-managed worktree. Contracts
  are parent-owned and frozen before dispatch. No repository lock bypass.

## Accepted design evidence

The user approved the two concept images and full design brief produced in this
task. The local design reference is
`/Users/cubxxw/.codex/visualizations/2026/09/20/01a0bf43-979a-7341-85d4-b963db93adc0/get24-calendar-design/`.
The Linear issue explicitly requests daily contacts, Sessions and calendars,
person-based history and past-week/future-month retrieval for Agent use.

Current code has meeting drafts, revisioned edits, source revocation, expiry,
and ICS export. It has no unified historical activity projection or shared
server-owned manual schedule lifecycle. iOS calendar-local records are not
server truth and cannot silently be imported into this scope.

## Approach

Use current source objects for person and Session projections, with runtime
authorization/retention checks and stable account-bound pagination. Group
Session turns per local day, preserving Session identity across days. Separate
recorded time from occurrence/planned time and never infer meeting completion.
Add a minimal user-authored internal schedule domain for appointments/reminders,
including revision, operation identity, cancellation/deletion and recovery.
The source records remain authoritative; the timeline is a read model.

Use one authenticated desktop route retaining legacy meeting-draft deep links,
with timeline/week/month layouts, URL scope, a context inspector, day/month
navigation, person/type filters, clear range boundaries, keyboard support and
empty/loading/error/retry states. Unknown actions must preserve their intent.

Range review uses only the requested authorized range and presents source
links and coverage. It must not read arbitrary private conversation bodies or
persist a new ungoverned memory. The implementation must make provider failure
and incomplete coverage explicit.

## Milestones

1. **Complete:** establish contracts, isolated implementation and owned sources.
2. **Complete:** backend activity/schedule/review lifecycle with real PostgreSQL tests.
3. **Complete:** shared Web/macOS views, editor/recovery and native file handoff.
4. **Complete:** browser/native acceptance and independent review of interaction refinements.
5. **Active:** PR #218 created; pass exact-head CI, merge, deploy required backend/Web,
   read back the served revision and required behavior, then close GET-24.

## Completion evidence

- Deterministic account isolation, stale scope, source deletion, expiry,
  pagination, cross-day/timezone/DST, duplicate operations and revision tests.
- Real PostgreSQL integration checks for the new backend paths.
- Rendered desktop, narrow, empty, populated, error, keyboard and dark states;
  actual time navigation, filters, inspectors, mutations and export handoff.
- macOS product surface navigation and handoff verification, without iOS
  Simulator unless native iOS code becomes affected.
- Independent review with no unresolved P0/P1, current-head CI, merged PR,
  applied migration/service revision and final Linear state readback.

## Risks and open observations

The shared product currently has no remote-page EventKit bridge. Preserve that
architecture; destination-controlled calendar import remains an explicit step.
Current Session retention is thirty days, and time navigation must not imply an
unlimited historical archive. A time range with no readable records must not
recover expired data or invent events.

Storage audit: 130 GiB available, simulator pool intact; one pre-existing Docker
project is outside the resident allowlist. Do not clean another task's stack.
All task fixtures and test services must use separately owned disposable state.

## Current delivery checkpoint (September 21)

This checkpoint supersedes deployment and PR status in the historical progress
below. PR218 is ready/open. The first fully green head `9624f106` could not merge
because main advanced and the active ruleset requires a current base. At the
next head `20ea8d75`, Web1058 tests, backend619 tests, fourteen separate real-PG
time integration cases, macOS and Security passed. The iOS release smoke failed
Apple accessibilityAudit Code=-56 at the pre-confirmation AX5 dark heading,
including one same-runner simulator restart. The independent reviewer found no
application assertion or contrast failure and recommended one fresh hosted
runner on the final combined head without weakening the audit. Both Vercel
previews failed deployment quota; those statuses are not counted as passing.

Main `541c3e5e` adds a separately reviewed, ephemeral private-conversation route
and workspace shell. It is now integrated without conflicts. Its runtime owner
holds the sole deployment window until returning exact revision, migration and
provider receipts. PR223's normal-conversation draft fix merged as `56ab027d` and is also
integrated, with a coordinated main hold during native CI. Independent backend
and frontend reviews found no new P0/P1/P2 across Time/private-route, shared-shell
and normal-conversation draft boundaries. Integrated focused tests passed135
backend and65 Web cases; docs and migration policy passed.

The resident currently has78 migrations. The GET24 upgrade rehearsal proved
79 entries, immutable checksums and repeat-apply timestamps on real PostgreSQL;
its owned test stack and volume have been removed. Prepared20ea backend/Web
artifacts are inactive and will be superseded by a clean final merged release.
After final-head gates and merge, deploy the combined backend/Web, read every
resident migration checksum, and run the reviewed synthetic authenticated Time
lifecycle, ICS and live-provider range review. Its temporary identity receipt
contains no credentials and is removed only after verified scoped cleanup.
No GET24 production activation or Linear completion is claimed. Linear was
read back In Progress earlier; current browser-control failure prevents another
readback until the surface recovers.

### Final admission-fix baseline

Real resident acceptance of the ordinary-conversation queue found that first
admission unmounted the composer and could lose continued typing. PR225 fixes
this with native History synchronization while retaining the live controller.
Its independent review closed cross-tab draft, delete/reset and pending-route
findings. The Time-specific reviewer verified pending/committed Time navigation
and popstate cannot be overwritten by late admission, with Time drafts and
receipts unchanged. The four-file fix merged as `8995e528`; all its applicable
GitHub and both Vercel checks passed. This branch now incorporates that baseline.
The other delivery owners agreed to no further main changes during GET24's
final check/merge cycle. The preceding GET24 heada1e2 passed Web1102, backend669,
real-PGTime14/14, macOS and Security; its in-progress iOS result is not substituted
for the new final head. Prepared a1e2 images remain inactive. Resident78 migration
rows were independently rechecked against final source with all old timestamps
unchanged. Combined release, live Time acceptance and Linear closeout remain
pending final-head gates and merge.

## Progress (historical evidence)

- Baseline fetched and dedicated worktree created; dependencies installed.
- Approved design and current shared desktop architecture inspected.
- Contracts, BFF routes, timeline/week/month, manual schedule lifecycle UI,
  account-bound tab-local recovery intents (one day maximum), and calendar export
  are implemented. Mac uses WKDownload with exact-origin checks and NSSavePanel.
- Pi backend task: `20260920-233002-0661ce81`, frozen contract base `64430a77`.
- Full Web suite passed: 909 tests, one live-provider test skipped. Full backend
  suite passed: 564 tests; 193 integration tests skipped without their dedicated
  environments. Separate GET-24 PostgreSQL integration suite passed 14/14.
- Focused backend/schema tests passed 69/69; frontend range/storage/export/BFF
  checks passed. Latest navigation regression suite: 15/15; typecheck and ESLint
  passed. Production Next build passed on implementation commit `55bcc7ad`.
- Mac build and WorkspaceOriginTests passed with owned DerivedData/result bundle.
- Independent frontend/native and backend reviewers closed all reported P0/P1/P2
  findings: source revalidation, prompt budgets, redaction, stale editor reads,
  unknown mutation recovery, concurrent drafts, selection and logout isolation.
- Real IAB on the isolated fixture account verified timeline/week/month rendering,
  cross-midnight date labels, person/type scope, create/edit readback, and range
  review coverage. The review provider is an explicitly labeled synthetic stub;
  this is UI/integration evidence, not real-model quality evidence.
- Real rapid selection exposed stale Next navigation state. Same-page history now
  composes patches from the current URL synchronously, with tests for fast filters,
  fast relative navigation and popstate editor cleanup. The week hours region
  starts at 08:00 while retaining overnight records and keyboard scrolling.
- Calendar generation notice is verified. Narrow 800 px month rendering, keyboard date edits with persisted readback,
  cancellation, and dark/empty states are verified. CDP theme/viewport overrides
  were restored. Native macOS Cmd-2, authenticated Time, NSSavePanel saving and
  cancellation all passed using a separate synthetic-test bundle ID. The actual
  410-byte calendar file has correct UTC start/end, the selected 15-minute alarm,
  no private note/attendees, and a maximum physical line length of 60 bytes.
  SHA-256: `9eb85f60b26fa659ea58cab663e45cad19b881f690444309e692b4d7241bb9b8`.
  No event was imported into a user's system calendar.
- Owned PostgreSQL 18 test stack: Compose project `get24-time-test`, port 55434;
  no production database is used. Teardown is required before final delivery.
  Host resource contention caused occasional fixture read timeouts; retry restored
  reads. Do not count those failed attempts as passed checks.
- Migration renamed to `074_time_workspace.sql` to preserve parallel PR #216's
  `073_account_onboarding.sql` (already applied to the resident backend). Rebase
  after that PR merges, preserve both checksums, recompute the migration freeze,
  then deploy in coordination with that task. No resident service is replaced yet.
- PR: [#218](https://github.com/getyak/talent-signal/pull/218), draft/open.
  First implementation head `55bcc7ad` passed Web quality, Backend quality,
  repository/docs and security. An unchanged Python subprocess test hit its
  5-second CI deadline; the focused local reproduction passed and the failed
  workflow jobs passed on rerun, including CI required and Security required.
  The two Vercel checks report
  `Deployment rate limited — retry in 24 hours.` This is not a passing preview.
- Final UI refinement adds one clear-filters action, preserving date/view/timezone
  and the editor-discard guard. Independent review found no new issue.
- Formal local evidence is retained in the accepted design directory's
  `implementation-evidence/`: verification JSON, native test result bundle and
  the actual synthetic calendar file. No credentials are included.
- No merge, resident deployment or Linear completion. PR #216 remains unmerged;
  its active onboarding/Apple release must be preserved. Linear's native UI did
  not respond during evidence update attempts, so no issue state was changed.
- After dependencies recover: rebase latest main, preserve migrations 073/074,
  rerun exact-head gates, merge, deploy/read back backend and Web revisions and
  authorized behavior, then close GET-24. Do not treat this draft PR as delivery.

## Migration and merge follow-through

The user explicitly requested completing migration and merge. On September 21,
GET-24 was first integrated with the reviewed PR216 head `241a612e`, preserving
`073_account_onboarding.sql` and `074_time_workspace.sql` byte-for-byte. The
resident database confirms the onboarding checksum
`d1e1b56bece6b4c1982f11f7c21a5468063cbf749662e5bdd623e59f4bcf08b4`.

PR217 then merged as `7ae47717`, adding the separately published
`073_conversation_queue.sql`. The PR216 owner is integrating that new main,
retaining the exact historical names/checksums and an explicit prefix-collision
allowance. GET-24 must be replayed onto that merged main and its final manifest
must contain all 79 migrations. No resident service is changed before that
handoff and current-head verification.

The new time schema is now a required readiness dependency. Missing migration
074 returns 503, and the existing PostgreSQL CI step now runs all fourteen time
workspace integration cases. The initial local app test attempt used stale
compiled contracts from before onboarding integration; rebuild dependencies
before counting the corrected run. An isolated PostgreSQL18 proof stack owns
port55434; it must be removed after retained evidence is saved.

### Integrated migration proof

The final dependency integration at PR216 head `05fb1abd` retains its complete
78-entry manifest as a prefix and appends only `074_time_workspace`. The reviewed
79-entry digest is
`855bcb306376a075a6968b78b3dc19d8c0c69c90c23686a257fd6a3f46618d60`.
Independent review found no new P0/P1/P2; queue completion continues to append
canonical Session turns with accepted timestamps, preserving time projection.

An isolated PostgreSQL18 database was initialized using the active
`talent-signal-backend-local:auth-81c2f0cb` image to reproduce the resident
77-migration onboarding baseline. Upgrading with this branch applied the queue
and time migrations, preserved every existing checksum, and matched all 79 SQL
files. Running migration again changed neither checksums nor applied timestamps.
The new readiness route returned 503 before upgrade, then200 with migration074.
The upgraded schema passed14/14 time integration tests. Integrated Web/backend
type checks,29 readiness/system-health tests,13 migration-policy tests, and
docs/wiki/architecture checks passed. These are synthetic isolated database
proofs; they do not claim the resident migration has run.

Formal proof is retained at the design evidence directory under
`implementation-evidence/migration-merge/upgrade-result.json` and its related
check summaries. The final main-based commit and deployment receipts follow
once PR216 merges and PR218 passes all current-head gates.

PR216 merged as `9b4ea5fe747fc8ffceea2ee0d3fae1c28fe2bca1`. Its merged tree
matches the reviewed dependency head byte-for-byte. GET-24 was rebased onto that
main with no additional code conflict. The authentication task handed over the
resident deployment window; the final combined main release must retain the
existing Apple signing configuration and both audiences. Real owner Apple
password/Passkey authorization remains that task's pending user acceptance.
The isolated PostgreSQL proof stack was stopped and removed after evidence
preservation. PR218 current-head CI, merge and resident activation are now the
remaining delivery steps.
