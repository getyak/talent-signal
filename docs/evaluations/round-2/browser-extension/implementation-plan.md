# Browser extension craft round 2

## Outcome

Improve and directly verify the loaded Manifest V3 review surface across the
twelve Web/browser craft dimensions without changing its authority boundary.
The round is complete when the same built package has:

- a keyboard-only fixture review and explicit Submit path;
- logical focus, visible focus, ARIA state, and an inspectable accessibility
  tree transcript;
- reflow evidence at 200% zoom and long mixed-script evidence at 320 and
  390 CSS pixels;
- reduced-motion, grayscale, dark, and increased-contrast evidence;
- directly observed loading, no-action empty, permission-denied, offline,
  unknown, retry, stale-session, received, and local-deletion states;
- deterministic tests, package validation, an actual persistent-context
  load-unpacked run, build, core evaluation, and documentation checks.

## Boundary

Owned source is limited to `apps/browser-extension/**`,
`apps/chrome-extension/**`, their tests, and this round-2 evaluation folder.
The extension remains a capture review and localhost handoff surface. It does
not confirm candidate state, execute a downstream action, or prove backend
retention/deletion.

The Playwright Chromium persistent-context run may prove that the built
unpacked package, service worker, extension page, fixture UI, accessibility
semantics, and synthetic recovery states execute. It is not the user's Google
Chrome `chrome://extensions` / toolbar evidence and cannot resolve
`XS-CAPTURE-01`.

No real candidate data, login, backend write, external write, Chrome security
policy bypass, shell-launched Google Chrome, or Computer Use is in scope.

## Design read

- Surface: evidence review.
- User question: “Is this the exact evidence and localhost handoff I intend to
  submit, and what remains safe if it fails?”
- Audience: an interrupted independent recruiter using keyboard, zoom, narrow
  side-panel widths, or assistive technology.
- Canonical object: the future governed backend episode. The extension's
  reviewed draft is temporary and non-canonical.
- Provenance order: source context → exact reviewed asset → proposed fixture
  interpretation → explicit Submit decision → observed receipt.
- Attention order: exact evidence first, one Submit decision second,
  state-specific recovery third.
- Visual character: quiet warm neutral, restrained vermilion, low motion,
  semantic borders and labels rather than decorative containers.

## Meaning and state contract

- Observed source is not confirmed state.
- Fixture interpretation is proposed, ambiguous, superseded, no-action, or
  blocked and never confirmed.
- Editing the asset, retention, or target invalidates approval and request
  identity.
- No capture handoff request occurs before explicit Submit.
- Retry reuses the same idempotency key.
- Unknown cannot be resubmitted before reconciliation.
- Received is a receipt truth only; it is not a fact, action, or deletion
  result.
- Local deletion is distinct from backend derivative deletion.

## Milestones

1. Add semantic focus/state contracts and content-extreme fixture support.
2. Complete responsive, contrast, reduced-motion, and keyboard behavior.
3. Extend deterministic and package checks beyond twenty tests.
4. Build and exercise one frozen unpacked package through Chromium, saving
   direct screenshots, state/focus/AX/contrast/zoom packets, and logs.
5. Freeze the result commit, run the four required specialist lenses
   independently, adjudicate without averaging, and validate every packet.
6. Record exact twelve-dimension scores, the active veto, at most three
   remaining issues, and a clean worktree.

## Completion evidence

Machine-readable results and direct PNG evidence live beside this plan. Every
score cites those artifacts. Missing user-visible Chrome toolbar evidence stays
an explicit veto rather than being inferred from Chromium automation.
