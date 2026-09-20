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
4. **Active:** final browser acceptance and independent review of interaction refinements.
5. **Pending:** create linked PR, pass exact-head CI, merge, deploy required backend/Web,
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

## Progress

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
  passed. A final production build remains required after UI acceptance.
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
  were restored. Actual downloaded-file/native save completion remains outstanding.
- Owned PostgreSQL 18 test stack: Compose project `get24-time-test`, port 55434;
  no production database is used. Teardown is required before final delivery.
  Host resource contention caused occasional fixture read timeouts; retry restored
  reads. Do not count those failed attempts as passed checks.
- Migration renamed to `074_time_workspace.sql` to preserve parallel PR #216's
  `073_account_onboarding.sql` (already applied to the resident backend). Rebase
  after that PR merges, preserve both checksums, recompute the migration freeze,
  then deploy in coordination with that task. No resident service is replaced yet.
- No GET-24 PR, merge, production deployment or Linear completion yet.
