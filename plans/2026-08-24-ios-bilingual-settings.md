# iOS bilingual settings

## Outcome

An iOS user can open Settings from the existing Talent Signal menu, choose
Follow System, English, or Simplified Chinese, and see the preference persist
and update the core workspace immediately. The settings experience should feel
quiet, clearly grouped, and spacious while retaining native accessibility.

## Boundary

In scope:

- the app-level persisted language preference and locale injection;
- a working Settings destination inside the existing menu;
- English and Simplified Chinese copy for Settings, menu, top-level navigation,
  Today, Pursuits, People, and their loading, empty, no-action, and failure
  states;
- stable accessibility identifiers and deterministic tests;
- an iPhone light-mode and dark-mode visual check at standard text size.

Out of scope:

- translating recruiter evidence, candidate names, source content, or backend
  strings that must remain attributable to their source;
- translating every deep capture, evidence-review, or recovery workflow in this
  first slice;
- changing canonical workspace state or any external system.

## Current evidence and unknowns

- `RelationshipMenuView` currently renders Settings as a static `Label`, so no
  settings route or preference exists.
- `RelationshipArchiveView` is the normal iOS root and owns the Today,
  Pursuits, and People surface.
- The app supports iOS 16, so shared preference ownership should use
  `@AppStorage` and environment values rather than iOS 17 Observation APIs.
- The worktree contains extensive unrelated in-progress changes. This slice
  will only touch iOS app wiring, relationship workspace UI/tests, generated
  Xcode project metadata, and new files owned by this plan.

## Approach

Use a small `AppLanguage` value type with a stable UserDefaults key. The app
root owns the stored selection and injects both the selected language and its
Locale. The settings view uses a native grouped List with generous row spacing,
plain-language descriptions, and a checkmark that is not dependent on color.
Known application chrome is translated in the view layer; governed and
source-authored content remains verbatim.

Rejected for this slice:

- a custom card grid, because settings benefit from native row semantics and
  Dynamic Type behavior;
- automatic translation of evidence or backend text, because that would blur
  provenance;
- a new top-level Settings tab, because Settings is secondary configuration and
  the existing menu already provides the intended entry point.

## Milestones and proof

1. Add preference/localization primitives and a navigable Settings screen.
   Proof: unit tests cover selection fallback and language resolution.
2. Apply localized copy to the core workspace without changing identifiers or
   canonical data. Proof: existing English UI tests remain valid.
3. Add a UI test that switches Chinese and English and confirms the visible
   navigation and settings state.
4. Regenerate the Xcode project, build, and run the narrow relevant unit/UI
   tests.
5. Capture and inspect rendered English and Chinese settings/workspace states,
   including dark mode, then review the diff for unrelated changes.

## Decisions that would change direction

- A requirement to localize all deep evidence-review and capture flows would
  expand this into a separate localization inventory and release milestone.
- A requirement to sync language between devices would require an authorized
  account preference contract rather than local `UserDefaults` storage.

## Completion evidence

- The Debug simulator build completed successfully with iOS 16 as the minimum
  deployment target.
- `RelationshipArchiveTests` completed 17 tests with no failures, including
  language fallback and explicit-language override coverage.
- The focused UI tests passed for the current editorial Today surface,
  Simplified Chinese and English switching, and dark-mode Settings hierarchy.
- Rendered iPhone screenshots were inspected for the Simplified Chinese
  Settings page, the Simplified Chinese core workspace, and expanded dark-mode
  English Settings. The inspection exposed and fixed the inherited half-height
  sheet before completion.
- `pnpm docs:check` passed, including canonical documentation, Wiki, and
  architecture diagram checks.
- Recruiter evidence, candidate names, and backend-authored content remain
  source-verbatim; this preference changes interface guidance only.
