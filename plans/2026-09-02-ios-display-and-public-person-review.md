# iOS display preferences and public-person review

Status: ready for delivery
Owner: Codex
Started: 2026-09-02

## Outcome

Give recruiters a calmer, denser mobile retrieval workspace that can be tuned
without breaking system accessibility, and close the existing public-person
research loop: an Agent result may show a cited, unconfirmed public profile and
the avatar's rights state; the recruiter may inspect and edit the proposed card
fields; only an explicit confirmation may create or attach a Talent Signal
Person and publish the selected headline into the governed People projection.

Completion is observable when text size and card density change immediately
from Settings, compact People/Sessions remain legible on small and accessibility
layouts, public research exposes source/match state plus an avatar-rights
boundary, the
review action reuses the existing idempotent contact gate, and the resulting
canonical People readback shows only recruiter-confirmed profile fields whose
source remains authorized.

## Boundary

In scope:

- independent `Text size` and `Card density` preferences stored on device;
- three relative text presets that continue to respect system Dynamic Type and
  never reduce accessibility categories;
- compact, standard, and comfortable retrieval-card metrics;
- title, role/Pursuit, recency, unread, participant, and current attention
  metadata on People and Sessions;
- public-source avatar availability, biography, match basis, platform, and
  profile link in an explicitly unconfirmed Agent result, with the avatar
  itself kept link-only until an explicit display right exists;
- a `Review contact` transition into the existing protected contact proposal;
- editable card headline, rights-gated avatar inclusion, identity lookup, exact
  create/attach confirmation, idempotent retry, canonical receipt, and source-
  authorized People readback;
- English/Simplified Chinese, VoiceOver semantics, dark mode, reduced motion,
  small/large iPhone, and AX5 regression evidence;
- PR, merge, and the repository's automatic internal TestFlight release path.

Out of scope:

- face recognition, reverse-face search, biometric matching, private profiles,
  cookies, contact-detail scraping, background checks, person scoring, or
  acceptance prediction;
- automatically accepting a public match, preselecting an existing Person, or
  creating a contact without the current human decision;
- loading research into canonical relationship context before confirmation;
- changing external Contacts, ATS, CRM, calendar, or messaging systems;
- a generic theme builder or per-screen typography matrix.

## Design and authority decisions

The display model follows two layers. System Dynamic Type remains the
accessibility authority. Talent Signal adds a relative reading preference like
modern messaging products: text and list density are separate, changes are
previewed in Settings, and accessibility categories are never shifted smaller.

Public-person results remain Agent artifacts. A provider-returned avatar URL
does not grant display or storage rights. TikHub results therefore keep the
avatar at the source; a future provider may unlock preview and inclusion only
with an explicit display license or profile-owner consent. `Review contact`
copies exact source fields into an editable proposal. The existing contact
operation remains the only creation gate. A confirmed public headline is
stored as a reviewed, revisioned person-card derivative linked to the governed
contact source; People returns it only while that source and authorization are
active.

## Milestones

1. **Completed — isolate and baseline.** Work from latest `origin/main`,
   record current UI/runtime/release state, and preserve the unrelated dirty
   macOS worktree.
2. **Completed — display preferences.** Add Settings controls, environment
   mapping, compact card metrics, and deterministic preference tests.
3. **Completed — research review model.** Carry public-profile provenance into
   the protected contact draft and render avatar/source/review affordances.
4. **Completed — canonical promotion.** Extend the governed contact intake and
   People readback for explicitly confirmed headline/avatar metadata with
   authorization-aware disappearance.
5. **Completed — release proof.** Run backend/contracts/iOS checks and inspect
   rendered default, compact, Chinese dark AX5, missing-avatar, failed-avatar,
   ambiguity, retry, deletion, and canonical readback states.
6. **In progress — delivery.** Commit only this clean worktree, open a PR, wait for
   required checks, merge, and verify the automated iOS/TestFlight release
   receipt or report the exact external gate that prevents publication.

## Review evidence

- `pnpm backend:ci` passed the Agent suite and all 33 backend test files; the
  final backend run passed 231 tests, including exact provenance, licensed and
  unlicensed avatar, deletion, retention, and authorization-aware People cases.
- `pnpm ios:check` passed the Release simulator build, all 263 iOS unit tests,
  and all eight isolated smoke journeys. The merged result bundle is
  `/tmp/talent-signal-ios-density-final.e2jx2F/results.xcresult`.
- After rebasing onto `origin/main` at `24fdedb`, the combined Release build
  and four overlapping UI journeys passed again: display settings, compact
  People search, Today inline decisions, and Chinese dark AX5. That result is
  `/tmp/talent-signal-rebase-ui.RL37DT/results.xcresult`.
- Focused UI evidence passed for separate text/density settings, compact People
  search, independent People and Session cards, unread/attention metadata, and
  Chinese dark AX5 with reduced motion. Rendered screenshots were inspected at
  default and accessibility sizes; no content or tap target was compressed to
  create the denser surface.
- `pnpm docs:check`, `pnpm ios:localization:check`, and `git diff --check`
  passed. Migration `038` also applied in a fresh Docker-backed local check.
- Review verdict: the slice is ready to merge. Public biography remains a
  review-only Agent observation; current TikHub avatars remain at source;
  canonical headline/avatar metadata requires an exact source, explicit person
  decision, confirming user, lawful avatar basis, active authorization, and
  reversible source lineage.

## Replanning signals

- Stop canonical profile publication if the source cannot remain attributable,
  authorization-aware, and retractable after deletion or revocation.
- Keep the avatar in the unconfirmed result only if persisting it would require
  a parallel source of truth or an unreviewed external fetch.
- Prefer one combined preview over additional preferences if two controls make
  the Settings task harder to understand than the retrieval benefit.
- Do not release if an accessibility size is reduced, identity is preselected,
  a public-source result becomes confirmed without review, or destination
  readback cannot prove the created Person.
