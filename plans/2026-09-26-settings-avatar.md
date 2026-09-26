# Focused settings and configurable identity

## Outcome and boundary

Make settings readable and immediately editable, with quiet progressive disclosure.
Web keeps settings inside the workspace. The signed macOS app opens the same
account preferences in one independent settings window without navigating or
reloading the main conversation. Personal and contact avatars share stable,
local rendering with explicit preview, save, cancellation and recovery.

The user authorized Figma refinement, implementation, verification and a PR.
GET-50 is the delivery issue. Existing unrelated edits remain in the primary
checkout; this work lives on `codex/settings-avatar` in a managed worktree.
No production deployment, credential changes or unrelated feature work is included.

## Evidence and decisions

- The current settings overview repeats read-only values and advanced links;
  profile editing requires another navigation. Native settings exposes only
  connection/update/device controls while workspace settings navigates the main
  WKWebView. The signed Swift app is the relevant desktop host.
- Use persistent named sections and one content pane. Personal profile opens
  first; visible Edit and Change avatar actions replace ambiguous read-only rows.
  Security, workspace and connection capabilities retain existing authorization.
- The settings WKWebView shares the origin-specific website data store with the
  main view. Presentation metadata hides the workspace shell inside this window;
  it grants no native capability or authentication. Native-only settings remain
  accessible when the service is unavailable.
- Avatar generation uses pinned local DiceBear Shapes/Glass definitions. The
  selected seed is stable; shuffle only changes a draft. Uploads remain bounded
  local display preferences, isolated by signed-in scope. There is no claim of
  cross-device avatar synchronization or remote image processing.
- Reject a giant settings overview and a second nested modal inside the main
  macOS web view: both obscure the current task or edit affordances.

## Milestones

1. Complete: editable Figma profile, desktop window, appearance and avatar views.
2. Complete: shared settings/profile/appearance and native window implementation.
3. Complete with a native UI environment limitation: Web surface verification,
   focused tests, lint/typecheck/build and native route/store isolation checks.
4. Delivery: ready for PR review with Figma and GET-50; native GUI proof remains
   required before release.

## Completion evidence

Figma board: https://www.figma.com/design/7Z8yHplvwjVhpq8IuKv87f?node-id=34-2976
Existing avatar library: https://www.figma.com/design/7Z8yHplvwjVhpq8IuKv87f?node-id=34-1131

- Web: 57 focused tests across 14 suites passed across the initial run and
  focused follow-ups. One avatar interaction exceeded the default five-second
  timeout under host contention; the isolated rerun passed with a 15-second
  budget. The final recovery tests cover unreadable images and hydration-time
  theme synchronization.
- Changed Web source lint and TypeScript passed. Full Next production build
  passed using an isolated output directory and a throwaway build-only secret.
- Authenticated browser checks used only the disposable synthetic workspace:
  profile edit/save/readback/reload; real DiceBear shuffle/save/cancel/reload;
  Escape and focus return; photo upload/remove and corrupt-image recovery;
  theme and avatar propagation between two tabs; light/dark and 390px layout.
  Screenshots are local review artifacts under `output/playwright/settings-avatar/`.
- macOS build passed. Fifteen focused native settings/origin/connection tests
  passed, including separate WKWebViews sharing the origin-specific data store
  and a settings command that leaves the conversation URL unchanged.
- Native window UI validation remains unverified: the UI test runner was killed
  before bootstrapping, both unsigned and ad-hoc signed; native computer control
  also timed out. The committed UI smoke test covers Command-comma, one reusable
  independent window, offline device controls and closing/reopening. Actual
  window focus and unsent conversation continuity require a working GUI runner
  before release. No native UI pass is claimed.
- Figma board and actual generated avatar components were read back and exported.
  No production deployment, cross-device avatar sync, or server image pipeline
  is included. Avatars remain explicit per-account local display preferences.

## Verification notes

- Avatar foundation: 26 tests passed; initial settings schema/render checks had
  one expected old-overview assertion, updated for the direct editor.
- New profile recovery test caught React form auto-reset after a failed action;
  the controlled draft now stays editable on failure.
- The existing service at port 4317 returns 404 for the current password login
  endpoint. An isolated disposable PostgreSQL container on port 5486 and a
  local source backend on 4487 are used for authenticated verification. No
  shared database is migrated or seeded.
- A first highly parallel native build was interrupted during host contention;
  the resumed build uses two jobs and the same build cache.

## PR #251 CI follow-up

The Web quality job found a broken diagnostics destination: the redesign linked
to `/workspace/diagnostics`, while the authenticated route remains
`/workspace/settings/diagnostics`. The existing workspace composition test
reproduced the failure locally. Restore the actual route without weakening the
test or changing workflow gates. Local verification passed: all 18 composition
tests, the full Web suite (1,379 passed, one intentionally skipped), scoped lint
and documentation checks. The pushed revision still needs remote confirmation
from the required checks and both Vercel previews.
