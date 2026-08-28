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

## Progress — 2026-08-29 natural-contact slice

- Removed the remaining form-first chrome from an empty global Ask. The
  relationship selector is absent until a message actually needs relationship
  context; prompt suggestions disappear once the recruiter starts composing.
- Kept the clarification safe and recoverable. The original message remains in
  the composer, no Agent request or tool write occurs on the first arrow tap,
  no-match search has a 44-point clear action, and scope transitions follow
  Reduce Motion.
- Rejected the first AX5 clarification render even though its UI test passed:
  horizontal chips clipped `Chief Product Officer search`. At accessibility
  sizes the selected structure now moves complete full-width relationship rows
  into the conversation scroll above the pinned composer; standard sizes keep
  the lighter horizontal treatment.
- Five input-first, contact, restoration, and clarification journeys pass in
  `/tmp/talent-signal-progressive-scope-ui.xcresult`; final standard and Chinese
  dark AX5 clarification pass in
  `/tmp/talent-signal-progressive-scope-scroll-ui.xcresult`; and an existing
  contextual Session preserves exact relationship scope and no autofocus in
  `/tmp/talent-signal-progressive-scope-context-ui-retry.xcresult`.
- The final current-code matrix consolidates empty, one-tap typing, relaunch,
  clarification/no-match, Chinese dark AX5, and contextual Session coverage as
  six passes with zero failures in
  `/tmp/talent-signal-progressive-scope-final-ui.xcresult`.
- Removed the last command-language dependency from the iOS global input and
  Web contact parser. A concise note such as `Maya Chen, maya@example.com,
  Chief Product Officer` or `陈晓 xiao.chen@example.com，产品负责人搜索` now stages
  the same reviewable contact proposal without `Add`, `Create`, or a form.
- Kept interpretation bounded and layered. A deterministic exact-clue parser
  owns the high-precision path; iOS may use an on-device Foundation Models
  structured-output fallback for narrative phrasing. Every accepted name,
  identity clue, and relationship context must be an exact substring of the
  recruiter's immutable source message. Model failure, invention, or
  unavailability cannot create authority.
- Preserved the ordinary Ask path. Questions such as `Can you check Maya Chen,
  maya@example.com?` are not diverted into contact tools; when unscoped they
  advance to the existing relationship clarification with the exact draft
  retained.
- Made interpretation cancellable and recoverable in the unchanged bottom
  composer. The Agent exposes one quiet `Understanding this message…` row; a
  recruiter can cancel it without losing a character. The final button remains
  the familiar Send affordance instead of previewing system routing through a
  command or scope icon.
- Kept the authority chain explicit: source note -> interpretation proposal ->
  account-scoped canonical lookup -> unselected create, attach, or unresolved
  review -> recruiter confirmation -> canonical readback and receipt. Merge
  remains a separate reversible identity-maintenance preview and is never an
  interpretation side effect.
- The final focused iOS model suite passed 22/22 in
  `/tmp/talent-signal-contact-intent-unit-literal-proof.xcresult`, including natural
  English and Chinese, ordinary questions, pronouns, narrative fallback,
  invented or merely normalized model fields, unavailable/error fallback, and
  old persisted drafts.
  Web contact-intake tests passed as part of 270 passing tests with one skip;
  Web typecheck also passed.
- Three new iOS interaction tests passed in
  `/tmp/talent-signal-contact-intent-ui-complete.xcresult`: natural contact
  input, ordinary identity-question routing, and interruption cancellation.
  Simplified Chinese dark AX5 passed independently in
  `/tmp/talent-signal-contact-intent-ax5-zh-ui.xcresult`.
- The final single-spinner interpretation render and exact-draft cancellation
  passed 1/1 in
  `/tmp/talent-signal-contact-intent-cancel-final-ui.xcresult`; its inspected
  screenshot is
  `/tmp/contact-intent-final.KlGGWf/878E7739-4FE1-4F60-9E28-D430ED0303AE.png`.
- Canonical fixture-backed proof used the current local API rather than preview
  authority. No-match create and confirmed-owner attach passed in
  `/tmp/talent-signal-contact-intent-canonical-live-ui.xcresult`; the corrected
  current-versus-historical conflict path passed in
  `/tmp/talent-signal-contact-intent-conflict-live-proof2-ui.xcresult`. Each
  path required an explicit identity decision and restored its terminal receipt
  from Sessions.
- Remaining proof boundary: the deterministic and injected-model paths are
  executable in Simulator, but the actual Apple Intelligence Foundation Models
  runtime still needs a compatible physical-device run. Until then the
  deterministic parser and clarification fallback remain the production-safe
  behavior when the model is unavailable.
