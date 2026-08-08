# iOS relationship library design evaluation

Date: 2026-08-07

Verdict: **pass for a browser-rendered design direction; not yet evidence for
native production readiness.**

## Outcome reviewed

The selected Relationship Ledger replaces a synthetic workflow demonstration
with a stable People destination, task-aware filters, a living relationship
page, exact evidence, one current dependency, and an exact-effect action
review. Relationship Constellation remains a secondary question view.

## Rendered evidence

- [Current installed iOS home](current-home-before.png)
- [Selected web study](relationship-ledger-web-study.png)
- [Selected People direction](ledger-mobile-after.png)
- [Living relationship detail](relationship-detail-after.png)
- [Exact-effect action review](action-review-after.png)
- [Constellation web study](constellation-web-study.png)
- [Constellation challenger](constellation-challenger.png)
- [Dark mode with reduced motion](dark-reduced-motion-after.png)

All people and portraits in the prototype are synthetic.

## Review-standard result

### Product loop

- The default screen answers who deserves work attention without scoring
  people.
- The detail screen presents identity, current dependency, changed state,
  exact evidence, safe action, and history in a stable semantic order.
- Search, relationship slices, and work-state filters are executable.
- `no_action`, ambiguity, missing avatar, and a quiet relationship are visible.
- The action opens an internal-draft review and explicitly states that no
  message, calendar event, or CRM record will be written.

### Evidence and safety

- Consequential state is visually attached to one exact synthetic source.
- Confirmed state, unresolved dependency, evidence, and proposed action remain
  distinct.
- Identity-review copy makes no person selection on insufficient evidence.
- No external connector, contact, message, calendar, or CRM write occurs in
  the prototype.
- The interface ranks work state, never relationship strength, person quality,
  personality, or acceptance likelihood.

### System integrity

- The route is `noindex` and uses static synthetic prototype data.
- It does not become an owner of canonical relationship state.
- Capture remains intentional and separate from the daily People destination.
- Desktop CRM breadth, ambient ingestion, scoring, and decorative graphs are
  deferred.

## Direct verification

- Next development server returned HTTP 200 for
  `/concepts/relationships`.
- The page was inspected in Chromium at 1440×1000 and 390×844.
- Search, work-state filtering, tab navigation, person detail, evidence
  disclosure, exact-effect review, and both design directions were exercised.
- The filter dialog moves initial focus to its close control and closes with
  Escape.
- Chromium reported zero console errors and zero warnings during the main
  interaction pass.
- Dark color scheme and reduced-motion media preferences were emulated and
  visually inspected. The first pass exposed an inherited dark-mode heading
  contrast defect; the device-level color token was corrected and re-rendered.
- Targeted ESLint and TypeScript checks passed.
- `pnpm docs:check` passed.

## Remaining uncertainty

- No recruiter field study yet proves People over Today as the habitual first
  destination.
- Physical-device one-thumb behavior, VoiceOver rotor order, Dynamic Type
  extremes, app-switcher privacy, and reduced-transparency behavior require
  native verification.
- The browser prototype gives a dialog initial focus and Escape behavior but
  is not proof of a production-grade focus trap.
- The selected concept does not define the production contact-list API,
  offline state contract, notification policy, or deletion propagation.
