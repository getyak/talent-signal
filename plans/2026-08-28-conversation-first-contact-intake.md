# Conversation-first contact intake

## Outcome

Replace the fragmented upload and contact-creation experience with one calm
conversation-first path across Web and iOS:

> simple recruiter input → bounded Agent interpretation → account-scoped
> identity check → reviewable attach/create/merge operation → canonical receipt

The product should feel as immediate as a strong messaging product without
turning chat into a system of record or letting a model execute identity writes.

## Scope and boundaries

In scope:

- one primary composer for text, image, paste, and foreground voice where the
  platform supports them;
- automatic extraction of reviewable contact clues from natural recruiter
  input;
- account-scoped duplicate lookup before a new identity is available;
- inline, stacked create/attach/merge review with exact consequence language;
- Web relationship Agent and unscoped start states;
- iOS Today, Sessions/Ask, People retrieval, and capture continuity;
- loading, ambiguity, no-match, failure, retry, cancellation, and verified
  receipt states;
- accessibility, reduced motion, dark mode, and narrow-screen behavior.

Out of scope unless current evidence requires it:

- automatic external Contacts, calendar, ATS, CRM, message, or notification
  writes;
- autonomous person merging without an explicit current preview and recruiter
  confirmation;
- a second client-side truth store or a second identity model;
- candidate ranking, confidence scoring, or personality inference.

## Current evidence

- Web already has canonical person search, governed resource intake, identity
  review, person-merge preview/apply/reversal, Agent history, and receipts.
- The Web Agent still exposes separate `Add source`, `Create contact`, and
  `Review duplicate` commands; creation expands into a long form instead of
  beginning from natural input.
- Scoped Web chat accepts image media, but the unscoped Agent start disables the
  composer and sends screenshot intake through a separate path.
- iOS Ask already supports a compact composer, Photos, foreground voice,
  recoverable Sessions, and canonical source review.
- iOS still exposes a separate Text/Photo/Voice capture chooser and duplicates
  the perceived entry point instead of letting the composer own intent.
- Existing backend contracts preserve the required human-decision boundary;
  the redesign should orchestrate them rather than bypass them.
- The worktree contains unrelated and overlapping in-progress changes. Every
  edit must preserve those changes and use focused diffs.

## Chosen approach

1. Introduce a pure, tested contact-intent draft model that turns concise
   recruiter language into proposed name, identity clue, relationship context,
   and source note. The draft has no authority and may remain ambiguous.
2. Feed that draft into the existing account-scoped person lookup. No match
   stages create; one governed match stages source attachment; conflicts stay
   unselected and may be saved for identity review. Existing duplicate pages
   continue through the canonical merge preview/apply/reversal tool.
3. Replace command-chip-first UI with a thread-first composition and progressive
   details. Keep exact evidence and consequence copy adjacent to the proposed
   operation.
4. On iOS, route the primary bottom input directly to Ask and make attachment
   types secondary controls inside the composer. Keep system Share/Photos review
   recoverable, but remove the modal mode chooser from the ordinary path.
5. Preserve the familiar top Today, Sessions, and People navigation as the
   stable retrieval surface. Keep only the global composer one thumb away at
   the bottom, with receipts returning to the same Session.

Rejected alternatives:

- retaining several upload forms with only visual restyling;
- silently creating or merging identities from a model response;
- storing Agent prose as relationship truth;
- rebuilding the existing canonical identity and merge services in clients.

## Milestones and proof

1. **Intent and review model**
   - pure parser/draft model and tests cover English/Chinese, missing name,
     identity clues, relationship context, ambiguity, and ordinary questions;
   - no parser result can commit a write.
2. **Web conversation intake**
   - one composer stages a prefilled create/attach review from natural input;
   - duplicate lookup is automatic and create is unavailable during conflicts;
   - the existing merge tool remains explicit and returns a receipt;
   - no redundant upload/contact command row remains in the primary state.
3. **iOS conversation continuity**
   - Today/Sessions/People retain the prior elegant top navigation while a
     common global compose affordance stays at the bottom;
   - text, Photos, and voice enter Ask without the capture-mode chooser;
   - system capture resumes in the same Agent Session after governed review.
4. **Verification**
   - focused unit/UI tests, lint, typecheck, builds, docs, and whitespace pass;
   - real browser proof covers natural input → no-match create proposal and
     possible-match attach/merge review without an unintended write;
   - Simulator proof covers Today → Ask → image/voice/text → review → receipt,
     plus interruption, Dynamic Type, dark mode, and reduced motion.

## Design read

Primary surfaces: desktop relationship workspace and iOS Today/Session.
Audience: an independent recruiter capturing a relationship change under
interruption. Character: editorial, warm, restrained, conversation-led, and
precise at consequence. The single visual lead is the current reviewable
operation, never the Agent identity or a person score. Canonical objects remain
Person, Pursuit/relationship context, governed source, Proposal, Action, and
Receipt; conversation is only the intent and coordination projection.

## Completion boundary

This plan is complete only when the fragmented primary entry points have been
removed from both real products, the canonical create/attach/merge path works
from a concise input, and browser plus Simulator evidence proves the full
review-and-receipt loop. Static mockups or passing builds alone are insufficient.

## Progress — 2026-08-28 iOS identity lookup slice

- Added a pure iOS contact draft and match policy with English/Chinese, phone,
  email, LinkedIn, missing-name, ordinary-question, source-preservation, and
  same-name safety coverage.
- Reused the canonical `/v1/people/search` tool for read-only account-scoped
  confirmed/expired identity-handle lookup; the client does not infer identity
  from names.
- Added explicit checking, no-match, possible-match, failure/retry, and
  create-separate states to the existing contact proposal without changing the
  top navigation or bottom global composer.
- Corrected the confirmed contact source to `contact_record` with a
  `contact_field` locator, and added a destination/source receipt after the
  explicit write confirmation.
- Added explicit current-versus-historical identity conflict handling. Current
  owners remain selectable, historical owners stay visible but locked, and the
  recruiter may preserve the source as an unresolved identity case. A conflict
  cannot silently create a second person or merge records.
- Proved the canonical no-match create, confirmed-owner attach, and recycled
  identity conflict paths against the real local backend on iPhone. Every path
  requires an explicit recruiter decision and returns a canonical source
  receipt or identity-resolution case.
- Protected unknown-outcome recovery with the original target, identity-clue
  confirmation, capture time, and idempotency key. After a committed response
  is lost and the app relaunches, refreshed identity results are read-only and
  retry can only replay the same operation. The response-loss proxy observed
  two identical request hashes and no differing JSON path.
- Verified 11 focused contact-intake tests, protected recovery persistence,
  real create/attach/conflict UI tests, response-loss relaunch recovery, the
  AX5 dark Chinese contact surface, backend typecheck, localization boundaries,
  and whitespace.
- Connected the Web Agent composer to the same concise natural-input model,
  including short relationship labels such as `for Design`. The result appears
  as a compact proposed-only card with account-scoped create/attach/identity
  review; form details stay collapsed unless information is missing.
- Removed the sticky commit footer that obscured identity results in the first
  viewport. The identity check is now the visible lead, while create/attach
  actions appear only after the recruiter reviews the result.
- When the currently open person has another exact-name page, the contact card
  now opens the existing reversible person-merge tool directly. It does not
  merge from conversation or expose that action for an unrelated current page.
- Added Web foreground voice input to the same composer used for natural contact
  and relationship messages. With no text the primary control is a microphone;
  once an editable transcript or typed message exists, the same position becomes
  Send. No extra upload page or fourth composer control remains.
- The first Web voice use discloses Doubao processing and the non-retention
  receipt before microphone access. Browser audio is bounded to 60 seconds,
  downsampled to 16 kHz mono PCM WAV, cross-origin rejected, cancellable during
  transcription, and discarded on foreground loss. A transcript only edits the
  draft; it never submits an Agent task.
- Real browser verification covered first-use disclosure, unavailable-microphone
  recovery, and microphone-to-Send transition without changing Today / Agent /
  People navigation. iPhone verification covered the common bottom entry,
  Photos and voice controls, editable unsent transcription, AX5 layout, and 12
  interruption/permission/deletion unit cases.
- Simplified the iOS screenshot review from three equally weighted form cards
  into two evidence-first steps: reviewed text, then identity and purpose.
  Identity clues stay visible; optional relationship fields are disclosed only
  on request. Speaker review is a compact native menu and unresolved remains an
  explicit valid result.
- Replaced the unreliable relationship `DisclosureGroup` hit area with a 44 pt
  stateful button after executable UI testing exposed that its apparent tap did
  not consistently reveal accessible fields. The focused test now proves the
  collapsed default, all retained editable fields, and the absence of person
  binding before submission.
- Simulator visual proof covers a standard English iPhone and Simplified
  Chinese dark AX5. The new hierarchy has no clipping or horizontal overflow.
- Removed every raw static interface literal from the iOS screenshot review
  surface and routed 89 review, source-inspection, identity, progress,
  completion, recovery, menu, field, and accessibility keys through the string
  catalog. The repository localization boundary moved from 200 to 174 raw
  SwiftUI literals without translating OCR or relationship evidence.
- Added a dark AX5 Simplified Chinese UI test that opens the original image,
  verifies localized speaker choices and unresolved semantics, expands optional
  relationship fields, and proves the supplied English evidence is unchanged.
  The executable result is
  `/tmp/talent-signal-ios-capture-localization-v4.xcresult`.
- Completed the cross-surface audit: the familiar top navigation and bottom
  global composer remain unchanged; Web and iOS text, image, voice, contact
  create/attach/identity review, and reversible merge paths retain their
  explicit consequence and receipt boundaries.
- Simplified the iOS Ask empty session after Level 1 Simulator evidence exposed
  a repeated relationship heading, a clipped horizontal prompt strip, and an
  AX5 wall of three oversized prompt rows. The relationship selector is now the
  single context header and optional starters live in one native menu.
- Fixed AX5 composer icon spill by keeping SF Symbols at an optical 17 pt while
  growing their circular controls from 44 to 52 pt at accessibility categories.
  Standard English and Simplified Chinese dark AX5 screenshots now show an
  input-first, single-column session with the composer fully reachable.
- Preserved the original Today / Sessions / People navigation and bottom global
  input exactly where the user requested; the refinement is isolated to the
  Ask session presented from that entry.
- Reworked iOS Sessions and People as retrieval-first surfaces without moving or
  restyling the original top navigation or bottom global input. Both now use a
  shared direct search, compact localized result count, and explicit no-match
  and clear-recovery states.
- Replaced generic Session symbols and verbose timestamps with person initials
  and compact relative time. Crucial Session questions may use two lines, while
  previews remain bounded and the existing swipe and reopen behavior remains.
- Preserved People as stable identity projections across Pursuits. Rows retain
  role, governed-source count, and confirmed-identity clue count; directory
  search is read-only and cannot create, attach, or merge a person.
- Used the AX5 Simulator failure as a release veto and corrected the whole
  surface: chrome retains a stable optical scale, body content continues to
  honor accessibility sizes, initials no longer become ellipses, names no
  longer wrap by letter, and the persistent global input remains reachable.
- Added executable coverage for standard retrieval, search filter, no-result,
  clear recovery, localized result-count semantics, Simplified Chinese dark
  AX5, Today regression, and reopening existing Agent work.
- Replaced the iOS canonical Person sheet with an inline People detail so the
  original Today / Sessions / People navigation and bottom global Agent input
  remain present while inspecting a stable identity. The obsolete sheet route
  was removed from the archive destination model.
- Reframed the living-person page around one grounded question: which Pursuit
  context is current and where should the recruiter continue? Person identity
  remains canonical; role, status, target outcome, and evidence authority stay
  visibly Pursuit-scoped and open the existing governed Pursuit detail.
- Removed the large vermilion identity slogan, generic anti-ranking paragraph,
  and duplicate identity-count summary. The page now leads with name, Current
  work, localized evidence authority, then quiet governed identity rows.
- Used the first Chinese dark AX5 render as a release veto because explanatory
  copy displaced every real relationship context. The final AX5 render keeps
  the name, current Pursuit, scrolling content, top navigation, 44 pt back
  control, and global input reachable without capping body text.
- Added executable People → person → Pursuit → person → directory coverage,
  standard and Chinese dark AX5 screenshots, and deterministic preview checks
  for distinct Sources, Identity clues, and Contexts rows. The broader
  regression passed six tests and explicitly skipped two unavailable canonical
  fixture tests rather than substituting preview data for backend proof.
- Replaced the remaining root-level iOS Pursuit sheet with an inline Pursuit
  room inside the archive content layer. The existing Today / Sessions / People
  header and bottom global Agent input were not moved or restyled; People state
  remains alive underneath so Back returns to the same Person.
- Kept Proposal review as a focused sheet and preserved owned-action draft,
  recovery, canonical receipt, and no-external-write boundaries. Route changes
  still carry no execution authority.
- Reordered Pursuit around the canonical current frame: Target outcome, Target
  date, Milestone, Current blocker, and Next action. Decision authority,
  confirmation, and type now follow the work controls as an audit record.
- Used the first Chinese dark AX5 render as a release veto because title and
  status chrome consumed the viewport. Their optical scale is now bounded while
  body evidence remains uncapped; definition rows stack vertically at
  accessibility sizes and Current frame begins before the persistent input.
- Executable standard and AX5 continuity tests passed 2/2 with zero failures in
  `/tmp/talent-signal-ios-pursuit-global-frame.xcresult`; the corrected final
  AX5 rerun passed 1/1 in
  `/tmp/talent-signal-ios-pursuit-global-frame-v2.xcresult`.
- Compared two AX5 Pursuit structures and selected the governed-row direction:
  Target outcome now begins Current frame before Target date, Milestone,
  Current blocker, and Next action. This preserves uncapped evidence while
  establishing a visible semantic anchor above the persistent global input.
- Localized the full Pursuit interface boundary into Simplified Chinese,
  including status, field labels, dates, evidence authority, proposal states,
  action controls, audit receipts, and recovery copy. Recruiter-owned content
  remains in its original language and no canonical state is translated.
- Added stable Current frame semantics and executable assertions for standard
  English and Chinese dark AX5. The AX5 run passed 1/1 in
  `/tmp/talent-signal-ios-pursuit-localized-v2.xcresult`; the standard run
  passed 1/1 in
  `/tmp/talent-signal-ios-pursuit-localized-standard.xcresult`. Final renders
  are recorded in `design-qa.md`.
- Reframed iOS Today around evidence before consequence. Proposed change,
  target outcome, target date, evidence/owner, and Review proposal now form one
  ordered decision frame; AI branding and the redundant Open Pursuit action
  were removed.
- Moved raw target dates, observed timestamps, source time zones, and evidence
  state through the projection without preformatted English. Shared language
  helpers now own localized workspace values, dates, evidence freshness, and
  authority explanations.
- Used two successive Chinese dark AX5 renders as release vetoes despite green
  tests. The first exposed an oversized clipped calendar glance and mixed
  English target outcome; the second exposed a clipped localized date suffix
  inside the fixed date tile. The final glance is bounded, retains its complete
  VoiceOver label, and shows a locale-safe numeric day.
- Proved standard Today and Chinese dark AX5 with three focused model and
  localization tests plus two UI journeys in
  `/tmp/talent-signal-ios-today-evidence-first-v4.xcresult`. The final visual
  correction passed independently in
  `/tmp/talent-signal-ios-today-evidence-first-v6.xcresult`.
- Preserved the original Today / Sessions / People navigation and bottom global
  Agent input without moving or restyling either surface. AX5 body content
  remains readable and scrollable; the compact calendar alone uses a bounded
  optical scale because it is a secondary glance with full accessibility text.
