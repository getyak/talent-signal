# iOS workspace menu and setup

## Outcome

Replace the visually dominant iOS menu sheet with a quiet workspace utility
surface. The signed-in recruiter can identify the active account, finish the
smallest useful Action Button setup, reach review work, choose the interface
language, understand the fixed approval boundary, and sign out without the
menu competing with Today.

## Boundary

In scope:

- the `RelationshipMenuView` information hierarchy and presentation;
- compact account identity and canonical/preview scope;
- an Action Button and App Shortcuts onboarding path backed by the existing
  three App Intents and Apple's `ShortcutsLink`;
- account, language, approval, and sign-out destinations;
- a compact route to the existing Proposal inbox;
- iOS UI tests and Simulator visual proof for the changed surface.

Out of scope:

- changing iOS Action Button system settings from inside Talent Signal;
- adding App Intents or external execution authority;
- editing server account identity or workspace membership;
- moving Proposal ownership away from canonical Pursuit state;
- changing Today, Sessions, People, capture, or Agent behavior.

## Current evidence and design read

- The supplied iPhone screenshot shows a medium sheet led by a large brand
  tile and an expanded review item. It repeats the product identity, consumes
  most of the first viewport, and makes settings secondary.
- `Today` already owns current governed attention. The menu should route to
  review without becoming a second attention feed.
- Existing App Shortcuts expose `Capture Signal`, `Record Signal`, and
  `Review screenshot`. Apple provides `ShortcutsLink` to open this app's page
  in Shortcuts; the user must still bind a shortcut from iOS Settings.
- Account editing is not supported by the current backend. The menu may show
  canonical account scope and provide safe sign-out, but must not present
  read-only identity as editable.

Surface: iOS Today utility menu.

Audience: an independent recruiter opening the menu one-handed between
conversations.

Question: "Which workspace am I in, and what small setup or preference can I
change here?"

Character: warm paper, native grouped rows, compact graphite identity, and no
vermilion unless a consequential review state needs attention.

Two rendered structural directions are compared:

1. The supplied current build: branded identity tile followed by an expanded
   Proposal inbox. It is recognizable but visually loud, duplicates Today,
   and pushes configuration below the fold.
2. A compact utility workbench: one account row, one conditional setup prompt,
   and grouped navigation rows for review, Action Button, language, and
   approval/account controls. It preserves the same capabilities while making
   the first viewport task-oriented.

Direction 2 is selected. The existing screenshot is the baseline render; the
Simulator screenshot from the changed build is the acceptance render.

## Milestones and proof

1. Implement the menu and child destinations.
   Proof: the first medium-sheet viewport contains no oversized mark or
   expanded Proposal card; account, setup, and utility rows remain reachable.
2. Preserve governed behavior.
   Proof: a pending Proposal still opens exact review; Action Button guidance
   opens Shortcuts without executing capture; sign-out retains local deletion
   checks.
3. Verify the real surface.
   Proof: focused tests and Debug build pass; a booted iPhone Simulator shows
   the menu and Action Button setup in light and dark mode, with 44-point
   targets and readable large text.

## Decisions that would change direction

- Editable account profile fields require a backend contract and canonical
  write path.
- Detecting whether the hardware Action Button is actually bound requires a
  supported system readback; until then completion is explicitly
  user-acknowledged.
- Configurable external actions require an exact-effect model, per-action
  approval, idempotent execution, and verified receipts before appearing as
  enabled settings.

## Completion evidence

- The iPhone 17 Pro / iOS 26.5 acceptance render replaces the oversized brand
  tile with a 44-point initials avatar, a compact account row, one conditional
  setup prompt, and counted utility rows. The first viewport no longer repeats
  candidate details from Today.
- Action Button setup lists the three existing App Shortcuts, opens the app's
  Shortcuts page through Apple's `ShortcutsLink`, and states that shortcut
  selection does not confirm facts, start the microphone, or create external
  effects. Completion remains a user-confirmed device preference because iOS
  provides no binding readback.
- Account identity is visibly read-only. Canonical scope, email when available,
  workspace label, privacy boundary, local deletion notice, and safe sign-out
  remain reachable without inventing an account-edit API.
- Five focused Simulator UI tests pass for the compact menu, Action Button
  onboarding, Proposal routing into exact evidence, English/Chinese switching,
  and dark-mode AX5 target size and hierarchy.
- Debug and Release iOS Simulator builds pass. The localization boundary passes
  with 171 catalog keys, and `pnpm docs:check` passes.
