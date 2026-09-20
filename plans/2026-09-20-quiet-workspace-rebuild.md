# Quiet Workspace structural reconstruction

## Outcome and correction

PR205 changed typography and chrome but preserved the old Today-first page
composition. The user rejected that result. Rebuild the visible product from
the handoff's current interactive layout, including home, nested person pages,
settings and account identity. Reference commit: 8e4a4b0. Base: 360c5f09.
Keep production domain controllers and authorization while replacing page
composition; retaining business logic does not justify retaining the old UI.

## Ownership and boundaries

- Parent branch: codex/quiet-workspace-rebuild, isolated from dirty main.
- Pi task 20260920-114941-f2e484cd owns apps/web in its isolated worktree.
- Parent owns native host architecture, documentation, visual acceptance,
  integration, review and delivery. Do not copy prototype state into production.
- The macOS product window consumes the same server-rendered Web application in
  an unprivileged WKWebView with exact-origin navigation policy and no script
  handlers. Existing native intake remains a separate explicit window. Native
  and Web sessions are separate authorities, not implicitly shared credentials.
- No private candidate evidence in screenshots; use isolated synthetic fixtures.

## Milestones

1. Complete: conversation-first Web product composition and shared macOS entry.
2. Complete: reference comparison of home, directory, person notebook, calendar,
   sessions, connections, grouped settings, account identity and responsive states.
3. Complete: independent review; regression tests and production/native builds.
4. Active: remote PR gates, merge and resident activation.

## Observable completion

Reference home has 236px sidebar, a 680px centered conversational surface,
brand/search/collapse on one row, primary New conversation, continuous recent
sessions and people, and named account footer. Current Today-first blank page
must no longer be the default. Settings must have real category/detail structure.
Every visible control must operate against existing authenticated controllers
or disclose a meaningful unavailable state. Compare screenshots at 1440, narrow
viewport and dark mode. A separate 200% zoom audit remains outside this run. Exercise keyboard menu/search, drafts, expiry,
error and retry; compile/build alone cannot establish visual completion.

## Verification evidence

- Reference 8e4a4b0 was served locally and compared against the rebuilt product.
  Isolated PostgreSQL/backend/Web used synthetic fixtures only; no real candidate
  data or external action was needed. Temporary artifacts are removed at closeout.
- Web: 688 passed, 1 skipped; lint, TypeScript and production build passed.
- macOS: 123 passed, 5 skipped, zero failures; Debug tests and Release build passed.
- Independent Web/native reviewers closed all confirmed P0/P1 findings, including
  stale account search, duplicate sends, unmount continuation, native initialization
  order, JS confirmation and cancellation of the origin editor.
- Browser evidence: 1440px desktop, 760px person and 390px calendar; light/dark
  settings; search close/reopen with real directory results; account popover;
  person notebook and optional assistant without sidebar clipping.
- Real synthetic chat: draft survives reload; two successive turns retain one
  canonical session; refreshed history includes assistant text. Persisted passive
  history strips action payloads, and calendar links resolve canonical draft IDs.
- Native WebKit password login succeeded against the isolated service. Cancelling
  address editing preserved an unsent login field. Release only permits HTTPS;
  loopback HTTP requires a Debug build and explicit testing launch argument.
- Account popover clipping found in final production QA was corrected by allowing
  the sidebar overlay to escape its bounds; text and scroll regions remain bounded.

## Remaining risks

Native WebView requires the configured HTTPS service online. It is not an
offline local React bundle and receives no privileged bridge. OAuth that leaves
the configured origin opens only after user confirmation; password login is the
validated existing flow in the isolated environment. No signed distribution claim yet.
