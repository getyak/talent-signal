# Workspace navigation continuity and child-page craft

## Outcome and boundary

The user reports route changes feel like full reloads and rejects aggregate
95-point claims while child pages remain unfinished. Verify navigation network
behavior and preserve the workspace shell, then improve child-page hierarchy,
readability and state continuity. Compare against rendered handoff8e4a4b0.
Do not translate source evidence, broaden authority, or persist private page
snapshots outside the existing session boundary.

## Ownership and current evidence

Basefa37d533. Independent task conversation-craft owns shell navigation, account
menu, conversation presentation, shared type/input CSS and meeting empty detail
pane; integrate its merged main before final changes/delivery. This task owns
navigation caching investigation and remaining child pages. Pi task
20260920-181601-95648581 owns scoped cache/loading implementation; parent owns
architecture, child-page refinement, real UI review and delivery.

Existing primary links are Next Link. Installed Next docs state dynamic page
client-cache TTL defaults to0, while shared layouts stay mounted. Therefore
full-document reload is not established by source alone; record actual navigation
requests, shell continuity and warm return latency. Generic full-stage loading
copy currently reinforces a reload impression. Existing auth/private fetches must
not be made public/server-shared just to improve speed.

## Milestones

1. Complete: source diagnosis and safe directory invalidation; inventory child pages.
2. Complete increment: integrate bounded directory cache and targeted child-page refinements.
3. Active: production-mode runtime matrix; independent code review and corrections passed.
4. Pending: current-head checks, PR/merge, deployment and authenticated readback.

## Acceptance

For navigation, prove no new document request on internal links, stable shell,
warm route behavior, no cross-account data, expired-session clearing, mutation
invalidation, back/forward and retry. Any measurements must name environment.

For each page (people/person/today/calendar/settings/drilldowns/connections/sources)
record populated/empty/error states, desktop/narrow, keyboard and light/dark.
Assess hierarchy25, typography/spacing25, interaction/state25, accessibility25.
Target95+ per page, not a whole-app average concealing a weak page. Missing evidence
is unverified and cannot be awarded points. Scores are subjective expert review;
functional tests or implementer's self-score do not certify user preference.

## Safety and cleanup

Only this task's explicitly owned registered artifacts may be removed after
proof is durable. Do not run a global sweep over other tasks' artifacts; lsof
silence is not evidence of abandonment. Preserve other active UI windows.

## Current implementation evidence

- Reference fetch confirms HEAD and origin/main both8e4a4b0.
- People search was a native GET form. It now uses Next Form (installed16.3.4
  API documentation), preserving URL query, return Session and client navigation.
- Directory distinguishes an unavailable count from empty, removes duplicated
  profile headline, labels identity handles, renders confirmed avatars with
  no-referrer and fallback, and retains relationship context on narrow screens.
- Today, People, Settings and Connections share the authenticated title token;
  Today metadata uses the existing readable metadata scale and hover no longer
  moves rows horizontally.
- Parent baseline checks: Web783 passed /1 pre-existing skipped; typecheck and
  lint passed. Re-run after Pi integration, not evidence for the final head.
- CUA rendered synthetic populated People and reference People at the same
  desktop window. Main columns align; the harness omits the production route
  header, so its vertical offset is not a production comparison. No personal
  data used. Dark/narrow attempt hit a CUA infrastructure failure: Chrome AX
  and screenshot APIs return only a window title after DevTools, including
  rebinding/reset. Those states remain unverified.
- Pi round1 rejected: full-route prefetch can retain RSC authority for5minutes;
  directory invalidation/late-result/scope disposal required stronger handling.
  Revision in progress; no global staleTimes or server cache enabled.

## Integrated review and checks

- Pi round2 integrated and reviewed. Removed whole-route prefetch; memory cache
  TTL30seconds, shared requests, binding disposal, any local401 disposal and
  successful private mutation invalidation. Parent added cache-hit microtask
  invalidation protection and fixed null-to-binding lifecycle bookkeeping.
- Recent Sessions now consumes the shared directory hook. Explicit mutation
  clears rendered rows before revalidation; composer-only saves remain quiet.
- Independent review found two P2 issues (chat-send invalidation and deleted
  rows remaining during readback), both fixed and independently closed.
- Real React/happy-dom tests prove warm-route request reuse, simultaneous-reader
  deduplication, deletion with hung/failed readback, account transition disposal
  and StrictMode. Reviewer independently ran34 focused tests. Full integrated
  Web suite831passed,1existing skipped; lint and docs/architecture checks passed.
- Merged the independently reviewed conversation-craft branch13ef27f2 locally;
  upstream PR212 subsequently merged as562e1e78. No source conflict.
- The temporary harness/log directory was removed by another task's global
  cleanup, confirmed by its owner. Test results above remain in tool history;
  replacement registered output is
  `/private/tmp/ai-test-navigation-continuity-final.J0276v`. No source lost.
- Attempted direct Next Form DOM integration outside Next bundling; its App
  Router alias requires the compiler's RSC runtime. Do not substitute mocked
  router behavior for production browser proof. Actual search navigation,
  page-level latency and remaining visual states are still pending CUA recovery.

- Operational noise correction: the last healthy diagnostic observation expiring
  no longer creates a global banner during ordinary reading. Actual unavailable,
  degraded and invalid responses retain their recovery surface; the diagnostics
  page still owns freshness. Independent review and2focused tests passed.
- The optimized build requires the existing staging Web secret injection;
  an unconfigured local build correctly refused missing AUTH_SECRET. Retrying
  with the existing Infisical wrapper, without exposing credential values.

## Remaining acceptance boundary

This increment does not certify95/100 or completion of every subpage. Open items
are actual production navigation/network timing, dark/narrow/keyboard rendered
matrix and authenticated child-page comparison. Do not infer those results from
unit tests or the prior task's visual observations. Future iterations should
address measured deductions rather than assigning an overall score in advance.
