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
- Pi will own a bounded backend/contracts implementation in its own worktree
  once the existing repository writer is idle. No concurrent Pi writer bypass.

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

1. **Active:** establish contracts, isolated implementation and owned sources.
2. Implement and verify backend activity/schedule/review lifecycle.
3. Implement and render Web/macOS time views and complete interaction states.
4. Run focused/full applicable checks, independent review, and fix findings.
5. Create linked PR, pass exact-head CI, merge, deploy required backend/Web,
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
- No product implementation or acceptance checks completed yet.
