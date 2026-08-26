# iOS input, navigation, localization, and owner profile

## Outcome

The current iOS build presents the approved Talent Signal identity, lets the
account owner reliably choose and review one image, makes foreground voice
capture visibly usable without weakening authorization, preserves horizontal
Today–Sessions–People navigation, and renders the affected paths consistently
in English and Simplified Chinese. The owner workspace contains one traceable,
user-authored `cubxxw` person profile.

## Boundary

In scope:

- the iOS application and in-product brand mark;
- the Agent composer and capture chooser;
- PhotosPicker transfer, recoverable local staging, and modal ownership;
- foreground audio affordance, permission denial, authorization validation,
  interruption, local receipt, and deletion;
- Today, Sessions, and People paging plus explicit tab controls;
- a catalog-backed localization boundary and an inventory check for remaining
  inline bilingual or uncovered interface strings;
- an account-scoped, idempotent owner-profile write and read projection for the
  existing internal TestFlight account.

Out of scope:

- uploading the original screenshot or local audio payload to a server;
- transcription, automatic fact confirmation, or external writes;
- silently translating source evidence, candidate names, recruiter-authored
  profile text, or backend-authored canonical content;
- creating `cubxxw` in every future customer account;
- publishing a TestFlight build without a separate release request.

## Current evidence and unknowns

- The approved Held Interval `AppIcon-1024.png` is byte-identical to the brand
  export, but the runtime still draws the superseded three-bar Signal orb and
  the installed TestFlight build can retain an older icon until a new archive
  is installed.
- The Agent composer disables its shared voice/send button whenever there is
  no canonical relationship scope. Voice capture is local and does not need
  that scope, so the disabled grey state incorrectly communicates that the
  microphone is unavailable.
- The audio screen also disables Start until three authorization controls are
  complete, providing no tap feedback about the missing requirement.
- PhotosPicker stages image data correctly in isolation, but a nested capture
  workbench and the root `pendingSeed` observer can both try to own the next
  full-screen presentation.
- Today, Sessions, and People already use a page-style TabView and have a UI
  swipe test. The installed behavior therefore needs build-level proof; the
  design must keep explicit tab buttons as the non-gesture and accessibility
  equivalent.
- Localization currently distributes 180 `appLanguage.text(english, zhHans:)`
  calls across views while hundreds of deeper capture and recovery strings
  remain English-only. This makes omissions inevitable and mixes translation
  policy with layout code.
- The live internal TestFlight database contains one Apple account for Xiong
  Xinwei and zero People. Production and TestFlight deliberately have no
  global seed service.

## Design read

- Surface: iOS capture, Agent composer, and primary retrieval shell.
- Audience: the signed-in independent recruiter, often one-handed and between
  conversations.
- Character: quiet warm paper, graphite structure, the Held Interval mark, and
  vermilion only for a consequential review or recording state.
- Attention: the current input or review state leads; branding, provenance,
  and alternate input methods remain secondary.

Two navigation directions were considered:

1. Replace the shell with a native bottom tab bar and place the composer above
   it. This improves discovery but competes with capture at the bottom, changes
   the established Agent-first composition, and needs a custom iOS 16 fallback
   for newer attached-accessory behavior.
2. Keep the three-item top pager, preserve explicit 44-point tab targets, and
   prove native horizontal paging in both directions. This keeps the Agent
   composer as the stable bottom threshold and is the smallest coherent slice.

Direction 2 is chosen for this pass. Reconsider direction 1 when the minimum OS
supports a native attached tab accessory or field testing shows that explicit
top tabs plus paging remain undiscoverable.

## Architecture

- Keep `AppLanguage` responsible only for persisted language selection, locale,
  and localized lookup. Store translations in an Xcode string catalog; do not
  pass an English and Chinese sentence at every call site.
- Use source-language keys for ordinary SwiftUI labels and semantic keys for
  errors, plurals, and interpolated strings. A repository check reports inline
  bilingual calls and catalog gaps. Governed/source-authored strings bypass
  localization intentionally.
- Give each modal transition one owner. The capture hub can own its nested
  workbench; the root observes queued shortcuts only when no in-app capture is
  already presented.
- Treat the trailing composer control as two actions with separate authority:
  empty draft opens foreground voice locally; a non-empty draft sends only
  with a canonical relationship scope.
- Store an optional person profile separately from identity. Its summary is
  `user_authored`, names the author and revision, and never claims evidence
  support. Provide an explicit account-targeted command for owner onboarding.

## Milestones and proof

1. Brand and input affordances.
   Proof: brand parity check; screenshots or rendered UI show the Held Interval
   mark in the header, guide rail, login, and menu; composer tests distinguish
   enabled local voice from scoped send.
2. Photo and audio reliability.
   Proof: transferable decoding and queue tests cover supported image data,
   duplicate staging, failure, and modal ownership; audio tests cover missing
   authorization, permission denial, start, interruption, receipt, retry, and
   deletion without a grey dead end.
3. Navigation and localization foundation.
   Proof: UI tests cover left and right paging plus tab taps; English and
   Simplified Chinese tests cover the shell, composer, capture, audio, and owner
   profile; the localization inventory is checked in `pnpm ios:check`.
4. Owner profile.
   Proof: schema and contract tests distinguish user-authored profile text from
   evidence; an idempotent command targets the exact internal owner account;
   API and database readback show one active `cubxxw` Person and its profile.
5. Outcome review.
   Proof: Debug and Release simulator builds, focused unit/backend tests,
   `pnpm brand:check`, `pnpm docs:check`, and a real Simulator pass when a device
   is booted.

## Decisions that would change direction

- Uploading original image or audio bytes would require a new retention,
  consent, cloud-processing, deletion, and authorization milestone.
- Sharing the owner profile across accounts would require an explicit public
  profile product and privacy decision rather than a seed.
- Adding more languages should extend the catalog and coverage gate; it should
  not add another branch to view code.

## Completion evidence

- Runtime branding now renders the approved Held Interval paths everywhere the
  obsolete three-bar mark appeared. The source App Icon remains byte-identical
  to the approved 1024px export; an installed icon changes with the next archive.
- Image selection uses an image-only `Transferable`, preserves the selected
  content type and extension, and gives the nested capture workbench sole modal
  ownership. Invalid bytes and staging recovery have deterministic tests.
- Empty-draft voice capture is independent of canonical send authority. Missing
  authorization now yields a focused explanation, denied permission offers
  Settings recovery, and foreground loss still seals the local payload.
- Empty canonical workspaces now retain the same page-style `TabView` as loaded
  workspaces. Simulator UI tests passed for Today → Sessions → People and both
  return swipes, plus explicit tab controls remain available.
- `Localizable.xcstrings` and `InfoPlist.xcstrings` compile into English and
  Simplified Chinese bundles. The automated boundary currently covers 112
  catalog keys and prevents increases above 176 transitional inline bilingual
  calls or 210 raw SwiftUI literals while printing the exact migration hotspots.
- Migration `030_person_profiles` was applied transactionally to the internal
  TestFlight PostgreSQL database without applying unrelated pending password
  migrations. Readback shows one active `cubxxw` subject, a 194-character
  `user_authored` summary, owner user attribution, and revision 1.
- Backend typecheck and all 151 backend tests passed. iOS Debug build,
  build-for-testing, unit tests, and focused photo-picker, paging, composer,
  audio, and language-switching UI tests passed on the already-booted iPhone
  17 Pro simulator. A TestFlight archive and backend API rollout remain
  intentionally outside this request.
