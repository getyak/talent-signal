# Workspace composition and private conversation

## Outcome

Bring the authenticated conversation canvas into the OpenDesign Quiet Workspace
composition: one connected welcome/composer group, clear text hierarchy and a
single input surface. Add a separate private room with truthful retention
boundaries, streaming responses and no conversation or Memory persistence.

## Evidence and scope

- User screenshot shows a welcome far above a double-framed bottom composer,
  plus no privacy entry. Reference: local `talent-signal-design-handoff` source
  `app.tsx` and final `styles.css` overrides. Its private room hides the sidebar
  and discards ephemeral content on exit; its no-training claim is a prototype,
  not a verified provider guarantee.
- Base: `3d71a0921bcd09649ff7f1c3456c130734e4808d` (#222). Existing dirty primary
  checkout is preserved. Worktree: `talent-signal-workspace-privacy`.
- PR #223 owns legacy draft recovery. Do not regress its SSR queued-home,
  account-bound identity or unknown-send behavior; reconcile after it lands.
- GET-24 owns the resident deployment window and must merge #218 before this
  task changes main, to avoid repeatedly invalidating its long native gate.

## Decisions

1. Private chat has a dedicated route and in-memory transcript only. Entering
   never converts, deletes or republishes a normal conversation or draft.
2. Authenticated, bounded text is sent to the already configured model through
   a stateless transport. No Agent SDK session files, tools, CRM reads/writes,
   task/session rows, content diagnostics, evaluation traces or local storage.
3. The UI promises no Talent Signal history or Memory, not provider-wide zero
   retention/training. Explain the external processor boundary on demand.
4. Explicit exit aborts in-flight work and clears the room; reload/navigation
   cannot restore it. Ordinary account-bound drafts retain their existing rules.
5. Restore a coherent empty-state composition; after sending, retain the normal
   readable transcript, stable input, queue, cancellation and recovery controls.

## Milestones

- [complete] Implement server transport (Pi task `20260921-081010-c4bfd16d`)
  and parent-owned UI/composition; inspect current rendered reference.
- [complete] Compare two rendered compositions; verify light/dark, desktop/narrow,
  keyboard/IME, reduced motion, normal drafts and private exit/cancellation.
- [complete] Independent review, focused checks and production build; fix findings.
- [in progress] Coordinate main, exact-head CI, merge, resident release and authenticated
  readback; preserve proof and clean only task-owned temporary artifacts.

## Proof and limits

Private retention requires tests of actual side-effect boundaries, not an icon
or mocked success alone. Use synthetic content for provider and database
readback. Never touch the user's existing conversation draft for a UI test.
Provider policy claims require independent evidence; no such claim is accepted.
Temporary artifacts: `/private/tmp/ai-test-workspace-privacy-design.qbcotm`.

## Implementation and review evidence

- Compared rendered OpenDesign home/private room with two actual-component
  directions at 1280×720: A uses the reference serif greeting; B uses a smaller
  sans-serif greeting. Selected A for its quieter hierarchy and continuity with
  the source. The single composer remains the dominant interactive surface.
- Authenticated production build verified with a synthetic account and isolated
  PostgreSQL database: desktop and 390×844 dark UI, mobile privacy entry,
  390×430 constrained-height composer, actual model streaming, refresh clearing,
  route exit and preservation of an ordinary draft. A separate real-browser
  navigation/back test also returned an empty private room. Light/dark component
  reference comparisons were inspected; no numerical craft score is claimed.
- Independent frontend review closed login-change cleanup, mobile entry and
  old-turn retry findings. Independent backend review closed cancellation race,
  terminal-frame handling and raw/frame size limits. Final request integration
  also sends the ordinary workspace header required by the Next proxy and
  verifies it with the session binding in the BFF.
- Real configured provider answered synthetic text. Before/after hashes across
  all 147 public PostgreSQL tables were identical. No account or private text
  was sent to content observation, Agent SDK files or an action adapter.
- Web: 1043 tests passed, one existing skipped; final changed-route/component/
  shell/proxy follow-up: 51 passed including the workspace mismatch case.
  Backend provider/route: 48 passed; application hooks/authentication: 17 passed;
  actual logger redaction: 1 passed.
  A concurrent initial app run hit two timing limits and an incorrect test SQL
  assertion; the corrected isolated application suite passed in 7.15 seconds.
- Production Web build and backend build passed. Final docs/lint and latest-head
  CI are required before merge. Runtime remains owned by GET-24 until released.
- Durable local receipts: `~/.local/state/talent-signal-workspace-privacy/`.
  Screenshots and interaction observations use synthetic content only.
